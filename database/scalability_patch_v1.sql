-- ==============================================================================
-- PATCH SCALABILITÉ V1 : DÉDUPLICATION ET INDEX DE PERFORMANCE
-- Ce script ajoute les colonnes et les index nécessaires pour le Cache Global IA
-- ==============================================================================

-- 1. Ajout du Hash Textuel sur la table documents
-- Ce hash permettra d'identifier deux PDF identiques même s'ils ont des noms différents.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS text_hash TEXT;

-- 2. Création d'un index sur ce hash pour accélérer les recherches de déduplication (Single Flight)
CREATE INDEX IF NOT EXISTS idx_documents_text_hash ON public.documents(text_hash);

-- 3. Ajout d'index de performance sur etude_cours
-- Accélère considérablement la requête du worker qui cherche les jobs en attente
CREATE INDEX IF NOT EXISTS idx_etude_cours_statut ON public.etude_cours(statut_generation);

-- Accélère la recherche de cache global (clonage d'intelligence pédagogique)
CREATE INDEX IF NOT EXISTS idx_etude_cours_generation_hash ON public.etude_cours(generation_hash);

-- Accélère la recherche par pdf_id
CREATE INDEX IF NOT EXISTS idx_etude_cours_pdf_id ON public.etude_cours(pdf_id);

-- 4. Nettoyage préventif
UPDATE public.etude_cours
SET statut_generation = 'pending'
WHERE statut_generation = 'en_cours'
  AND (heartbeat IS NULL OR heartbeat < NOW() - INTERVAL '15 minutes');
