-- ==============================================================================
-- PATCH CORRECTIF : NORMALISATION DU STATUT DES RÉDACTIONS
-- Contexte : le worker /api/worker/redaction écrivait 'analysé' (avec accent), alors que
-- le frontend et getDailyRedactionUsage attendent 'analyse' (sans accent). Les corrections
-- terminées par le worker étaient donc invisibles pour l'étudiant et non comptées.
-- Ce script réaligne les lignes existantes sur la valeur canonique 'analyse'.
-- Idempotent : peut être ré-exécuté sans risque.
-- ==============================================================================

UPDATE public.redactions
SET statut = 'analyse'
WHERE statut = 'analysé';
