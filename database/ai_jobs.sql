-- ==============================================================================
-- SYSTÈME DE JOBS IA ASYNCHRONES UNIFIÉ (Phase 1 : Évaluations + Flashcards)
-- Source de vérité unique pour toute tâche IA async. Le frontend INSÈRE un job puis
-- OBSERVE son statut ; le worker (cron + déclenchement immédiat) l'exécute côté serveur.
-- Idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ai_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type TEXT NOT NULL,                       -- 'evaluation' | 'flashcards'
    status TEXT NOT NULL DEFAULT 'queued',    -- queued | processing | done | error
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,                             -- sortie / références (evaluationId, etc.)
    error TEXT,
    attempts INT NOT NULL DEFAULT 0,
    content_hash TEXT,
    lease_until TIMESTAMPTZ,                  -- bail du worker (récupération des jobs morts)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- File d'attente : piocher le prochain job à traiter.
CREATE INDEX IF NOT EXISTS idx_ai_jobs_queue ON public.ai_jobs(status, created_at);
-- Observation par l'utilisateur.
CREATE INDEX IF NOT EXISTS idx_ai_jobs_user ON public.ai_jobs(user_id, created_at DESC);

-- RLS : un utilisateur ne voit/insère que ses propres jobs. Le worker utilise le service role (bypass RLS).
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_jobs_select_own" ON public.ai_jobs;
CREATE POLICY "ai_jobs_select_own" ON public.ai_jobs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "ai_jobs_insert_own" ON public.ai_jobs;
CREATE POLICY "ai_jobs_insert_own" ON public.ai_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
