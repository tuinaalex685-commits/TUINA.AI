-- ==============================================================================
-- INC.3 — SOFT-GATE RÉDACTION (rattachement facultatif rédaction ↔ cours Étude)
-- ==============================================================================
-- Objectif : permettre d'associer FACULTATIVEMENT une rédaction à un cours du
-- module Étude (etude_cours) afin d'afficher, AVANT de rédiger, une
-- recommandation NON BLOQUANTE de revoir les thèmes encore insuffisamment
-- maîtrisés de ce cours. Le bouton « Continuer quand même » reste toujours
-- disponible côté UI : ce soft-gate ne bloque jamais rien.
--
-- Portée V1 (validée 2026-07-15) : rattachement au niveau du COURS uniquement,
-- PAS de lien précis rédaction ↔ thèmes (reporté V2). Aucune donnée de maîtrise
-- n'est écrite ici : la maîtrise reste dérivée de la vue theme_mastery.
--
-- Idempotent : peut être ré-exécuté sans risque.
-- À exécuter EN PROD avant de déployer le code qui écrit etude_cours_id.
-- (La lecture dégrade gracieusement si la colonne est absente ; seule
-- l'écriture du lien la requiert.)
--
-- NB : colonne DISTINCTE de l'ancienne `cours_id` (FK → public.cours, arbre
-- legacy matières→cours, jamais renseignée) — on ne recycle pas cette colonne
-- pour éviter toute confusion d'espaces d'ID.
-- ==============================================================================

ALTER TABLE public.redactions
  ADD COLUMN IF NOT EXISTS etude_cours_id UUID NULL
  REFERENCES public.etude_cours(id) ON DELETE SET NULL;

-- Index léger : la bannière filtre les rédactions par cours associé.
CREATE INDEX IF NOT EXISTS idx_redactions_etude_cours_id
  ON public.redactions(etude_cours_id);
