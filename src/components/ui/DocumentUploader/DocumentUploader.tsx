"use client";

import React, { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button/Button';
import { registerDocument } from '@/app/actions/documents';
import styles from './DocumentUploader.module.css';

interface DocumentUploaderProps {
  chapitreId?: string;
  matiereId?: string;
  coursId?: string;
  onUploadComplete: () => void;
}

export function DocumentUploader({ chapitreId, matiereId, coursId, onUploadComplete }: DocumentUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation stricte du type PDF
    if (file.type !== 'application/pdf') {
      setError("Le fichier doit être au format PDF.");
      return;
    }

    // Limite de taille : un PDF trop lourd fait planter (OOM/timeout) le worker pdf-parse + Gemini.
    const MAX_SIZE_MB = 25;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Le fichier est trop volumineux (max ${MAX_SIZE_MB} Mo). Réduisez ou scindez votre PDF.`);
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Non authentifié");

      // 1. Upload vers le bucket Supabase Storage
      const fileExt = 'pdf';
      const parentId = coursId || matiereId || chapitreId || 'unknown';
      const fileName = `${user.id}/${parentId}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw new Error("Erreur lors de l'envoi du fichier : " + uploadError.message);

      // 2. Enregistrement côté SERVEUR : il vérifie le dossier, la taille réelle et les
      //    rattachements, puis construit lui-même l'URL (plus d'insertion depuis le navigateur).
      const res = await registerDocument({
        path: fileName,
        nom: file.name,
        chapitreId: chapitreId || null,
        matiereId: matiereId || null,
        coursId: coursId || null,
      });
      if ('error' in res && res.error) {
        await supabase.storage.from('documents').remove([fileName]).catch(() => {});
        throw new Error(res.error);
      }

      // Succès
      if (fileInputRef.current) fileInputRef.current.value = '';
      onUploadComplete();
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={styles.uploaderContainer}>
      <div 
        className={styles.dropZone}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        <div className={styles.icon}>📄</div>
        <div className={styles.text}>
          {isUploading ? (
            <span style={{ color: 'var(--color-primary)' }}>Importation en cours...</span>
          ) : (
            <>
              <strong>Cliquez pour importer un PDF</strong>
              <span className={styles.subText}>ou glissez-déposez le fichier ici</span>
            </>
          )}
        </div>
        <input 
          type="file" 
          accept="application/pdf"
          style={{ display: 'none' }}
          ref={fileInputRef}
          onChange={handleFileChange}
          disabled={isUploading}
        />
      </div>
      
      {error && (
        <div className={styles.errorAlert}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
