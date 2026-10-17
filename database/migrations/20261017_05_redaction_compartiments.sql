-- =============================================================================
-- Migration 05 — Rédaction : compartiments, sources, versions corrigées, anti-triche
-- =============================================================================
-- 1. Une copie connaît sa SOURCE (un cours de l'étudiant ou un sujet libre) et son
--    ÉNONCÉ complet (faits du cas pratique, texte de l'arrêt, consignes).
-- 2. Chaque version corrigée garde son rapport et sa note : comparaison des progrès.
-- 3. Cache des sujets proposés par cours (un seul appel IA par contenu et par type).
-- 4. ANTI-TRICHE : jusqu'ici, la RLS laissait un étudiant écrire lui-même sa note
--    (redactions.rapport_analyse, statut) et insérer des versions avec un score choisi.
--    Avec les points et le bonus BD, ce serait une fraude triviale. Désormais le
--    navigateur ne peut modifier QUE le texte de sa copie ; tout le reste passe par
--    le serveur (actions serveur et worker, avec le service role).
--
-- Sans perte de données : on ajoute des colonnes et des index, on restreint des droits.
-- Retour arrière : bloc en fin de fichier.
-- =============================================================================

-- 1. Source et énoncé ------------------------------------------------------------
ALTER TABLE public.redactions
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'libre',
  ADD COLUMN IF NOT EXISTS enonce text,
  ADD COLUMN IF NOT EXISTS note numeric(4,2);

DO $$ BEGIN
  ALTER TABLE public.redactions
    ADD CONSTRAINT redactions_source_check CHECK (source IN ('cours', 'libre'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.redactions
    ADD CONSTRAINT redactions_note_check CHECK (note IS NULL OR (note >= 0 AND note <= 20));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Versions corrigées ------------------------------------------------------------
ALTER TABLE public.redaction_versions
  ADD COLUMN IF NOT EXISTS numero integer,
  ADD COLUMN IF NOT EXISTS rapport jsonb,
  ADD COLUMN IF NOT EXISTS note numeric(4,2);

-- Un numéro de version par copie : une correction relancée ne crée pas de doublon.
CREATE UNIQUE INDEX IF NOT EXISTS uq_redaction_versions_numero
  ON public.redaction_versions (redaction_id, numero)
  WHERE numero IS NOT NULL;

-- 3. Index des écrans Rédaction --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_redactions_user_date
  ON public.redactions (user_id, date_creation DESC);
CREATE INDEX IF NOT EXISTS idx_redaction_versions_redaction
  ON public.redaction_versions (redaction_id, date_soumission DESC);
CREATE INDEX IF NOT EXISTS idx_redactions_document
  ON public.redactions (document_id) WHERE document_id IS NOT NULL;

-- 4. Cache des sujets proposés (service role uniquement : RLS sans policy) ------------
CREATE TABLE IF NOT EXISTS public.redaction_sujets (
  source_hash text NOT NULL,
  type text NOT NULL,
  sujets jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_hash, type)
);
ALTER TABLE public.redaction_sujets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.redaction_sujets FROM anon, authenticated;

-- 5. Anti-triche -----------------------------------------------------------------------
-- Copies : création par le serveur ; le navigateur ne modifie que le texte.
REVOKE INSERT, UPDATE ON public.redactions FROM anon, authenticated;
GRANT UPDATE (contenu, updated_at) ON public.redactions TO authenticated;

-- Longueur maximale d'une copie, garantie par la base (et pas seulement par l'écran).
-- NOT VALID : les anciennes copies ne sont pas vérifiées rétroactivement, les nouvelles le sont.
DO $$ BEGIN
  ALTER TABLE public.redactions
    ADD CONSTRAINT redactions_contenu_len CHECK (contenu IS NULL OR char_length(contenu) <= 20000) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Une copie en correction ou corrigée n'est plus modifiable par l'étudiant, même en appelant
-- l'API directement : il doit cliquer sur « Retravailler » (action serveur). Le serveur
-- (service role) n'est pas concerné.
CREATE OR REPLACE FUNCTION public.redactions_guard_contenu()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contenu IS DISTINCT FROM OLD.contenu
     AND COALESCE(OLD.statut, 'brouillon') NOT IN ('brouillon', 'erreur')
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Copie non modifiable dans cet état (%)', OLD.statut USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_redactions_guard_contenu ON public.redactions;
CREATE TRIGGER trg_redactions_guard_contenu
  BEFORE UPDATE OF contenu ON public.redactions
  FOR EACH ROW EXECUTE FUNCTION public.redactions_guard_contenu();

-- Versions : lecture seule pour l'étudiant ; écrites par le serveur.
DROP POLICY IF EXISTS "Users can insert own versions" ON public.redaction_versions;
DROP POLICY IF EXISTS "Versions de rédaction : Accès utilisateur" ON public.redaction_versions;
REVOKE INSERT, UPDATE, DELETE ON public.redaction_versions FROM anon, authenticated;
-- La policy SELECT « Users can see own versions » est conservée.

-- Vérification (lecture seule) -------------------------------------------------------
SELECT 'colonnes redactions' AS controle, count(*) AS attendu_4
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'redactions'
  AND column_name IN ('document_id', 'source', 'enonce', 'note')
UNION ALL
SELECT 'colonnes versions', count(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'redaction_versions'
  AND column_name IN ('numero', 'rapport', 'note')
UNION ALL
SELECT 'table redaction_sujets', count(*)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'redaction_sujets';

-- -----------------------------------------------------------------------------------
-- Retour arrière (seulement en cas de problème) :
-- GRANT INSERT, UPDATE ON public.redactions TO authenticated;
-- GRANT INSERT, UPDATE, DELETE ON public.redaction_versions TO authenticated;
-- CREATE POLICY "Users can insert own versions" ON public.redaction_versions FOR INSERT
--   WITH CHECK (EXISTS (SELECT 1 FROM public.redactions r WHERE r.id = redaction_id AND r.user_id = auth.uid()));
-- DROP TRIGGER IF EXISTS trg_redactions_guard_contenu ON public.redactions;
-- DROP FUNCTION IF EXISTS public.redactions_guard_contenu();
-- ALTER TABLE public.redactions DROP CONSTRAINT IF EXISTS redactions_contenu_len;
-- DROP TABLE IF EXISTS public.redaction_sujets;
-- DROP INDEX IF EXISTS public.uq_redaction_versions_numero;
-- (les colonnes ajoutées peuvent rester : elles sont facultatives)
-- -----------------------------------------------------------------------------------
