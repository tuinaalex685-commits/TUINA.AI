-- =============================================================================
-- Migration 04 — Index des écrans Matières et Documents
-- =============================================================================
-- Pourquoi : les pages « Mes matières », « matière » et « cours » filtrent par
-- matieres.user_id, cours.matiere_id, documents.matiere_id et documents.cours_id.
-- Aucune de ces colonnes n'est indexée : chaque affichage lit toute la table.
-- C'est invisible avec 17 comptes, mais coûteux avec des milliers de documents
-- et une centaine d'étudiants connectés en même temps (tests k6 à venir).
--
-- Sans risque : on ajoute seulement des index, aucune donnée n'est modifiée.
-- Les tables sont encore petites : la création est instantanée, le verrou bref.
-- Retour arrière : voir le bloc en fin de fichier.
-- =============================================================================

-- Liste des matières d'un étudiant (triée par date de création).
CREATE INDEX IF NOT EXISTS idx_matieres_user_created
  ON public.matieres (user_id, created_at DESC);

-- Cours d'une matière (triés par date de création) + jointure des politiques RLS.
CREATE INDEX IF NOT EXISTS idx_cours_matiere_created
  ON public.cours (matiere_id, created_at);

-- Documents d'un cours (page cours) et suppression en cascade d'un cours.
CREATE INDEX IF NOT EXISTS idx_documents_cours
  ON public.documents (cours_id)
  WHERE cours_id IS NOT NULL;

-- Documents d'une matière, dont ceux pas encore rangés dans un cours (cours_id NULL).
CREATE INDEX IF NOT EXISTS idx_documents_matiere_cours
  ON public.documents (matiere_id, cours_id)
  WHERE matiere_id IS NOT NULL;

-- Chapitres d'un cours (clé étrangère non indexée, utilisée par ON DELETE CASCADE).
CREATE INDEX IF NOT EXISTS idx_chapitres_cours
  ON public.chapitres (cours_id);

-- Vérification (lecture seule) : doit lister les 5 index ci-dessus.
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_matieres_user_created', 'idx_cours_matiere_created', 'idx_documents_cours',
    'idx_documents_matiere_cours', 'idx_chapitres_cours'
  )
ORDER BY tablename;

-- -----------------------------------------------------------------------------
-- Retour arrière (à exécuter seulement en cas de problème) :
-- DROP INDEX IF EXISTS public.idx_matieres_user_created;
-- DROP INDEX IF EXISTS public.idx_cours_matiere_created;
-- DROP INDEX IF EXISTS public.idx_documents_cours;
-- DROP INDEX IF EXISTS public.idx_documents_matiere_cours;
-- DROP INDEX IF EXISTS public.idx_chapitres_cours;
-- -----------------------------------------------------------------------------
