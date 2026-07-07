"use client";

import React, { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { createAccessCode, updateAccessCodeStatus, deleteAccessCode } from '@/app/actions/admin';
import { Badge } from '@/components/ui/Badge/Badge';
import { useRouter } from 'next/navigation';

export default function AccessCodeManager({ initialCodes }: { initialCodes: any[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [customCode, setCustomCode] = useState('');
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

    const res = await createAccessCode(customCode);
    if (res.error) setMessage(res.error);
    else {
      setMessage("Code ajouté avec succès !");
      setCustomCode(''); // Clear the input
      router.refresh();
    }
    setLoading(false);
  };

  const handleStatusChange = (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    setActiveActionId(`${id}-status`);
    startTransition(async () => {
      await updateAccessCodeStatus(id, newStatus as any);
      router.refresh();
      setActiveActionId(null);
    });
  };

  const handleDelete = (id: string, userEmail: string | null) => {
    if (confirm("Voulez-vous vraiment supprimer cet accès ?")) {
      setActiveActionId(`${id}-delete`);
      startTransition(async () => {
        await deleteAccessCode(id, userEmail || '');
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

      {message && <p style={{ color: 'var(--color-primary)', margin: 0, fontSize: '14px' }}>{message}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Email</th>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Code d'accès</th>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Statut</th>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Date</th>
              <th style={{ padding: 'var(--spacing-small) 0', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialCodes.map(code => (
              <tr key={code.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: 'var(--spacing-standard) 0', fontWeight: 500 }}>
                  {code.email ? code.email : <span style={{color: 'var(--color-text-secondary)', fontStyle: 'italic'}}>Libre (Non assigné)</span>}
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0' }}>
                  <code style={{ background: 'var(--color-bg-secondary)', padding: '4px 8px', borderRadius: '4px', color: 'var(--color-primary)' }}>
                    {code.code}
                  </code>
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0' }}>
                  <Badge status={code.status === 'active' ? 'mastered' : 'review'}>
                    {code.status}
                  </Badge>
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0', color: 'var(--color-text-secondary)' }}>
                  {new Date(code.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <Button 
                      variant="secondary" 
                      onClick={() => handleStatusChange(code.id, code.status)}
                      disabled={isPending && activeActionId === `${code.id}-status`}
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      {isPending && activeActionId === `${code.id}-status` ? 'En cours...' : code.status === 'active' ? 'Désactiver' : 'Activer'}
                    </Button>
                    <Button 
                      variant="secondary" 
                      onClick={() => handleDelete(code.id, code.email)}
                      disabled={isPending && activeActionId === `${code.id}-delete`}
                      style={{ padding: '6px 12px', fontSize: '12px', color: '#e53e3e', borderColor: '#fc8181' }}
                    >
                      {isPending && activeActionId === `${code.id}-delete` ? 'Suppression...' : 'Supprimer'}
                    </Button>
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
