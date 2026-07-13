-- ==============================================================================
-- REFONTE UNIFIÉE — CYCLE DE VIE CANONIQUE DES JOBS IA
-- Étend public.ai_jobs (déjà en place pour evaluation/flashcards/redaction) vers le
-- cycle de vie déterministe et y intègre Étude Guidée (type='etude').
--
-- Cycle : pending → processing → generating → saving → completed → failed
--   pending    : créé, pas encore pris (ou en attente d'un retry via next_attempt_at)
--   processing : leasé par un worker (préparation : extraction texte, cache, verrou)
--   generating : appel Gemini en cours
--   saving     : écriture du résultat en base
--   completed  : terminé (result rempli)
--   failed     : échec définitif (après épuisement des tentatives OU erreur permanente)
--
-- Idempotent et SANS DESTRUCTION : n'ajoute que des colonnes/valeurs, convertit
-- l'ancien vocabulaire (queued/done/error) vers le nouveau. Rejouable sans risque.
-- ==============================================================================

-- 1. Nouvelles colonnes (toutes optionnelles / avec défaut → aucun impact sur les lignes existantes).
ALTER TABLE public.ai_jobs
  ADD COLUMN IF NOT EXISTS progress        INT NOT NULL DEFAULT 0,   -- 0..100 pour l'UI (état réel, jamais figé à 95)
  ADD COLUMN IF NOT EXISTS phase           TEXT,                     -- libellé humain optionnel de l'étape courante
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,              -- backoff : ne pas repiocher avant cette date
  ADD COLUMN IF NOT EXISTS last_error      TEXT,                     -- dernière erreur (même si le job retente)
  ADD COLUMN IF NOT EXISTS result_ref      TEXT;                     -- pointeur résultat externe (ex: etude_cours.id)

-- 2. Migration du vocabulaire de statut (ancien → canonique). Sûr : ne touche que les valeurs connues.
UPDATE public.ai_jobs SET status = 'pending'   WHERE status = 'queued';
UPDATE public.ai_jobs SET status = 'completed' WHERE status = 'done';
UPDATE public.ai_jobs SET status = 'failed'    WHERE status = 'error';

-- 3. Index de file d'attente aligné sur la nouvelle logique de sélection (pending + next_attempt_at).
CREATE INDEX IF NOT EXISTS idx_ai_jobs_pickup
  ON public.ai_jobs(status, next_attempt_at, created_at);

-- 4. Index de reprise des jobs morts (in-flight dont le bail a expiré).
CREATE INDEX IF NOT EXISTS idx_ai_jobs_lease
  ON public.ai_jobs(status, lease_until);

-- 5. Verrous de contenu (single-flight anti thundering herd) : déjà créés par ai_content_locks.sql.
--    On garantit ici leur présence (réutilisés par TOUS les types, y compris 'etude').
CREATE TABLE IF NOT EXISTS public.ai_content_locks (
    hash TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_content_locks_expires ON public.ai_content_locks(expires_at);

-- 6. Sécurité anti double-génération sur le résultat Étude : un seul cours 'pret' par contenu.
--    (Le clone cross-utilisateur s'appuie sur generation_hash ; on l'indexe pour des lookups rapides.)
CREATE INDEX IF NOT EXISTS idx_etude_cours_genhash ON public.etude_cours(generation_hash, statut_generation);

-- ==============================================================================
-- Rien d'autre à exécuter. Le worker unifié /api/worker/ai lit désormais le cycle
-- canonique et pilote aussi la génération Étude (résultat stocké dans etude_cours).
-- ==============================================================================
