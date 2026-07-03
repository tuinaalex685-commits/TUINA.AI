import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import styles from './etude.module.css';

export const metadata = {
  title: 'Étude Guidée | Tuina.ai',
};

export default async function EtudeListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 1. Récupérer tous les documents de l'étudiant
  const { data: documents } = await supabase
    .from('documents')
    .select('id, nom, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // 2. Récupérer la progression pour ces documents
  const { data: progressions } = await supabase
    .from('etude_progression_cours')
    .select('cours_id, statut, etude_cours(pdf_id)')
    .eq('user_id', user.id);

  // Maper la progression par pdf_id
  const progressByPdf = new Map();
  if (progressions) {
    progressions.forEach((p: any) => {
      const coursData = Array.isArray(p.etude_cours) ? p.etude_cours[0] : p.etude_cours;
      if (coursData && coursData.pdf_id) {
        progressByPdf.set(coursData.pdf_id, {
          statut: p.statut,
          coursId: p.cours_id
        });
      }
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Étude Guidée</h1>
        <p className={styles.subtitle}>
          Sélectionnez un de vos cours. L&apos;IA va le découper et vous guider pas à pas pour s&apos;assurer que vous avez tout compris.
        </p>
      </div>

      {!documents || documents.length === 0 ? (
        <div className={styles.card} style={{ textAlign: 'center', padding: '64px 24px' }}>
          <p className={styles.subtitle} style={{ marginBottom: '16px' }}>
            Vous n&apos;avez pas encore importé de PDF.
          </p>
          <Link href="/app/bibliotheque">
            <button className={styles.btn} style={{ width: 'auto', padding: '10px 24px' }}>
              Aller dans la Bibliothèque
            </button>
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {documents.map((doc) => {
            const progress = progressByPdf.get(doc.id);
            const status = progress ? progress.statut : 'non_commence';
            const coursId = progress ? progress.coursId : null;
            
            // Pour le MVP, si on n'a pas commencé, on passe le pdfId dans l'URL (ou on le gère via une route spéciale)
            // L'idéal est d'aller sur /app/etude/[pdfId] et que cette page génère le cours si besoin.
            const targetUrl = `/app/etude/${doc.id}`;

            return (
              <div key={doc.id} className={styles.card}>
                <h3 className={styles.cardTitle} title={doc.nom}>{doc.nom}</h3>
                
                {status === 'non_commence' && (
                  <span className={`${styles.cardStatus} ${styles.statusNonCommence}`}>Non commencé</span>
                )}
                {status === 'en_cours' && (
                  <span className={`${styles.cardStatus} ${styles.statusEnCours}`}>En cours d&apos;étude</span>
                )}
                {status === 'termine' && (
                  <span className={`${styles.cardStatus} ${styles.statusTermine}`}>Terminé</span>
                )}

                <Link href={targetUrl} style={{ marginTop: 'auto' }}>
                  <button className={styles.btn}>
                    {status === 'non_commence' ? 'Commencer l\'étude' : 'Reprendre'}
                  </button>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
