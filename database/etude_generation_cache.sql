-- ==============================================================================
-- CACHE DE GÉNÉRATION ÉTUDE PAR CONTENU — garantit UN SEUL appel Gemini réussi par contenu.
-- Sans ce cache, si un leader subit un 503 transitoire et libère le verrou de contenu, un follower
-- en attente devient 2e générateur → 2 appels Gemini payants pour le même contenu (mesuré en réel :
-- 5 générations au lieu de 4). Avec ce cache, le 1er qui génère écrit le JSON AVANT toute étape
-- faillible ; tout follower/retry le lit → jamais de 2e appel. Idempotent.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.etude_generation_cache (
    source_hash TEXT PRIMARY KEY,   -- hash SHA256 du texte (préfixe 'mock:' pour les tests, isolé du réel)
    data        JSONB NOT NULL,     -- JSON pédagogique généré (intelligence + sections + thèmes)
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
