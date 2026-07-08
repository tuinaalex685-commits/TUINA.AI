-- ==============================================================================
-- PATCH DE SÉCURITÉ V2 : ROW LEVEL SECURITY (RLS) SUR ROLES ET CODES
-- Résolution des fuites de données globales
-- ==============================================================================

-- 1. VERROUILLAGE DE LA TABLE "USER_ROLES"
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir uniquement leur propre rôle
DROP POLICY IF EXISTS "Lecture de son propre rôle" ON public.user_roles;
CREATE POLICY "Lecture de son propre rôle" ON public.user_roles
FOR SELECT
USING (user_id = auth.uid());


-- 2. VERROUILLAGE DE LA TABLE "ACCESS_CODES"
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir uniquement le code d'accès assigné à leur email (ou un code vierge s'ils n'en ont pas)
-- Note: auth.jwt() ->> 'email' permet de récupérer l'email de l'utilisateur connecté de manière sécurisée
DROP POLICY IF EXISTS "Lecture de son propre code d'accès" ON public.access_codes;
CREATE POLICY "Lecture de son propre code d'accès" ON public.access_codes
FOR SELECT
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);
