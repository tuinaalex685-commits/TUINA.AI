-- ==============================================================================
-- 03 — PROFIL ÉTUDIANT, NIVEAUX D'ÉTUDES ET CATALOGUE PAR NIVEAU
--
-- Purement additif : aucune donnée existante n'est modifiée ni supprimée.
-- Le code déployé fonctionne AVANT et APRÈS cette migration (il ignore ces tables tant
-- qu'elles n'existent pas). Transactionnel. Retour arrière en bas du fichier.
--
--   niveaux            : référentiel extensible (L1, L2 ; demain L3, Master, autres filières)
--   profiles           : une ligne par compte (niveau, canal de découverte) — jamais de doublon
--   catalog_courses    : + niveau (NULL = visible par tous les niveaux)
--
-- Le niveau pédagogique est SÉPARÉ du statut d'abonnement : un étudiant de L1 peut être
-- gratuit ou Premium. Le filtrage par niveau ne concerne que le catalogue gratuit.
-- ==============================================================================
BEGIN;

-- 1. Référentiel des niveaux --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.niveaux (
  code       text PRIMARY KEY CHECK (code ~ '^[a-z0-9_]{1,20}$'),
  libelle    text NOT NULL,
  ordre      integer NOT NULL DEFAULT 0,
  actif      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.niveaux (code, libelle, ordre) VALUES
  ('l1', 'Licence 1', 1),
  ('l2', 'Licence 2', 2)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.niveaux ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "niveaux_lecture" ON public.niveaux;
CREATE POLICY "niveaux_lecture" ON public.niveaux FOR SELECT TO anon, authenticated USING (actif);

-- 2. Profil étudiant (une ligne par compte) -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  niveau                text REFERENCES public.niveaux(code) ON UPDATE CASCADE ON DELETE SET NULL,
  source_decouverte     text CHECK (source_decouverte IN ('ami', 'groupe_etudiant', 'reseaux_sociaux', 'enseignant', 'autre')),
  onboarding_termine_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_niveau ON public.profiles (niveau);

-- Lecture de SON profil uniquement. Aucune écriture depuis le navigateur : le serveur écrit
-- avec le service role, après validation (niveau existant, valeurs autorisées).
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_lecture_soi" ON public.profiles;
CREATE POLICY "profiles_lecture_soi" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 3. Catalogue par niveau ------------------------------------------------------------------
-- NULL = cours visible par tous les niveaux (comportement actuel : rien ne disparaît tant que
-- l'administrateur n'a pas classé un cours).
ALTER TABLE public.catalog_courses
  ADD COLUMN IF NOT EXISTS niveau text REFERENCES public.niveaux(code) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_courses_niveau ON public.catalog_courses (niveau) WHERE actif;

COMMIT;

-- ==============================================================================
-- VÉRIFICATION :
--   SELECT * FROM public.niveaux;                          -- l1, l2
--   SELECT count(*) FROM public.profiles;                  -- 0 au départ
--   SELECT id, titre_affiche, niveau FROM public.catalog_courses;
-- RETOUR ARRIÈRE :
-- BEGIN;
-- ALTER TABLE public.catalog_courses DROP COLUMN IF EXISTS niveau;
-- DROP TABLE IF EXISTS public.profiles;
-- DROP TABLE IF EXISTS public.niveaux;
-- COMMIT;
-- ==============================================================================
