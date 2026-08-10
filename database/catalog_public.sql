-- ==============================================================================
-- CATALOGUE PUBLIC — cours déjà générés, réutilisables par tous les utilisateurs
-- autorisés, sans nouvel appel Gemini.
--
-- Additif et réversible : ne modifie, ne supprime et ne remplace aucune donnée
-- existante. Les policies "Acces_Etude_Cours/Sections/Themes" gardent leur
-- branche propriétaire d'origine au caractère près ; on ajoute uniquement une
-- seconde condition (OR) pour la lecture d'un cours publié au catalogue.
-- Aucun "USING (true)" — jamais de lecture globale de la table.
--
-- Validé (analyse RLS + scénarios IDOR + vérification cache) le 2026-08-10.
-- Rollback en bas de fichier si besoin de revenir en arrière.
-- ==============================================================================

-- 1. TABLE D'INDEX DU CATALOGUE
-- Ne référence QUE des cours déjà générés (etude_cours). N'affecte jamais le
-- cours original : publier/retirer du catalogue ne touche ni etude_cours, ni
-- etude_sections, ni etude_themes, ni le document source.
CREATE TABLE IF NOT EXISTS public.catalog_courses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etude_cours_id UUID NOT NULL UNIQUE REFERENCES public.etude_cours(id) ON DELETE CASCADE,
  titre_affiche  TEXT NOT NULL,
  matiere        TEXT,
  ordre          INTEGER NOT NULL DEFAULT 0,
  actif          BOOLEAN NOT NULL DEFAULT true,
  added_by       UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_courses_etude_cours
  ON public.catalog_courses(etude_cours_id) WHERE actif = true;

ALTER TABLE public.catalog_courses ENABLE ROW LEVEL SECURITY;

-- Lecture : utilisateurs authentifiés, entrées actives uniquement. Cette table
-- ne contient que titre/matière/ordre — rien de sensible n'est exposé ici.
DROP POLICY IF EXISTS "Lecture catalogue actif" ON public.catalog_courses;
CREATE POLICY "Lecture catalogue actif" ON public.catalog_courses
FOR SELECT TO authenticated
USING (actif = true);

-- Écriture : administrateurs uniquement (même pattern que requireAdmin() côté code).
DROP POLICY IF EXISTS "Ecriture catalogue admin" ON public.catalog_courses;
CREATE POLICY "Ecriture catalogue admin" ON public.catalog_courses
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- 2. LECTURE ADDITIVE SUR LE CONTENU PÉDAGOGIQUE DÉJÀ EXISTANT
-- Chaque policy ci-dessous = policy actuelle (security_patch_v1.sql) + OR EXISTS
-- vers catalog_courses. La branche propriétaire n'est pas modifiée.

DROP POLICY IF EXISTS "Acces_Etude_Cours" ON public.etude_cours;
CREATE POLICY "Acces_Etude_Cours" ON public.etude_cours
FOR SELECT USING (
  pdf_id IN (SELECT id FROM public.documents WHERE user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.catalog_courses cc
    WHERE cc.etude_cours_id = etude_cours.id AND cc.actif = true
  )
);

DROP POLICY IF EXISTS "Acces_Etude_Sections" ON public.etude_sections;
CREATE POLICY "Acces_Etude_Sections" ON public.etude_sections
FOR SELECT USING (
  cours_id IN (
    SELECT ec.id FROM public.etude_cours ec
    JOIN public.documents d ON ec.pdf_id = d.id
    WHERE d.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.catalog_courses cc
    WHERE cc.etude_cours_id = etude_sections.cours_id AND cc.actif = true
  )
);

DROP POLICY IF EXISTS "Acces_Etude_Themes" ON public.etude_themes;
CREATE POLICY "Acces_Etude_Themes" ON public.etude_themes
FOR SELECT USING (
  section_id IN (
    SELECT es.id FROM public.etude_sections es
    JOIN public.etude_cours ec ON es.cours_id = ec.id
    JOIN public.documents d ON ec.pdf_id = d.id
    WHERE d.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.etude_sections es
    JOIN public.catalog_courses cc ON cc.etude_cours_id = es.cours_id
    WHERE es.id = etude_themes.section_id AND cc.actif = true
  )
);

-- ==============================================================================
-- ROLLBACK (à exécuter uniquement si besoin de revenir en arrière) :
--
-- DROP POLICY IF EXISTS "Acces_Etude_Themes" ON public.etude_themes;
-- CREATE POLICY "Acces_Etude_Themes" ON public.etude_themes FOR SELECT USING (
--   section_id IN (
--     SELECT es.id FROM public.etude_sections es
--     JOIN public.etude_cours ec ON es.cours_id = ec.id
--     JOIN public.documents d ON ec.pdf_id = d.id
--     WHERE d.user_id = auth.uid()
--   )
-- );
--
-- DROP POLICY IF EXISTS "Acces_Etude_Sections" ON public.etude_sections;
-- CREATE POLICY "Acces_Etude_Sections" ON public.etude_sections FOR SELECT USING (
--   cours_id IN (
--     SELECT ec.id FROM public.etude_cours ec
--     JOIN public.documents d ON ec.pdf_id = d.id
--     WHERE d.user_id = auth.uid()
--   )
-- );
--
-- DROP POLICY IF EXISTS "Acces_Etude_Cours" ON public.etude_cours;
-- CREATE POLICY "Acces_Etude_Cours" ON public.etude_cours FOR SELECT USING (
--   pdf_id IN (SELECT id FROM public.documents WHERE user_id = auth.uid())
-- );
--
-- DROP TABLE IF EXISTS public.catalog_courses;
-- ==============================================================================
