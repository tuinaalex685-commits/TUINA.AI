import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPremium } from '@/lib/plan';
import DashboardManager, { type ResumeItem, type ExamItem } from './DashboardManager';

/**
 * Données de l'accueil, toutes lues en parallèle, et uniquement ce qui sert à décider
 * « que faire maintenant » : reprendre un cours, réviser ce qui est dû, revoir un examen.
 */
export default async function DashboardData({ user }: { user: { id: string; email?: string | null } }) {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [
    premium,
    { count: dueCount },
    { count: flashcardsCount },
    { count: documentsCount },
    { count: redactionsCount },
    { data: lastProgress },
    { data: lastExams },
    { data: objectifs },
    { data: roleRow, error: roleErr },
  ] = await Promise.all([
    isPremium(supabase, user.email),
    supabase.from('flashcards').select('id', { count: 'exact', head: true }).eq('user_id', user.id).lte('next_review', nowIso),
    supabase.from('flashcards').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('redactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('etude_progression_cours').select('cours_id, statut, updated_at').eq('user_id', user.id)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('examen_sessions').select('id, document_id, score, submitted_at').eq('user_id', user.id)
      .eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(3),
    supabase.from('objectifs').select('id, titre, type, cible, progression').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(3),
    // Guide d'accueil : affiché seulement si onboarding_vu = false est lu explicitement.
    supabase.from('user_roles').select('onboarding_vu').eq('user_id', user.id).maybeSingle(),
  ]);

  // « Reprendre » : le dernier cours ouvert, avec le bon lien (document personnel ou catalogue).
  let resume: ResumeItem | null = null;
  if (lastProgress?.cours_id) {
    const { data: cours } = await supabaseAdmin
      .from('etude_cours').select('id, pdf_id').eq('id', lastProgress.cours_id).maybeSingle();
    if (cours?.pdf_id) {
      const [{ data: doc }, { data: catalog }] = await Promise.all([
        supabaseAdmin.from('documents').select('id, nom, user_id').eq('id', cours.pdf_id).maybeSingle(),
        supabaseAdmin.from('catalog_courses').select('id, titre_affiche').eq('etude_cours_id', cours.id).eq('actif', true).maybeSingle(),
      ]);
      if (doc && doc.user_id === user.id) {
        resume = { title: doc.nom, href: `/app/etude/${doc.id}`, finished: lastProgress.statut === 'termine' };
      } else if (catalog) {
        resume = { title: catalog.titre_affiche, href: `/app/etude/catalogue/${catalog.id}`, finished: lastProgress.statut === 'termine' };
      }
    }
  }

  // Titres des documents des derniers examens (documents personnels ou du catalogue).
  const examDocIds = [...new Set((lastExams || []).map((e) => e.document_id).filter(Boolean))] as string[];
  const { data: examDocs } = examDocIds.length
    ? await supabaseAdmin.from('documents').select('id, nom').in('id', examDocIds)
    : { data: [] as { id: string; nom: string }[] };
  const docName = new Map((examDocs || []).map((d) => [d.id, d.nom]));
  const exams: ExamItem[] = (lastExams || []).map((e) => ({
    id: e.id,
    title: (e.document_id && docName.get(e.document_id)) || 'Examen',
    score: e.score === null ? null : Number(e.score),
    date: e.submitted_at,
    documentId: e.document_id,
  }));

  const onboardingSeen = roleErr ? true : (roleRow?.onboarding_vu ?? true);

  return (
    <DashboardManager
      premium={premium}
      resume={resume}
      dueCount={dueCount || 0}
      stats={{
        documents: documentsCount || 0,
        flashcards: flashcardsCount || 0,
        redactions: redactionsCount || 0,
      }}
      exams={exams}
      objectifs={(objectifs || []).map((o) => ({ id: o.id, titre: o.titre || o.type || 'Objectif', progression: o.progression || 0, cible: o.cible || 1 }))}
      onboardingSeen={onboardingSeen}
    />
  );
}
