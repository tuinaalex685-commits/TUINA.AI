"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UpgradeCourseUI({ pdfId }: { pdfId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      await fetch('/api/etude/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: pdfId, force: true })
      });
      // On recharge la page, ce qui déclenchera le chargement de l'EtudeEngine (isGenerating=true)
      router.refresh();
    } catch (e) {
      alert("Erreur lors de la mise à jour.");
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', marginTop: '50px', background: 'var(--color-bg-secondary)', borderRadius: '16px', maxWidth: '600px', margin: '50px auto' }}>
      <h2 style={{ color: 'var(--color-text-main)', marginBottom: '16px', fontSize: '24px' }}>Mise à jour requise</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px', lineHeight: '1.6' }}>
        Ce cours a été généré avec l'ancienne version de Tuina (V1). Pour profiter de la nouvelle **Étude Guidée Interactive V2** (QCM, cas pratiques, mémorisation active), le cours doit être regénéré avec la nouvelle IA.
      </p>
      <button 
        onClick={handleUpgrade}
        disabled={loading}
        style={{ 
          padding: '12px 24px', background: 'linear-gradient(90deg, #6366f1, #a855f7)', color: '#FFF', 
          borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', border: 'none', fontWeight: 600, fontSize: '16px'
        }}
      >
        {loading ? "Préparation en cours..." : "Mettre à jour le cours vers la V2"}
      </button>
      <div style={{ marginTop: '20px' }}>
         <button onClick={() => router.push('/app/etude')} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', textDecoration: 'underline' }}>
           Retour à la liste
         </button>
      </div>
    </div>
  );
}
