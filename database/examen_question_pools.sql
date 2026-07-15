-- ==============================================================================
-- SECTION EXAMEN — EX.1 : BANQUE DE QUESTIONS MUTUALISÉE
-- Une banque par CONTENU (source_hash = sha256 du texte du document) : générée
-- une seule fois par Gemini, partagée entre tous les utilisateurs du même PDF
-- (patron evaluation_cache + single-flight ai_content_locks).
--
-- ⚠️ SÉCURITÉ CRITIQUE : cette table contient les CORRIGÉS. RLS activée SANS
-- AUCUNE policy → seul le service role (worker/serveur) peut lire ou écrire.
-- Le client ne reçoit JAMAIS cette table : les énoncés lui sont servis épurés
-- par le serveur (EX.2). Ne jamais ajouter de policy SELECT ici.
--
-- Les questions référencent les thèmes par clé positionnelle
-- (section_ordre, theme_ordre) — les theme_id ne sont pas partagés entre clones.
-- Idempotent.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.examen_question_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_hash TEXT NOT NULL UNIQUE,
    questions JSONB NOT NULL,
    question_count INTEGER NOT NULL,
    engine_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.examen_question_pools ENABLE ROW LEVEL SECURITY;
-- Aucune policy : accès service-role uniquement (les corrigés ne fuient jamais).
