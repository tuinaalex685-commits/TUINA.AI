-- ==============================================================================
-- SINGLE-FLIGHT PAR CONTENU pour le worker ai_jobs (anti thundering herd).
-- Garantit un SEUL appel Gemini par contenu identique même si N jobs concurrents
-- le demandent en même temps : le "leader" génère, les "followers" attendent le
-- cache puis clonent. TTL 5 min = auto-guérison si le leader crashe. Idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.ai_content_locks (
    hash TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_ai_content_locks_expires ON public.ai_content_locks(expires_at);
