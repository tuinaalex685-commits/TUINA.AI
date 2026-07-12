-- ==============================================================================
-- PATCH ROBUSTESSE : WORKER DE CORRECTION DES RÉDACTIONS
-- Ajoute les colonnes nécessaires au verrou atomique (anti double-traitement),
-- à la récupération des jobs zombies et au diagnostic. Idempotent.
-- À exécuter AVANT de déployer le nouveau worker /api/worker/redaction.
--
-- NB IMPORTANT : PAS de "DEFAULT NOW()" sur updated_at. Un DEFAULT volatile force
-- une réécriture de table qui réveille un trigger existant sur redactions référençant
-- 'created_at' (colonne absente ici) → erreur 42703. Le worker remplit updated_at
-- lui-même à chaque écriture, le défaut est donc inutile.
-- ==============================================================================

-- Horodatage de dernière mise à jour (renseigné par le worker et les server actions).
ALTER TABLE public.redactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Verrou du worker : posé à la prise en charge, remis à NULL en fin de job.
-- Un lock plus vieux que 15 min = worker crashé → le job redevient récupérable (zombie recovery).
ALTER TABLE public.redactions ADD COLUMN IF NOT EXISTS worker_locked_at TIMESTAMPTZ;

-- Dernière erreur rencontrée (diagnostic, non bloquant).
ALTER TABLE public.redactions ADD COLUMN IF NOT EXISTS last_error TEXT;

-- (Optionnel — perf) Index pour piocher le prochain job de la file.
-- NB : la colonne de date de cette table est 'date_creation' (et non 'created_at').
-- CREATE INDEX IF NOT EXISTS idx_redactions_queue
--   ON public.redactions(statut, worker_locked_at, date_creation);
