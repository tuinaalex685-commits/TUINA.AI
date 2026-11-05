"use client";

import React, { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { createAccessCode, updateAccessCodeStatus, deleteAccessCode, purgeUser } from '@/app/actions/admin';
import { Badge } from '@/components/ui/Badge/Badge';
import { useRouter } from 'next/navigation';

export default function AccessCodeManager({ initialCodes }: { initialCodes: any[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [reserveManuel, setReserveManuel] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    
    if (!customCode.trim()) {
      setMessage("Veuillez saisir un code.");
      setLoading(false);
      return;
    }

    const res = await createAccessCode(customCode, reserveManuel);
    if (res.error) setMessage(res.error);
    else {
      setMessage("Code ajouté avec succès !");
      setCustomCode(''); // Clear the input
      router.refresh();
    }
    setLoading(false);
  };

  // Un code actif dont le mois est écoulé ne donne plus le Premium : l'étudiant est repassé
  // en Free. « Réactiver » repart pour un mois à partir d'aujourd'hui.
  // Heure de référence figée au montage (un rendu doit rester pur) ; router.refresh() la renouvelle.
  const [now] = useState(() => Date.now());
  const isExpired = (code: any) => !!code.expires_at && new Date(code.expires_at).getTime() <= now;
  const isLive = (code: any) => code.status === 'active' && !isExpired(code);

  const handleStatusChange = (id: string, live: boolean) => {
    const newStatus = live ? 'inactive' : 'active';
    setActiveActionId(`${id}-status`);
    startTransition(async () => {
      await updateAccessCodeStatus(id, newStatus as any);
      router.refresh();
      setActiveActionId(null);
    });
  };

  // BLOCAGE (fraude, décision particulière) : différent de « Désactiver ». Un code désactivé est
  // réactivé automatiquement si l'étudiant paie ; un code BLOQUÉ ne l'est jamais (migration 13) :
  // le paiement est conservé et la commande attend une décision dans « Paiements ».
  const handleBlock = (id: string, userEmail: string | null) => {
    if (!confirm(`Bloquer ${userEmail || 'ce code'} ?\n\nL'étudiant repasse en gratuit et ne pourra PAS se réactiver en payant en ligne. Pour lever le blocage : « Réactiver (1 mois) ».`)) return;
    setActiveActionId(`${id}-block`);
    startTransition(async () => {
      await updateAccessCodeStatus(id, 'blocked');
      router.refresh();
      setActiveActionId(null);
    });
  };

  const handleDelete = (id: string, userEmail: string | null) => {
    if (confirm("Supprimer ce code ?\n\nLe compte de l’étudiant est conservé : il repasse simplement en version gratuite.")) {
      setActiveActionId(`${id}-delete`);
      startTransition(async () => {
        await deleteAccessCode(id, userEmail || '');
        router.refresh();
        setActiveActionId(null);
      });
    }
  };

  const handlePurge = (id: string, userEmail: string | null) => {
    if (!userEmail) { alert("Ce code n'est lié à aucun compte : rien à purger."); return; }
    if (confirm(`⚠️ PURGE DÉFINITIVE de ${userEmail} ?\n\nCela supprime le COMPTE et TOUTES ses données (documents, cours, flashcards, évaluations, rédactions, progression).\n\nCette action est IRRÉVERSIBLE.`)) {
      setActiveActionId(`${id}-purge`);
      startTransition(async () => {
        const res = await purgeUser(userEmail);
        if (res?.error) { alert(res.error); }
        router.refresh();
        setActiveActionId(null);
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)'}}>
      <form onSubmit={handleGenerate} style={{ display: 'flex', gap: 'var(--spacing-standard)', alignItems: 'flex-end', maxWidth: '500px' }}>
        <Input 
          label="Nouveau code d'accès"
          value={customCode}
          onChange={(e) => setCustomCode(e.target.value)}
          placeholder="Ex: DROIT-2026"
          required
        />
        <Button type="submit" disabled={loading} style={{ whiteSpace: 'nowrap', marginBottom: '4px' }}>
          {loading ? 'Création...' : 'Ajouter le code'}
        </Button>
      </form>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: 'var(--color-text-secondary)', maxWidth: 560, marginTop: -8 }}>
        <input type="checkbox" checked={reserveManuel} onChange={(e) => setReserveManuel(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <strong style={{ color: 'var(--color-text-main)' }}>Réservé à un envoi WhatsApp.</strong>{' '}
          Coche si tu donnes ce code toi-même : il ne sera jamais attribué à un paiement en ligne.
          Sans la case, il sert de stock pour les paiements en ligne.
        </span>
      </label>

      {message && <p style={{ color: 'var(--color-primary)', margin: 0, fontSize: '14px' }}>{message}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Email</th>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Code d'accès</th>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Statut</th>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Créé le</th>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Premium jusqu'au</th>
              <th style={{ padding: 'var(--spacing-small) 0', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialCodes.map(code => (
              <tr key={code.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: 'var(--spacing-standard) 0', fontWeight: 500 }}>
                  {code.email ? code.email : <span style={{color: 'var(--color-text-secondary)', fontStyle: 'italic'}}>{code.reserve_manuel ? 'Libre · réservé WhatsApp' : 'Libre · vente en ligne'}</span>}
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0' }}>
                  <code style={{ background: 'var(--color-bg-secondary)', padding: '4px 8px', borderRadius: '4px', color: 'var(--color-primary)' }}>
                    {code.code}
                  </code>
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0' }}>
                  <Badge status={isLive(code) ? 'mastered' : 'review'}>
                    {isLive(code) ? 'actif' : code.status === 'active' ? 'expiré' : code.status === 'blocked' ? 'bloqué' : 'inactif'}
                  </Badge>
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0', color: 'var(--color-text-secondary)' }}>
                  {new Date(code.created_at).toLocaleDateString('fr-FR')}
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0', color: isExpired(code) ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
                  {code.expires_at ? new Date(code.expires_at).toLocaleDateString('fr-FR') : code.email ? '—' : "à l'activation"}
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <Button 
                      variant="secondary" 
                      onClick={() => handleStatusChange(code.id, isLive(code))}
                      disabled={isPending && activeActionId === `${code.id}-status`}
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      {isPending && activeActionId === `${code.id}-status` ? 'En cours...' : isLive(code) ? 'Désactiver' : code.email ? 'Réactiver (1 mois)' : 'Activer'}
                    </Button>
                    {code.email && code.status !== 'blocked' && (
                      <Button
                        variant="secondary"
                        onClick={() => handleBlock(code.id, code.email)}
                        disabled={isPending && activeActionId === `${code.id}-block`}
                        title="Fraude ou décision particulière : empêche la réactivation par paiement en ligne"
                        style={{ padding: '6px 12px', fontSize: '12px', color: '#9A5B00', borderColor: '#F1D9A8' }}
                      >
                        {isPending && activeActionId === `${code.id}-block` ? 'Blocage...' : 'Bloquer'}
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => handleDelete(code.id, code.email)}
                      disabled={isPending && activeActionId === `${code.id}-delete`}
                      style={{ padding: '6px 12px', fontSize: '12px', color: '#e53e3e', borderColor: '#fc8181' }}
                    >
                      {isPending && activeActionId === `${code.id}-delete` ? 'Suppression...' : 'Supprimer le code'}
                    </Button>
                    {code.email && (
                      <Button
                        variant="secondary"
                        onClick={() => handlePurge(code.id, code.email)}
                        disabled={isPending && activeActionId === `${code.id}-purge`}
                        title="Supprime définitivement le compte et toutes ses données"
                        style={{ padding: '6px 12px', fontSize: '12px', color: '#fff', background: '#c53030', borderColor: '#c53030' }}
                      >
                        {isPending && activeActionId === `${code.id}-purge` ? 'Purge...' : 'Purge déf.'}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {initialCodes.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 'var(--spacing-large) 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  Aucun accès généré pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
