-- ==============================================================================
-- QUOTAS JOURNALIERS FREE — compteurs serveur, incrémentation ATOMIQUE.
--
-- Remplace la logique "à vie" de free_plan_counters.sql (free_import_used /
-- free_cas_pratique_count) par des compteurs qui se réinitialisent chaque jour.
-- Les anciennes colonnes ne sont PAS supprimées ici : elles restent en base le
-- temps que le nouveau code soit vérifié en production (suppression = migration
-- séparée, jamais dans le même passage qu'un changement de comportement).
--
-- ATOMICITÉ : tout passe par consume_free_quota(). Le INSERT ... ON CONFLICT
-- DO UPDATE prend un verrou de ligne, donc deux onglets (ou deux appels API
-- directs) lancés en même temps sont sérialisés par PostgreSQL — impossible de
-- consommer deux fois le dernier crédit. Un simple SELECT puis UPDATE côté
-- Node laisserait au contraire passer les deux.
--
-- FUSEAU : le Burkina Faso est à UTC+0, donc la date UTC EST la date locale.
-- On fixe explicitement 'UTC' plutôt que d'utiliser current_date, qui dépend du
-- timezone de la session PostgreSQL et pourrait basculer sans prévenir.
--
-- Additif et réversible. Rollback en bas de fichier.
-- ==============================================================================

-- 1. TABLE DES COMPTEURS
-- Une ligne par (utilisateur, jour, fonctionnalité). Les lignes des jours passés
-- restent : elles ne coûtent rien et servent d'historique d'usage.
CREATE TABLE IF NOT EXISTS public.free_daily_usage (
  user_id  UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jour     DATE    NOT NULL,
  feature  TEXT    NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, jour, feature)
);

CREATE INDEX IF NOT EXISTS idx_free_daily_usage_user_jour
  ON public.free_daily_usage(user_id, jour);

ALTER TABLE public.free_daily_usage ENABLE ROW LEVEL SECURITY;

-- Lecture : l'utilisateur voit SES compteurs (l'interface affiche "3 / 10 examens").
-- Aucune policy d'écriture : le client ne peut jamais écrire ici. Les seules
-- écritures passent par les fonctions SECURITY DEFINER ci-dessous, appelées
-- exclusivement côté serveur.
DROP POLICY IF EXISTS "Lecture de ses propres compteurs" ON public.free_daily_usage;
CREATE POLICY "Lecture de ses propres compteurs" ON public.free_daily_usage
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 2. CONSOMMATION ATOMIQUE D'UN CRÉDIT
-- Renvoie allowed=false SANS incrémenter si le quota est déjà atteint.
-- Le WHERE sur le DO UPDATE est ce qui rend l'opération sûre : quand la condition
-- est fausse, aucune ligne n'est renvoyée par RETURNING, donc v_count reste NULL.
CREATE OR REPLACE FUNCTION public.consume_free_quota(
  p_user_id UUID,
  p_feature TEXT,
  p_limit   INTEGER
)
RETURNS TABLE(allowed BOOLEAN, used INTEGER, quota INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jour  DATE := (now() AT TIME ZONE 'UTC')::date;
  v_count INTEGER;
BEGIN
  -- Dans un ON CONFLICT DO UPDATE, l'ancienne valeur se référence par le NOM DE TABLE
  -- non qualifié (free_daily_usage.count) : "public.free_daily_usage.count" est
  -- rejeté par PostgreSQL à cette position.
  INSERT INTO public.free_daily_usage (user_id, jour, feature, count)
  VALUES (p_user_id, v_jour, p_feature, 1)
  ON CONFLICT (user_id, jour, feature)
  DO UPDATE SET count = free_daily_usage.count + 1
    WHERE free_daily_usage.count < p_limit
  RETURNING free_daily_usage.count INTO v_count;

  IF v_count IS NULL THEN
    -- Quota déjà atteint : on relit la valeur courante pour l'afficher à l'utilisateur.
    SELECT u.count INTO v_count
    FROM public.free_daily_usage u
    WHERE u.user_id = p_user_id AND u.jour = v_jour AND u.feature = p_feature;
    RETURN QUERY SELECT false, COALESCE(v_count, p_limit), p_limit;
  ELSE
    RETURN QUERY SELECT true, v_count, p_limit;
  END IF;
END;
$$;

-- 3. REMBOURSEMENT
-- Le crédit est consommé AVANT l'opération (sinon deux requêtes concurrentes
-- passent toutes les deux). Si l'opération échoue ensuite pour une raison
-- technique, on rend le crédit — l'étudiant ne doit pas payer notre panne.
-- Ne descend jamais sous zéro.
CREATE OR REPLACE FUNCTION public.refund_free_quota(
  p_user_id UUID,
  p_feature TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.free_daily_usage
  SET count = GREATEST(count - 1, 0)
  WHERE user_id = p_user_id
    AND jour = (now() AT TIME ZONE 'UTC')::date
    AND feature = p_feature;
END;
$$;

-- Ces fonctions ne doivent PAS être appelables depuis le navigateur : elles sont
-- SECURITY DEFINER et acceptent un p_user_id arbitraire — un étudiant pourrait
-- sinon consommer le quota d'un autre, ou se rembourser lui-même à l'infini.
--
-- REVOKE FROM PUBLIC retire le droit hérité par TOUS les rôles, service_role
-- compris : le GRANT qui suit est donc obligatoire, sans lui le code serveur
-- reçoit "permission denied for function" à chaque appel.
REVOKE ALL ON FUNCTION public.consume_free_quota(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_free_quota(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_free_quota(UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_free_quota(UUID, TEXT) TO service_role;

-- ==============================================================================
-- ROLLBACK (à exécuter uniquement si besoin de revenir en arrière) :
--
-- DROP FUNCTION IF EXISTS public.refund_free_quota(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.consume_free_quota(UUID, TEXT, INTEGER);
-- DROP TABLE IF EXISTS public.free_daily_usage;
-- ==============================================================================
