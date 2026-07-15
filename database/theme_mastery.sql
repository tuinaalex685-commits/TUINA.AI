-- ==============================================================================
-- COUCHE DE MAÎTRISE PAR THÈME (INC.1)
-- Vue DÉRIVÉE (aucune donnée stockée) : le score de maîtrise d'un thème est
-- calculé à 100 % depuis etude_progression_themes, déjà alimentée par le flux
-- Étude Guidée. Aucune écriture, aucune table modifiée -> 0 risque de dérive,
-- 0 risque de régression sur le parcours Étude.
--
-- security_invoker = true : la vue s'exécute avec les droits du LECTEUR, donc la
-- RLS owner-only de etude_progression_themes s'applique (un user ne voit que sa
-- propre maîtrise). Idempotent et rejouable.
--
-- Formule (structurelle) :
--   score = clamp(0..100,
--       40 si forme validée
--     + 60 si fond validé
--     - min(20, 5 x (tentatives_forme + tentatives_fond)))
-- Le SEUIL de maîtrise (défaut 70) est appliqué côté application
-- (src/lib/config/mastery.ts) et reste modifiable SANS migration.
-- ==============================================================================

CREATE OR REPLACE VIEW public.theme_mastery
WITH (security_invoker = true) AS
SELECT
    pt.user_id,
    pt.theme_id,
    GREATEST(0, LEAST(100,
          (CASE WHEN pt.forme_validee THEN 40 ELSE 0 END)
        + (CASE WHEN pt.fond_valide   THEN 60 ELSE 0 END)
        - LEAST(20, 5 * (COALESCE(pt.tentatives_forme, 0) + COALESCE(pt.tentatives_fond, 0)))
    ))::int AS score,
    pt.updated_at
FROM public.etude_progression_themes pt;
