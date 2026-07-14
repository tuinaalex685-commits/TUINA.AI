-- ==============================================================================
-- RÉCLAMATION ATOMIQUE D'UN JOB — élimine définitivement le double-lease.
-- Le worker faisait "SELECT candidat" puis "UPDATE" en 2 requêtes (fenêtre TOCTOU) : sous forte
-- concurrence, 2 workers pouvaient rarement réclamer le MÊME job -> double génération Gemini (coût).
-- Cette fonction réclame UN job en UNE seule instruction atomique avec FOR UPDATE SKIP LOCKED :
-- chaque worker verrouille et prend une ligne DIFFÉRENTE, jamais la même. C'est le pattern standard
-- des files de jobs (atomicité + distribution naturelle de la charge en un seul mécanisme).
-- SECURITY DEFINER : exécutable par le service role du worker. Idempotent (CREATE OR REPLACE).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.claim_ai_job(now_ts timestamptz, lease_ts timestamptz)
RETURNS SETOF public.ai_jobs
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.ai_jobs
     SET status = 'processing',
         lease_until = lease_ts,
         updated_at = now_ts
   WHERE id = (
     SELECT id FROM public.ai_jobs
      WHERE ( status IN ('pending','queued')
              AND (next_attempt_at IS NULL OR next_attempt_at <= now_ts) )
         OR ( status IN ('processing','generating','saving')
              AND lease_until < now_ts )
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
   )
  RETURNING *;
$$;
