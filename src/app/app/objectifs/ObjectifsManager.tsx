"use client";

import React, { useState, useEffect, useTransition, useOptimistic } from 'react';
import { Card } from '@/components/ui/Card/Card';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Modal } from '@/components/ui/Modal/Modal';
import { createObjectif, updateObjectifProgress, deleteObjectif } from '@/app/actions/student';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function ObjectifsManager({ initialObjectifs }: { initialObjectifs: any[] }) {
  const router = useRouter();
  
  const [objectifs, setObjectifs] = useState<any[]>(initialObjectifs);
  const [isPending, startTransition] = useTransition();

  const [optimisticObjectifs, addOptimisticObjectif] = useOptimistic(
    objectifs,
    (state: any[], action: { type: 'add' | 'update' | 'delete', data: any }) => {
      if (action.type === 'add') {
        return [action.data, ...state];
      }
      if (action.type === 'update') {
        return state.map(obj => obj.id === action.data.id ? { ...obj, ...action.data } : obj);
      }
      if (action.type === 'delete') {
        return state.filter(obj => obj.id !== action.data.id);
      }
      return state;
    }
  );

  useEffect(() => {
    setObjectifs(initialObjectifs);
  }, [initialObjectifs]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [titre, setTitre] = useState('');
  const [type, setType] = useState('general');
  const [cible, setCible] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Optimistic UI update
    const optimisticId = `temp-${Date.now()}`;
    const newObj = { id: optimisticId, titre, type, cible, progression: 0, created_at: new Date().toISOString() };
    
    startTransition(() => {
      addOptimisticObjectif({ type: 'add', data: newObj });
    });
    
    setTitre('');
    setCible(1);
    setIsModalOpen(false);

    const res = await createObjectif(newObj.titre, newObj.type, newObj.cible);
    if (res.error) {
      setError(res.error);
      router.refresh(); // revert on error
    }
    setLoading(false);
  };

  const handleUpdate = (id: string, current: number, target: number, increment: number) => {
    let newProgression = current + increment;
    if (newProgression < 0) newProgression = 0;
    if (newProgression > target) newProgression = target;
    
    startTransition(async () => {
      addOptimisticObjectif({ type: 'update', data: { id, progression: newProgression } });
      await updateObjectifProgress(id, newProgression);
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Supprimer cet objectif ?')) return;
    
    startTransition(async () => {
      addOptimisticObjectif({ type: 'delete', data: { id } });
      await deleteObjectif(id);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-large)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--color-text-main)' }}>Vos Objectifs</h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-small)' }}>
            Définissez vos buts et suivez votre progression.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>Nouvel Objectif</Button>
      </header>

      {optimisticObjectifs.length === 0 ? (
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--spacing-large)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          <span style={{ fontSize: '48px', marginBottom: 'var(--spacing-small)' }}>🎯</span>
          <h3>Aucun objectif défini</h3>
          <p>Créez votre premier objectif (ex: "Réviser 50 flashcards", "Finir le chapitre 1")</p>
          <Button onClick={() => setIsModalOpen(true)} style={{ marginTop: 'var(--spacing-standard)' }}>Créer un objectif</Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)' }}>
          {optimisticObjectifs.map(obj => {
            const isCompleted = obj.progression >= obj.cible;
            const progressPercent = Math.min(100, Math.round((obj.progression / obj.cible) * 100));
            
            return (
              <Card key={obj.id} style={{ opacity: isCompleted ? 0.7 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: '0 0 8px 0', textDecoration: isCompleted ? 'line-through' : 'none' }}>
                      {obj.titre}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', padding: '4px 8px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '4px' }}>
                        {obj.type === 'general' ? 'Général' : obj.type}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: isCompleted ? 'var(--color-success)' : 'var(--color-primary)' }}>
                        {obj.progression} / {obj.cible}
                      </span>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {!isCompleted && (
                      <Button variant="secondary" onClick={() => handleUpdate(obj.id, obj.progression, obj.cible, 1)} disabled={isPending} style={{ padding: '6px 12px' }}>
                        +1
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => handleDelete(obj.id)} disabled={isPending} style={{ padding: '6px 12px', color: '#e53e3e', borderColor: '#fc8181' }}>
                      Supprimer
                    </Button>
                  </div>
                </div>
                
                {/* Progress bar */}
                <div style={{ marginTop: '16px', height: '8px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progressPercent}%`, backgroundColor: isCompleted ? 'var(--color-success)' : 'var(--color-primary)', transition: 'width 0.3s ease' }} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Créer un objectif">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-standard)' }}>
          <Input 
            label="Que voulez-vous accomplir ?" 
            value={titre} 
            onChange={e => setTitre(e.target.value)} 
            placeholder="Ex: Réviser mes flashcards de Droit Pénal" 
            required 
          />
          <Input 
            label="Quantité cible (ex: 50 flashcards, 1 chapitre)" 
            type="number"
            min="1"
            value={cible.toString()} 
            onChange={e => setCible(parseInt(e.target.value) || 1)} 
            required 
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500 }}>Type d'objectif</label>
            <select 
              value={type} 
              onChange={e => setType(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-main)', color: 'var(--color-text-main)', fontSize: '15px' }}
            >
              <option value="general">Général</option>
              <option value="flashcards">Révision (Flashcards)</option>
              <option value="quiz">Évaluation (Quiz)</option>
              <option value="chapitre">Cours (Chapitre)</option>
            </select>
          </div>
          {error && <p style={{ color: 'red', fontSize: '13px' }}>{error}</p>}
          <Button type="submit" disabled={loading} style={{ alignSelf: 'flex-end', marginTop: 'var(--spacing-small)' }}>
            {loading ? 'Création...' : 'Créer'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
