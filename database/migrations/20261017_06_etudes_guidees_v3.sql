-- =============================================================================
-- Migration 06 — Études guidées v3 (analyse, synthèse, séquences, parcours)
-- =============================================================================
-- Contenus PÉDAGOGIQUES COMMUNS (aucune donnée personnelle), mutualisés entre tous les
-- étudiants qui étudient le même texte de cours, pour une version donnée du moteur :
--   etude_analyses  : couverture, carte des connaissances, plan, synthèse, carte mentale
--   etude_sequences : contenu de chaque séquence, généré à la demande (E-01)
-- Données PERSONNELLES, strictement isolées par étudiant :
--   etude_parcours  : démarrage, séquence actuelle, plus haute séquence débloquée
--   etude_tentatives: chaque réponse, son verdict et son retour (compteur serveur, E-04)
--   etude_a_revoir  : notions marquées « À revoir » après 3 tentatives
--
-- Écritures : uniquement par le serveur (service role). Le navigateur ne peut que LIRE ses
-- propres lignes personnelles ; les contenus communs sont servis par le serveur après
-- contrôle d'accès au document. Aucune table existante n'est modifiée.
-- Retour arrière : bloc en fin de fichier.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.etude_analyses (
  source_hash text NOT NULL,
  engine_version text NOT NULL,
  statut text NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'pret', 'echec')),
  couverture jsonb,
  pages_texte jsonb,  -- texte extrait page par page (contenu du cours, jamais exposé au navigateur)
  carte jsonb,
  plan jsonb,
  synthese jsonb,
  carte_mentale jsonb,
  erreur text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_hash, engine_version)
);

ALTER TABLE public.etude_analyses ADD COLUMN IF NOT EXISTS pages_texte jsonb;

CREATE TABLE IF NOT EXISTS public.etude_sequences (
  source_hash text NOT NULL,
  engine_version text NOT NULL,
  ordre integer NOT NULL CHECK (ordre >= 1 AND ordre <= 60),
  contenu jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_hash, engine_version, ordre),
  FOREIGN KEY (source_hash, engine_version)
    REFERENCES public.etude_analyses (source_hash, engine_version) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.etude_parcours (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  source_hash text,
  engine_version text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  sequence_courante integer NOT NULL DEFAULT 0 CHECK (sequence_courante >= 0),
  sequence_max integer NOT NULL DEFAULT 1 CHECK (sequence_max >= 1),
  synthese_vue_at timestamptz,
  statut text NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'termine')),
  termine_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_id)
);

CREATE TABLE IF NOT EXISTS public.etude_tentatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  sequence_ordre integer NOT NULL,
  activite_id text NOT NULL,
  numero integer NOT NULL CHECK (numero >= 1 AND numero <= 20),
  reponse text NOT NULL CHECK (char_length(reponse) <= 4000),
  verdict text NOT NULL CHECK (verdict IN ('juste', 'partiel', 'faux')),
  retour jsonb,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Une tentative n°k par activité et par étudiant : deux requêtes simultanées ne comptent qu'une fois.
  UNIQUE (user_id, document_id, sequence_ordre, activite_id, numero),
  -- Une requête réseau rejouée (même request_id) ne crée pas une deuxième tentative.
  UNIQUE (user_id, request_id)
);

CREATE TABLE IF NOT EXISTS public.etude_a_revoir (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  sequence_ordre integer NOT NULL,
  activite_id text NOT NULL,
  notion text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolu_at timestamptz,
  PRIMARY KEY (user_id, document_id, sequence_ordre, activite_id)
);

-- Index des lectures fréquentes -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_etude_parcours_user ON public.etude_parcours (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_etude_tentatives_lookup ON public.etude_tentatives (user_id, document_id, sequence_ordre, activite_id);
CREATE INDEX IF NOT EXISTS idx_etude_a_revoir_user ON public.etude_a_revoir (user_id, document_id) WHERE resolu_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_etude_tentatives_document ON public.etude_tentatives (document_id);
CREATE INDEX IF NOT EXISTS idx_etude_parcours_document ON public.etude_parcours (document_id);

-- Sécurité ------------------------------------------------------------------------------
ALTER TABLE public.etude_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etude_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etude_parcours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etude_tentatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etude_a_revoir ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.etude_analyses, public.etude_sequences FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.etude_parcours, public.etude_tentatives, public.etude_a_revoir FROM anon, authenticated;

DROP POLICY IF EXISTS etude_parcours_select_own ON public.etude_parcours;
CREATE POLICY etude_parcours_select_own ON public.etude_parcours FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS etude_tentatives_select_own ON public.etude_tentatives;
CREATE POLICY etude_tentatives_select_own ON public.etude_tentatives FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS etude_a_revoir_select_own ON public.etude_a_revoir;
CREATE POLICY etude_a_revoir_select_own ON public.etude_a_revoir FOR SELECT USING (auth.uid() = user_id);

-- Vérification (lecture seule) : doit afficher 5.
SELECT count(*) AS tables_creees_attendu_5
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('etude_analyses', 'etude_sequences', 'etude_parcours', 'etude_tentatives', 'etude_a_revoir');

-- -----------------------------------------------------------------------------------
-- Retour arrière (seulement en cas de problème ; supprime les données v3) :
-- DROP TABLE IF EXISTS public.etude_a_revoir, public.etude_tentatives,
--   public.etude_parcours, public.etude_sequences, public.etude_analyses;
-- -----------------------------------------------------------------------------------
