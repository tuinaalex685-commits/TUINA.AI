-- ==============================================================================
-- COMPTEURS D'USAGE FREE — persistants, indépendants du statut Premium courant.
--
-- "1 import personnel gratuit à vie" et "10 corrections de cas pratique gratuites
-- à vie" doivent rester vrais même si l'utilisateur passe Premium puis redevient
-- Free (code désactivé) — donc PAS calculables dynamiquement, doivent être stockés.
--
-- Le statut Premium lui-même N'EST PAS stocké ici : il reste calculé depuis
-- access_codes.status = 'active' (voir src/lib/plan.ts), pour éviter une double
-- source de vérité avec le système de codes d'accès existant.
--
-- Additif, valeurs par défaut qui ne changent rien à l'usage déjà enregistré.
-- ==============================================================================

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS free_import_used BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS free_cas_pratique_count INTEGER NOT NULL DEFAULT 0;
