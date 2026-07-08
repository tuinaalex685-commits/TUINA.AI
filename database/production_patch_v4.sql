-- ==============================================================================
-- PATCH DE PRODUCTION V4 : CONSOLIDATION COMPLÈTE AVANT LANCEMENT
-- Ce script corrige TOUTES les incohérences détectées par l'audit.
-- À exécuter dans la console SQL de Supabase AVANT le push du code.
-- ==============================================================================

-- 1. COLONNE MANQUANTE : intelligence_pedagogique sur documents
-- CAUSE : Le worker et l'API evaluate plantaient avec "Document introuvable"
-- parce que cette colonne n'existait pas et la requête SELECT échouait.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS intelligence_pedagogique JSONB;

-- 2. COLONNE MANQUANTE : extracted_text sur documents
-- CAUSE : Le cache de texte PDF n'était jamais sauvegardé.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS extracted_text TEXT;

-- 3. COLONNE MANQUANTE : taille sur documents
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS taille BIGINT;

-- 4. COLONNES MANQUANTES SUR etude_cours (pour le système de retry et heartbeat)
ALTER TABLE public.etude_cours ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.etude_cours ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.etude_cours ADD COLUMN IF NOT EXISTS heartbeat TIMESTAMPTZ;
ALTER TABLE public.etude_cours ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE public.etude_cours ADD COLUMN IF NOT EXISTS next_retry TIMESTAMPTZ;
ALTER TABLE public.etude_cours ADD COLUMN IF NOT EXISTS last_error TEXT;

-- 5. NETTOYAGE DES JOBS ZOMBIES
-- Le job "9822db04" est bloqué en "en_cours" depuis le 3 juillet avec started_at=null.
-- Il empêche la file d'attente de fonctionner.
UPDATE public.etude_cours
SET statut_generation = 'pending',
    started_at = NULL,
    heartbeat = NULL,
    retry_count = 0,
    next_retry = NULL,
    last_error = 'Réinitialisé par patch de production V4',
    updated_at = NOW()
WHERE statut_generation = 'en_cours'
  AND (heartbeat IS NULL OR heartbeat < NOW() - INTERVAL '15 minutes');

-- 6. RÉINITIALISATION DES JOBS EN ERREUR PERMANENTE (pour les relancer proprement)
UPDATE public.etude_cours
SET statut_generation = 'pending',
    retry_count = 0,
    next_retry = NULL,
    last_error = 'Réinitialisé par patch de production V4',
    updated_at = NOW()
WHERE statut_generation = 'erreur'
  AND retry_count >= 2;

-- 7. TABLE saas_metrics (pour le tracking des coûts IA)
CREATE TABLE IF NOT EXISTS public.saas_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    feature TEXT NOT NULL,
    document_id TEXT,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    cost_usd NUMERIC(10, 6) DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. CONTRAINTE UNIQUE sur etude_cours.pdf_id (si pas déjà existante)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_pdf_id') THEN
        ALTER TABLE public.etude_cours ADD CONSTRAINT unique_pdf_id UNIQUE (pdf_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Contrainte unique_pdf_id déjà existante ou erreur ignorée.';
END $$;

-- 9. VÉRIFICATION : Afficher l'état des jobs après nettoyage
SELECT id, pdf_id, statut_generation, last_error, retry_count
FROM public.etude_cours
ORDER BY created_at DESC
LIMIT 20;
