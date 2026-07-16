-- ==============================================================================
-- SECTION EXAMEN — EX.2 : SESSIONS D'EXAMEN
-- Une session = un passage d'examen par un étudiant. RLS OWNER-ONLY : chacun ne
-- voit/écrit que ses propres sessions. Le CORRIGÉ n'est PAS ici (il reste dans
-- examen_question_pools, service-role only) : `composition` ne stocke que des
-- références (poolIndex) + ordres d'affichage mélangés, jamais les bonnes réponses.
--
-- Chrono = deadline SERVEUR (colonne deadline). Le statut 'terminé' est calculé
-- serveur (now >= deadline) et finalisé paresseusement ; aucun timer/cron dédié.
-- La note (score) est écrite UNIQUEMENT par le serveur (correction déterministe).
-- Idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.examen_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    source_hash TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'standard',        -- 'standard' (EX.2) | 'adaptatif' (EX.4)
    composition JSONB NOT NULL,                    -- refs (poolIndex) + ordres d'affichage, SANS corrigé
    seed BIGINT,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,    -- réponses de l'étudiant (position -> réponse)
    status TEXT NOT NULL DEFAULT 'in_progress',    -- 'in_progress' | 'submitted'
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline TIMESTAMPTZ NOT NULL,                 -- chrono serveur : réponses rejetées au-delà
    submitted_at TIMESTAMPTZ,
    score NUMERIC(4,2),                            -- note /20 (écrite par le serveur)
    points_obtenus NUMERIC(6,2),
    points_max NUMERIC(6,2),
    theme_results JSONB,                           -- ratio de réussite par (section_ordre, theme_ordre)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_examen_sessions_user ON public.examen_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_examen_sessions_user_doc ON public.examen_sessions(user_id, document_id);

ALTER TABLE public.examen_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "examen_sessions_select_own" ON public.examen_sessions;
CREATE POLICY "examen_sessions_select_own" ON public.examen_sessions FOR SELECT USING (auth.uid() = user_id);
-- Pas de policy INSERT/UPDATE/DELETE : toute écriture passe par le serveur (service role),
-- garantissant que la note et le statut ne peuvent JAMAIS être falsifiés par le client.
