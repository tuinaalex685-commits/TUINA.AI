-- =============================================================================
-- Migration 07 — Réglages d'administration et suivi du crédit Gemini
-- =============================================================================
-- 1. admin_settings : réglages modifiables depuis le tableau de bord admin (crédit Gemini
--    rechargé, date de recharge, plafond journalier). Service role uniquement.
-- 2. ai_spend_since(ts) : somme des coûts IA depuis une date, calculée PAR LA BASE (une seule
--    ligne renvoyée), au lieu de relire toutes les lignes de saas_metrics à chaque appel IA.
-- 3. Index sur saas_metrics(created_at) pour ces sommes.
-- Ajouts uniquement. Retour arrière : bloc en fin de fichier.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_settings FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_saas_metrics_created ON public.saas_metrics (created_at);

CREATE OR REPLACE FUNCTION public.ai_spend_since(p_since timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(cost_usd), 0)::numeric FROM public.saas_metrics WHERE created_at >= p_since;
$$;
REVOKE EXECUTE ON FUNCTION public.ai_spend_since(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_spend_since(timestamptz) TO service_role;

-- Vérification : doit renvoyer 1 ligne (table) et un nombre (fonction).
SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_settings') AS table_ok,
       public.ai_spend_since(now() - interval '30 days') AS depense_30_jours_usd;

-- -----------------------------------------------------------------------------------
-- Retour arrière :
-- DROP FUNCTION IF EXISTS public.ai_spend_since(timestamptz);
-- DROP TABLE IF EXISTS public.admin_settings;
-- DROP INDEX IF EXISTS public.idx_saas_metrics_created;
-- -----------------------------------------------------------------------------------
