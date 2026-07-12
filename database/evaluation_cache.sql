-- ==============================================================================
-- PATCH ANTI-GASPILLAGE GEMINI : CACHE DES ÉVALUATIONS
-- Mutualise les évaluations générées par contenu identique : deux étudiants sur le
-- même document + même type + même nombre de questions partagent le même jeu (0 appel
-- Gemini pour le second). Clé unique (source_hash, type, count). Idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.evaluation_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_hash TEXT NOT NULL,
    type TEXT NOT NULL,
    count INTEGER NOT NULL,
    questions JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (source_hash, type, count)
);

CREATE INDEX IF NOT EXISTS idx_evaluation_cache_lookup
  ON public.evaluation_cache(source_hash, type, count);
