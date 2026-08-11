import React from 'react';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;


import { createClient } from '@/lib/supabase/server';
import { getCoursMasteryBreakdown } from '@/lib/etude/mastery';
import { isPremium } from '@/lib/plan';
import PremiumLock from '@/components/premium/PremiumLock';
import RedactionManager from './RedactionManager';

export default async function RedactionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // La Rédaction est Premium de bout en bout : createRedaction refuse déjà côté
  // serveur. On montre ici ce que la fonctionnalité apporte, plutôt que de laisser
  // un compte Free écrire une dissertation entière avant de se heurter à un refus.
  if (!(await isPremium(supabase, user.email))) {
    return (
      <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
        <PremiumLock
          titre="La Rédaction juridique"
          description="Rédige tes dissertations, commentaires d'arrêt et cas pratiques dans SJP, et fais-les corriger par l'IA comme le ferait un chargé de TD."
          benefices={[
            "Correction détaillée de ta copie, argument par argument",
            "Méthodologie appliquée à ton sujet, pas des conseils génériques",
            "Historique de tes versions pour mesurer tes progrès",
            "Rattachement à un cours étudié pour une correction contextualisée",
          ]}
        />
      </div>
    );
  }

  const [{ data: redactions }, coursMastery] = await Promise.all([
    supabase
      .from('redactions')
      .select('*, redaction_versions(*)')
      .eq('user_id', user.id)
      .order('date_creation', { ascending: false }),
    // Soft-gate INC.3 : maîtrise par cours Étude déjà travaillé (lecture seule,
    // vue theme_mastery). Sert le sélecteur facultatif + la bannière de reco.
    // Dégrade en [] si la migration/les vues ne sont pas encore en prod.
    getCoursMasteryBreakdown(supabase, user.id).catch(() => []),
  ]);

  return (
    <div style={{ padding: 'var(--spacing-large) 0', width: '100%' }}>
      <RedactionManager initialRedactions={redactions || []} coursMastery={coursMastery} />
    </div>
  );
}
