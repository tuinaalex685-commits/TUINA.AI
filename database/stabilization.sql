-- ============================================================
-- SCRIPT DE STABILISATION PRODUCTION - TUINA.AI
-- Exécuter dans l'éditeur SQL de Supabase
-- ============================================================

-- 1. EVALUATIONS : Ajouter colonne titre manquante
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS titre TEXT;

-- 2. EVALUATIONS : Ajouter colonne meta_type pour le filtrage frontend
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS meta_type TEXT;

-- 3. EVALUATIONS : Supprimer l'ancienne contrainte CHECK trop restrictive
ALTER TABLE public.evaluations DROP CONSTRAINT IF EXISTS evaluations_type_check;

-- 4. EVALUATIONS : Recréer la contrainte avec TOUS les types supportés
ALTER TABLE public.evaluations ADD CONSTRAINT evaluations_type_check 
  CHECK (type IN ('quiz', 'qcm', 'vrai_faux', 'juridique'));

-- 5. DOCUMENTS : Ajouter cours_id pour lier les PDF aux cours
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS cours_id UUID REFERENCES public.cours(id) ON DELETE SET NULL;

-- 6. DOCUMENTS : Ajouter url_fichier (alias de url utilisé par le backend)
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS url_fichier TEXT;
UPDATE public.documents SET url_fichier = url WHERE url_fichier IS NULL AND url IS NOT NULL;

-- 7. OBJECTIFS : Ajouter les colonnes manquantes utilisées par le frontend
ALTER TABLE public.objectifs ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE public.objectifs ADD COLUMN IF NOT EXISTS progression INTEGER DEFAULT 0;

-- 8. FLASHCARDS : RLS
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can see own flashcards" ON public.flashcards;
CREATE POLICY "Users can see own flashcards" ON public.flashcards FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own flashcards" ON public.flashcards;
CREATE POLICY "Users can insert own flashcards" ON public.flashcards FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own flashcards" ON public.flashcards;
CREATE POLICY "Users can update own flashcards" ON public.flashcards FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own flashcards" ON public.flashcards;
CREATE POLICY "Users can delete own flashcards" ON public.flashcards FOR DELETE USING (auth.uid() = user_id);

-- 9. HISTORIQUE REVISIONS : RLS
ALTER TABLE public.historique_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can see own history" ON public.historique_revisions;
CREATE POLICY "Users can see own history" ON public.historique_revisions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own history" ON public.historique_revisions;
CREATE POLICY "Users can insert own history" ON public.historique_revisions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 10. OBJECTIFS : RLS
ALTER TABLE public.objectifs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can see own objectifs" ON public.objectifs;
CREATE POLICY "Users can see own objectifs" ON public.objectifs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own objectifs" ON public.objectifs;
CREATE POLICY "Users can insert own objectifs" ON public.objectifs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own objectifs" ON public.objectifs;
CREATE POLICY "Users can update own objectifs" ON public.objectifs FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own objectifs" ON public.objectifs;
CREATE POLICY "Users can delete own objectifs" ON public.objectifs FOR DELETE USING (auth.uid() = user_id);

-- 11. REDACTION_VERSIONS : RLS
ALTER TABLE public.redaction_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can see own versions" ON public.redaction_versions;
CREATE POLICY "Users can see own versions" ON public.redaction_versions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.redactions WHERE redactions.id = redaction_versions.redaction_id AND redactions.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Users can insert own versions" ON public.redaction_versions;
CREATE POLICY "Users can insert own versions" ON public.redaction_versions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.redactions WHERE redactions.id = redaction_versions.redaction_id AND redactions.user_id = auth.uid())
);

-- 12. DOCUMENTS : Ajouter l'intelligence pédagogique
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS intelligence_pedagogique JSONB;

-- 13. ETUDE_COURS : Contrainte d'unicité sur pdf_id pour éviter les doublons générés en concurrence
ALTER TABLE public.etude_cours ADD CONSTRAINT unique_pdf_id UNIQUE (pdf_id);
