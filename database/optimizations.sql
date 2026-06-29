-- =========================================================================
-- OPTIMISATIONS DES PERFORMANCES ET MISE EN CACHE PDF
-- =========================================================================

-- 1. Index pour accélérer le filtrage par utilisateur sur les tables critiques
CREATE INDEX IF NOT EXISTS idx_redactions_user_id ON public.redactions(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_id ON public.flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_user_id ON public.evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);

-- 2. Ajout du cache de texte pour éviter de télécharger/parser les PDF en boucle
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS extracted_text TEXT;

-- 3. Fonction pour invalider le cache si le document est mis à jour
CREATE OR REPLACE FUNCTION invalidate_pdf_cache()
RETURNS TRIGGER AS $$
BEGIN
  -- Si l'URL du fichier change (remplacement), on vide le texte extrait
  IF NEW.url_fichier IS DISTINCT FROM OLD.url_fichier THEN
    NEW.extracted_text = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger d'invalidation
DROP TRIGGER IF EXISTS trigger_invalidate_pdf_cache ON public.documents;
CREATE TRIGGER trigger_invalidate_pdf_cache
BEFORE UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION invalidate_pdf_cache();
