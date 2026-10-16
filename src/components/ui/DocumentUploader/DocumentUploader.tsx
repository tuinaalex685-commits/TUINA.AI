"use client";

import React, { useState, useRef } from 'react';
import { FileUp, CircleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { registerDocument } from '@/app/actions/documents';
import styles from './DocumentUploader.module.css';

interface DocumentUploaderProps {
  chapitreId?: string;
  matiereId?: string;
  coursId?: string;
  onUploadComplete: (documentId?: string) => void;
}

/** Un PDF trop lourd fait échouer l'extraction de texte côté serveur. */
const MAX_SIZE_MB = 25;

type Phase = 'idle' | 'sending' | 'saving';

const PHASE_LABEL: Record<Exclude<Phase, 'idle'>, string> = {
  sending: 'Envoi du fichier…',
  saving: 'Enregistrement…',
};

function isPdf(file: File): boolean {
  // Certains téléphones Android transmettent un type vide : on vérifie aussi l'extension.
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function DocumentUploader({ chapitreId, matiereId, coursId, onUploadComplete }: DocumentUploaderProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = phase !== 'idle';

  const upload = async (file: File) => {
    if (!isPdf(file)) {
      setError('Ce fichier n’est pas un PDF. Exporte ton cours en PDF puis réessaie.');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Ce fichier dépasse ${MAX_SIZE_MB} Mo. Scinde ton cours en plusieurs PDF (par chapitre, par exemple).`);
      return;
    }

    setError(null);
    setFileName(file.name);
    setPhase('sending');

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('Ta session a expiré. Reconnecte-toi puis réessaie.');

      // 1. Dépôt dans le dossier de l'étudiant (les règles du Storage n'autorisent que celui-ci).
      const parentId = coursId || matiereId || chapitreId || 'doc';
      const path = `${user.id}/${parentId}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: 'application/pdf' });
      if (uploadError) throw new Error('L’envoi a échoué. Vérifie ta connexion puis réessaie.');

      // 2. Enregistrement côté serveur : il vérifie le dossier, la taille réelle et les rattachements.
      setPhase('saving');
      const res = await registerDocument({
        path,
        nom: file.name,
        chapitreId: chapitreId || null,
        matiereId: matiereId || null,
        coursId: coursId || null,
      });
      if ('error' in res && res.error) {
        await supabase.storage.from('documents').remove([path]).catch(() => {});
        throw new Error(res.error);
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
      onUploadComplete('documentId' in res ? res.documentId : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'L’import a échoué. Réessaie.');
    } finally {
      setPhase('idle');
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  return (
    <div className={styles.container}>
      <label
        className={`${styles.zone} ${dragging ? styles.dragging : ''} ${busy ? styles.busy : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className={styles.input}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
          disabled={busy}
        />
        {busy ? (
          <>
            <span className={styles.spinner} aria-hidden />
            <span className={styles.main}>{PHASE_LABEL[phase as Exclude<Phase, 'idle'>]}</span>
            {fileName && <span className={styles.sub}>{fileName}</span>}
          </>
        ) : (
          <>
            <FileUp size={26} className={styles.icon} aria-hidden />
            <span className={styles.main}>Choisir un PDF</span>
            <span className={styles.sub}>ou dépose-le ici · {MAX_SIZE_MB} Mo maximum</span>
          </>
        )}
      </label>

      {error && (
        <p className={styles.error} role="alert">
          <CircleAlert size={16} aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}
