-- ==============================================================================
-- PATCH SCALABILITÉ V2 : DÉDUPLICATION ET LOCK DES FLASHCARDS
-- Ce script ajoute le support pour le cache global synchrone des Flashcards
-- ==============================================================================

-- 1. Ajout du Hash Textuel sur la table flashcards
-- Ce hash permettra de lier une flashcard au contenu brut qui a servi à la générer.
ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS source_hash TEXT;

-- 2. Création d'un index sur ce hash pour le clonage ultra-rapide
CREATE INDEX IF NOT EXISTS idx_flashcards_source_hash ON public.flashcards(source_hash);

-- 3. Création de la table de verrou (Wait Lock) pour le Single Flight synchrone
CREATE TABLE IF NOT EXISTS public.flashcards_locks (
    hash TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Le lock expire automatiquement après 2 minutes pour éviter les blocages infinis
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 minutes')
);

-- Index pour purger facilement les vieux locks si nécessaire
CREATE INDEX IF NOT EXISTS idx_flashcards_locks_expires ON public.flashcards_locks(expires_at);
