-- ==============================================================================
-- INTÉGRITÉ ÉTUDE — rend les écritures IDEMPOTENTES sous forte concurrence.
-- Sous 100-500 jobs simultanés, un même job peut (rarement) être traité 2×. Sans contrainte,
-- cela crée des doublons : ligne etude_cours en double (même pdf_id) OU sections clonées 2× (3+3=6).
-- Ces contraintes UNIQUE + les UPSERT côté worker rendent tout double-traitement INOFFENSIF.
-- Idempotent et rejouable. On déduplique d'abord l'existant, puis on ajoute la contrainte.
-- ==============================================================================

-- 1. etude_cours : un seul cours par pdf_id. On garde le 'pret' le plus complet ; on supprime les autres.
DELETE FROM public.etude_cours a
USING public.etude_cours b
WHERE a.pdf_id = b.pdf_id
  AND a.id <> b.id
  AND (
        ( (b.statut_generation = 'pret') AND (a.statut_generation IS DISTINCT FROM 'pret') )
     OR ( (a.statut_generation IS NOT DISTINCT FROM b.statut_generation) AND a.ctid > b.ctid )
      );
ALTER TABLE public.etude_cours DROP CONSTRAINT IF EXISTS etude_cours_pdf_id_key;
ALTER TABLE public.etude_cours ADD  CONSTRAINT etude_cours_pdf_id_key UNIQUE (pdf_id);

-- 2. etude_sections : une seule section par (cours_id, ordre).
DELETE FROM public.etude_sections a
USING public.etude_sections b
WHERE a.cours_id = b.cours_id AND a.ordre = b.ordre AND a.ctid > b.ctid;
ALTER TABLE public.etude_sections DROP CONSTRAINT IF EXISTS etude_sections_cours_ordre_key;
ALTER TABLE public.etude_sections ADD  CONSTRAINT etude_sections_cours_ordre_key UNIQUE (cours_id, ordre);

-- 3. etude_themes : un seul thème par (section_id, ordre).
DELETE FROM public.etude_themes a
USING public.etude_themes b
WHERE a.section_id = b.section_id AND a.ordre = b.ordre AND a.ctid > b.ctid;
ALTER TABLE public.etude_themes DROP CONSTRAINT IF EXISTS etude_themes_section_ordre_key;
ALTER TABLE public.etude_themes ADD  CONSTRAINT etude_themes_section_ordre_key UNIQUE (section_id, ordre);
