"use client";

import React, { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button/Button';
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

    setIsUploading(true);
    setError(null);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Non authentifié");

      // 1. Upload vers le bucket Supabase Storage
      const fileExt = file.name.split('.').pop();
      const parentId = coursId || matiereId || chapitreId || 'unknown';
      const fileName = `${user.id}/${parentId}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw new Error("Erreur lors de l'envoi du fichier : " + uploadError.message);

      // 2. Récupération de l'URL publique
      const { data: publicUrlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      // 3. Enregistrement des métadonnées dans la base de données
      console.log("=== DEBUG UPLOAD ===");
      console.log("1. User ID envoyé:", user.id);
      
      const payload = {
        nom: file.name,
        type: 'pdf', 
        url: publicUrlData.publicUrl, 
        url_fichier: publicUrlData.publicUrl,
        taille: file.size,
        chapitre_id: chapitreId || null,
        matiere_id: matiereId || null,
        user_id: user.id
      };
      console.log("2. Payload d'insertion (table documents):", payload);

      const { data: insertData, error: dbError } = await supabase
        .from('documents')
        .insert([payload])
        .select('*'); // Demander le retour de la ligne insérée pour loguer

      console.log("3. Réponse Supabase (Erreur):", dbError);
      console.log("4. Contenu retourné par Supabase (Succès):", insertData);
      console.log("=====================");

      if (dbError) throw new Error("Erreur base de données : " + dbError.message);

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
