-- ==============================================================================
-- PATCH DE SÉCURITÉ CRITIQUE : ROW LEVEL SECURITY (RLS)
-- Résolution des failles IDOR (Insecure Direct Object Reference)
-- ==============================================================================

-- 1. VERROUILLAGE DE LA TABLE "COURS"
ALTER TABLE public.cours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acces_Cours" ON public.cours;
CREATE POLICY "Acces_Cours" ON public.cours
FOR ALL
USING (
  matiere_id IN (
    SELECT id FROM public.matieres WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  matiere_id IN (
    SELECT id FROM public.matieres WHERE user_id = auth.uid()
  )
);

-- 2. VERROUILLAGE DE LA TABLE "CHAPITRES"
ALTER TABLE public.chapitres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acces_Chapitres" ON public.chapitres;
CREATE POLICY "Acces_Chapitres" ON public.chapitres
FOR ALL
USING (
  cours_id IN (
    SELECT c.id FROM public.cours c
    JOIN public.matieres m ON c.matiere_id = m.id
    WHERE m.user_id = auth.uid()
  )
)
WITH CHECK (
  cours_id IN (
    SELECT c.id FROM public.cours c
    JOIN public.matieres m ON c.matiere_id = m.id
    WHERE m.user_id = auth.uid()
  )
);

-- 3. SÉCURISATION DU CONTENU IA GÉNÉRÉ (ETUDE_COURS)
ALTER TABLE public.etude_cours ENABLE ROW LEVEL SECURITY;

-- Suppression de la politique dangereuse
DROP POLICY IF EXISTS "Lecture autorisée pour tous" ON public.etude_cours;

-- Nouvelle politique restreinte
CREATE POLICY "Acces_Etude_Cours" ON public.etude_cours
FOR SELECT
USING (
  pdf_id IN (
    SELECT id FROM public.documents WHERE user_id = auth.uid()
  )
);

-- 4. SÉCURISATION DE ETUDE_SECTIONS
ALTER TABLE public.etude_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture autorisée pour tous" ON public.etude_sections;

CREATE POLICY "Acces_Etude_Sections" ON public.etude_sections
FOR SELECT
USING (
  etude_cours_id IN (
    SELECT ec.id FROM public.etude_cours ec
    JOIN public.documents d ON ec.pdf_id = d.id
    WHERE d.user_id = auth.uid()
  )
);

-- 5. SÉCURISATION DE ETUDE_THEMES
ALTER TABLE public.etude_themes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture autorisée pour tous" ON public.etude_themes;

CREATE POLICY "Acces_Etude_Themes" ON public.etude_themes
FOR SELECT
USING (
  section_id IN (
    SELECT es.id FROM public.etude_sections es
    JOIN public.etude_cours ec ON es.etude_cours_id = ec.id
    JOIN public.documents d ON ec.pdf_id = d.id
    WHERE d.user_id = auth.uid()
  )
);
