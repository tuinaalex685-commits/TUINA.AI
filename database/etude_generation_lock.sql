-- ==============================================================================
-- PATCH ANTI-GASPILLAGE GEMINI : VERROU DE GÉNÉRATION ÉTUDE (SINGLE FLIGHT ATOMIQUE)
-- Garantit qu'UN SEUL appel Gemini part par contenu identique (text_hash), même si
-- des centaines d'utilisateurs importent le même PDF simultanément. Le job qui insère
-- le hash (clé primaire) est le générateur unique ; les autres clonent via le cache.
-- TTL 10 min = auto-guérison si le générateur crashe. Idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.etude_generation_locks (
    hash TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

CREATE INDEX IF NOT EXISTS idx_etude_generation_locks_expires
  ON public.etude_generation_locks(expires_at);
