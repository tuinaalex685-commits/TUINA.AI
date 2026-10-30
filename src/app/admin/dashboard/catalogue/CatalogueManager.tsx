"use client";

import React, { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Badge } from '@/components/ui/Badge/Badge';
import { useRouter } from 'next/navigation';
import {
  publishToCatalog,
  removeFromCatalog,
  setCatalogActive,
  reorderCatalog,
  renameCatalogEntry,
  setCatalogNiveau,
  preparerEtudesCatalogue,
} from '@/app/actions/catalog';
import { NIVEAUX } from '@/lib/profileShared';

type CatalogEntry = { id: string; etude_cours_id: string; titre_affiche: string; matiere: string | null; ordre: number; actif: boolean; niveau?: string | null };
type PublishableCourse = { id: string; pdf_id: string; created_at: string; documentNom: string };

export default function CatalogueManager({ initialEntries, publishableCourses }: { initialEntries: CatalogEntry[]; publishableCourses: PublishableCourse[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const [selectedCoursId, setSelectedCoursId] = useState('');
  const [titre, setTitre] = useState('');
  const [matiere, setMatiere] = useState('');
  const [niveau, setNiveau] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitre, setEditTitre] = useState('');
  const [editMatiere, setEditMatiere] = useState('');

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (!selectedCoursId || !titre.trim()) {
      setMessage("Choisis un cours et donne-lui un titre affiché.");
      return;
    }
    setActiveId('publish');
    startTransition(async () => {
      const res = await publishToCatalog(selectedCoursId, titre, matiere, niveau || null);
      if (res.error) setMessage(res.error);
      else {
        setTitre(''); setMatiere(''); setNiveau(''); setSelectedCoursId('');
        router.refresh();
      }
      setActiveId(null);
    });
  };

  const handleToggleActive = (id: string, actif: boolean) => {
    setActiveId(`${id}-toggle`);
    startTransition(async () => {
      await setCatalogActive(id, !actif);
      router.refresh();
      setActiveId(null);
    });
  };

  const handleRemove = (id: string, titreAffiche: string) => {
    if (!confirm(`Retirer "${titreAffiche}" du catalogue ? Le cours original et son contenu ne sont pas touchés — tu pourras le republier plus tard.`)) return;
    setActiveId(`${id}-remove`);
    startTransition(async () => {
      await removeFromCatalog(id);
      router.refresh();
      setActiveId(null);
    });
  };

  const handleMove = (entry: CatalogEntry, direction: -1 | 1) => {
    const sorted = [...initialEntries].sort((a, b) => a.ordre - b.ordre);
    const idx = sorted.findIndex(e => e.id === entry.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    setActiveId(`${entry.id}-move`);
    startTransition(async () => {
      await reorderCatalog([
        { id: entry.id, ordre: other.ordre },
        { id: other.id, ordre: entry.ordre },
      ]);
      router.refresh();
      setActiveId(null);
    });
  };

  // Niveau d'un cours publié : appliqué immédiatement (filtre du catalogue gratuit côté serveur).
  const handleNiveau = (id: string, value: string) => {
    setActiveId(`${id}-niveau`);
    startTransition(async () => {
      const res = await setCatalogNiveau(id, value || null);
      if (res.error) setMessage(res.error);
      router.refresh();
      setActiveId(null);
    });
  };

  const startEdit = (entry: CatalogEntry) => {
    setEditingId(entry.id);
    setEditTitre(entry.titre_affiche);
    setEditMatiere(entry.matiere || '');
  };

  const handleSaveEdit = (id: string) => {
    setActiveId(`${id}-edit`);
    startTransition(async () => {
      await renameCatalogEntry(id, editTitre, editMatiere);
      setEditingId(null);
      router.refresh();
      setActiveId(null);
    });
  };

  // Prépare d'avance l'Étude guidée (analyse + toutes les leçons) des cours publiés : les étudiants
  // du catalogue n'attendent plus et ne déclenchent aucune génération.
  const handlePreparer = () => {
    setActiveId('preparer');
    setMessage('');
    startTransition(async () => {
      const res = await preparerEtudesCatalogue();
      setMessage('error' in res && res.error ? res.error : `Préparation lancée pour ${(res as { count?: number }).count ?? 0} cours. Elle se poursuit en arrière-plan (quelques minutes par cours).`);
      setActiveId(null);
    });
  };

  const sortedEntries = [...initialEntries].sort((a, b) => a.ordre - b.ordre);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--spacing-standard)' }}>
        <Button type="button" onClick={handlePreparer} disabled={isPending && activeId === 'preparer'}>
          {isPending && activeId === 'preparer' ? 'Lancement…' : 'Préparer les Études guidées du catalogue'}
        </Button>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-2)' }}>Analyse et leçons générées une seule fois : ensuite, l’étude est instantanée pour les étudiants.</span>
      </div>
      <form onSubmit={handlePublish} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-standard)', alignItems: 'end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="cours-a-publier" style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Cours prêt à publier</label>
          <select
            id="cours-a-publier"
            value={selectedCoursId}
            onChange={(e) => setSelectedCoursId(e.target.value)}
            style={{ minHeight: '48px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--rule-strong)', background: 'var(--paper)', color: 'var(--ink)' }}
          >
            <option value="">— Choisir —</option>
            {publishableCourses.map(c => (
              <option key={c.id} value={c.id}>{c.documentNom}</option>
            ))}
          </select>
          {publishableCourses.length === 0 && (
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Aucun cours prêt disponible (déjà tous publiés, ou aucun cours généré).</span>
          )}
        </div>
        <Input label="Titre affiché aux étudiants" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex: Droit constitutionnel" />
        <Input label="Matière (optionnel)" value={matiere} onChange={(e) => setMatiere(e.target.value)} placeholder="Ex: Droit public" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="niveau-publication" style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Niveau</label>
          <select id="niveau-publication" value={niveau} onChange={(e) => setNiveau(e.target.value)} style={{ minHeight: '48px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--rule-strong)', background: 'var(--paper)' }}>
            <option value="">Tous les niveaux</option>
            {NIVEAUX.map((n) => <option key={n.code} value={n.code}>{n.court}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={isPending && activeId === 'publish'} style={{ whiteSpace: 'nowrap' }}>
          {isPending && activeId === 'publish' ? 'Publication...' : 'Publier au catalogue'}
        </Button>
      </form>

      {message && <p style={{ color: 'var(--color-error)', margin: 0, fontSize: '14px' }}>{message}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Ordre</th>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Titre affiché</th>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Matière</th>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Niveau</th>
              <th style={{ padding: 'var(--spacing-small) 0' }}>Statut</th>
              <th style={{ padding: 'var(--spacing-small) 0', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry, idx) => (
              <tr key={entry.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: 'var(--spacing-standard) 0' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => handleMove(entry, -1)} disabled={idx === 0 || isPending} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: 'var(--color-text-secondary)' }}>↑</button>
                    <button onClick={() => handleMove(entry, 1)} disabled={idx === sortedEntries.length - 1 || isPending} style={{ background: 'none', border: 'none', cursor: idx === sortedEntries.length - 1 ? 'default' : 'pointer', color: 'var(--color-text-secondary)' }}>↓</button>
                  </div>
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0', fontWeight: 500 }}>
                  {editingId === entry.id ? (
                    <Input label="Titre" value={editTitre} onChange={(e) => setEditTitre(e.target.value)} />
                  ) : entry.titre_affiche}
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0', color: 'var(--color-text-secondary)' }}>
                  {editingId === entry.id ? (
                    <Input label="Matière" value={editMatiere} onChange={(e) => setEditMatiere(e.target.value)} placeholder="Matière" />
                  ) : (entry.matiere || '—')}
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0' }}>
                  <select
                    aria-label={`Niveau de ${entry.titre_affiche}`}
                    value={entry.niveau || ''}
                    onChange={(e) => handleNiveau(entry.id, e.target.value)}
                    disabled={isPending && activeId === `${entry.id}-niveau`}
                    style={{ minHeight: '36px', padding: '0 8px', borderRadius: '8px', border: '1px solid var(--rule-strong)', background: 'var(--paper)', fontWeight: 600 }}
                  >
                    <option value="">Tous</option>
                    {NIVEAUX.map((n) => <option key={n.code} value={n.code}>{n.court}</option>)}
                  </select>
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0' }}>
                  <Badge status={entry.actif ? 'mastered' : 'review'}>{entry.actif ? 'actif' : 'désactivé'}</Badge>
                </td>
                <td style={{ padding: 'var(--spacing-standard) 0', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {editingId === entry.id ? (
                      <>
                        <Button variant="secondary" onClick={() => handleSaveEdit(entry.id)} disabled={isPending && activeId === `${entry.id}-edit`} style={{ padding: '6px 12px', fontSize: '12px' }}>
                          {isPending && activeId === `${entry.id}-edit` ? 'Sauvegarde...' : 'Sauvegarder'}
                        </Button>
                        <Button variant="secondary" onClick={() => setEditingId(null)} style={{ padding: '6px 12px', fontSize: '12px' }}>Annuler</Button>
                      </>
                    ) : (
                      <>
                        <Button variant="secondary" onClick={() => startEdit(entry)} style={{ padding: '6px 12px', fontSize: '12px' }}>Renommer</Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleToggleActive(entry.id, entry.actif)}
                          disabled={isPending && activeId === `${entry.id}-toggle`}
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          {isPending && activeId === `${entry.id}-toggle` ? 'En cours...' : entry.actif ? 'Désactiver' : 'Réactiver'}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleRemove(entry.id, entry.titre_affiche)}
                          disabled={isPending && activeId === `${entry.id}-remove`}
                          style={{ padding: '6px 12px', fontSize: '12px', color: '#e53e3e', borderColor: '#fc8181' }}
                        >
                          {isPending && activeId === `${entry.id}-remove` ? 'Retrait...' : 'Retirer'}
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sortedEntries.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 'var(--spacing-large) 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  Aucun cours publié au catalogue pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
