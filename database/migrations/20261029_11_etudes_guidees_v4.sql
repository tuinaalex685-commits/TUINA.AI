-- =============================================================================
-- Migration 11 — Études guidées v4 (leçons par notion, cartes par module)
-- =============================================================================
-- NON DESTRUCTIVE : ajoute 4 colonnes NULLABLES sans valeur par défaut à etude_analyses.
-- Sous PostgreSQL 11+, c'est une opération de métadonnées : instantanée, sans réécriture
-- de la table ni verrou long. Aucune donnée existante n'est modifiée ni supprimée.
--
-- Pourquoi : à grande échelle, chaque affichage d'un cours ne doit lire que des données
-- LÉGÈRES. Sans ces colonnes, le titre du cours était lu dans un JSON d'environ 1 Mo
-- (l'analyse détaillée de chaque module), que PostgreSQL devait relire en entier à chaque
-- page vue, pour chaque étudiant.
--   titre, idee_centrale : en-tête du cours (quelques centaines d'octets) ;
--   modules              : plan léger (titres, place dans le cours, pages) ;
--   analyses             : analyse détaillée des notions, lue SEULEMENT par le worker
--                          quand il rédige une leçon (jamais par une page).
-- Les cartes mentales par module restent dans « carte » (lues par les pages Introduction et Carte).
--
-- Écritures : uniquement par le serveur (service role) ; RLS et droits inchangés
-- (etude_analyses reste fermée à anon et authenticated, cf. migration 06).
-- =============================================================================

ALTER TABLE public.etude_analyses
  ADD COLUMN IF NOT EXISTS titre text,
  ADD COLUMN IF NOT EXISTS idee_centrale text,
  ADD COLUMN IF NOT EXISTS modules jsonb,
  ADD COLUMN IF NOT EXISTS analyses jsonb;

-- Vérification (lecture seule) : doit afficher 4.
SELECT count(*) AS colonnes_ajoutees_attendu_4
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'etude_analyses'
  AND column_name IN ('titre', 'idee_centrale', 'modules', 'analyses');

-- -----------------------------------------------------------------------------------
-- Retour arrière (sans perte pour la v3 ; les analyses v4 devront être refaites) :
-- ALTER TABLE public.etude_analyses
--   DROP COLUMN IF EXISTS analyses, DROP COLUMN IF EXISTS modules,
--   DROP COLUMN IF EXISTS idee_centrale, DROP COLUMN IF EXISTS titre;
-- -----------------------------------------------------------------------------------
