-- ==============================================================================
-- ONBOARDING : guide d'accueil vu une seule fois par COMPTE
-- Un simple drapeau sur user_roles : le guide s'affiche à la 1re connexion d'un
-- nouvel utilisateur, puis plus jamais (même s'il change d'appareil/navigateur).
-- Additif, sans DEFAULT volatile, idempotent.
-- ==============================================================================
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS onboarding_vu BOOLEAN NOT NULL DEFAULT false;
