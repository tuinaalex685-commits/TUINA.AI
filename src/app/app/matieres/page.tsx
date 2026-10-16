import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isPremium } from '@/lib/plan';
import PremiumLock from '@/components/premium/PremiumLock';
import { getCurrentUser } from '@/lib/viewer';
import MatiereManager from './MatiereManager';

export const dynamic = 'force-dynamic';

type CountRel = { count: number }[] | null;

export default async function MatieresPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const supabase = await createClient();

  // Organiser ses propres matières n'a de sens qu'avec ses propres cours : c'est le
  // prolongement direct de l'import personnel, donc du Premium.
  if (!(await isPremium(supabase, user.email))) {
    return (
      <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
        <PremiumLock
          titre="Tes Matières"
          description="Organise tes cours comme ton année universitaire : une matière par enseignement, tes cours à l'intérieur, et tes PDF rangés au bon endroit."
          benefices={[
            'Tes propres matières et cours, structurés à ta façon',
            'Chaque PDF rangé dans le bon cours',
            'Une vue claire de ce qui te reste à travailler',
          ]}
        />
      </div>
    );
  }

  // Une seule requête : les matières avec le nombre de cours et de PDF comptés par la base.
  const { data } = await supabase
    .from('matieres')
    .select('id, titre, description, created_at, cours(count), documents(count)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const matieres = (data || []).map((m) => ({
    id: m.id as string,
    titre: m.titre as string,
    description: (m.description as string | null) ?? null,
    created_at: m.created_at as string,
    nbCours: (m.cours as unknown as CountRel)?.[0]?.count ?? 0,
    nbDocuments: (m.documents as unknown as CountRel)?.[0]?.count ?? 0,
  }));

  return <MatiereManager initialMatieres={matieres} />;
}
