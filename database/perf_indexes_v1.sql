-- ==============================================================================
-- PATCH PERFORMANCE : INDEX POUR LES CHEMINS CHAUDS (SCALE CONNEXIONS)
-- Le middleware s'exécute à CHAQUE requête et filtre access_codes par email via ILIKE.
-- Sans index → scan séquentiel à chaque navigation de chaque utilisateur.
-- Un index GIN trigram accélère les ILIKE (utilisé aussi par actions/auth.ts). Idempotent.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Accélère middleware.ts (.ilike('email', ...)) et auth.ts (claim/lookup par email).
CREATE INDEX IF NOT EXISTS idx_access_codes_email_trgm
  ON public.access_codes USING gin (email gin_trgm_ops);

-- Lookups exacts éventuels sur le code d'accès (déjà UNIQUE, mais on sécurise).
CREATE INDEX IF NOT EXISTS idx_access_codes_status
  ON public.access_codes (status);
