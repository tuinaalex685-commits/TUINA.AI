-- ========================================================
-- MODULE ÉTUDE GUIDÉE (TUINA.AI)
-- Architecture en 2 couches : 
--   Couche 1 (Contenu généré, partagé)
--   Couche 2 (Progression, individuelle)
-- ========================================================

-- ========================================================
-- COUCHE 1 : CONTENU (Généré par l'IA, partagé)
-- ========================================================

CREATE TYPE etude_generation_status AS ENUM ('pending', 'en_cours', 'pret', 'erreur');

CREATE TABLE public.etude_cours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pdf_id UUID NOT NULL, -- Doit référencer la table des PDFs/Documents existante
    statut_generation etude_generation_status DEFAULT 'pending',
    generation_hash TEXT UNIQUE, -- SHA256 du PDF pour éviter les doublons
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.etude_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cours_id UUID NOT NULL REFERENCES public.etude_cours(id) ON DELETE CASCADE,
    ordre INTEGER NOT NULL,
    titre TEXT NOT NULL,
    synthese TEXT NOT NULL,
    questions_cloture JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE public.etude_themes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES public.etude_sections(id) ON DELETE CASCADE,
    ordre INTEGER NOT NULL,
    titre TEXT NOT NULL,
    explication TEXT NOT NULL,
    question_forme JSONB NOT NULL,
    cas_pratique_fond JSONB NOT NULL,
    remediation_forme JSONB DEFAULT '[]'::jsonb,
    remediation_fond JSONB DEFAULT '[]'::jsonb
);

-- Index pour la performance de lecture (Couche 1)
CREATE INDEX idx_etude_sections_cours ON public.etude_sections(cours_id);
CREATE INDEX idx_etude_themes_section ON public.etude_themes(section_id);

-- RLS Couche 1 (Lecture publique pour les utilisateurs authentifiés, écriture bloquée sauf backend)
ALTER TABLE public.etude_cours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etude_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etude_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture autorisée pour tous" ON public.etude_cours FOR SELECT USING (true);
CREATE POLICY "Lecture autorisée pour tous" ON public.etude_sections FOR SELECT USING (true);
CREATE POLICY "Lecture autorisée pour tous" ON public.etude_themes FOR SELECT USING (true);

-- ========================================================
-- COUCHE 2 : PROGRESSION (Individuelle, privée)
-- ========================================================

CREATE TYPE etude_section_etat AS ENUM ('non_commencee', 'synthese_vue', 'themes_en_cours', 'cloture_reussie');

CREATE TABLE public.etude_progression_cours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Référence à auth.users (géré par Supabase)
    cours_id UUID NOT NULL REFERENCES public.etude_cours(id) ON DELETE CASCADE,
    statut TEXT DEFAULT 'en_cours', -- 'en_cours', 'termine'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, cours_id)
);

CREATE TABLE public.etude_progression_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    section_id UUID NOT NULL REFERENCES public.etude_sections(id) ON DELETE CASCADE,
    etat etude_section_etat DEFAULT 'non_commencee',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, section_id)
);

CREATE TABLE public.etude_progression_themes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    theme_id UUID NOT NULL REFERENCES public.etude_themes(id) ON DELETE CASCADE,
    forme_validee BOOLEAN DEFAULT false,
    fond_valide BOOLEAN DEFAULT false,
    tentatives_forme INTEGER DEFAULT 0,
    tentatives_fond INTEGER DEFAULT 0,
    reponses JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, theme_id)
);

-- Index pour la performance de lecture (Couche 2)
CREATE INDEX idx_etude_prog_cours_user ON public.etude_progression_cours(user_id);
CREATE INDEX idx_etude_prog_sections_user ON public.etude_progression_sections(user_id, section_id);
CREATE INDEX idx_etude_prog_themes_user ON public.etude_progression_themes(user_id, theme_id);

-- RLS Couche 2 (Strictement limitée au user_id)
ALTER TABLE public.etude_progression_cours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etude_progression_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etude_progression_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Propriétaire uniquement (Select)" ON public.etude_progression_cours FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Propriétaire uniquement (Insert)" ON public.etude_progression_cours FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Propriétaire uniquement (Update)" ON public.etude_progression_cours FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Propriétaire uniquement (Select)" ON public.etude_progression_sections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Propriétaire uniquement (Insert)" ON public.etude_progression_sections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Propriétaire uniquement (Update)" ON public.etude_progression_sections FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Propriétaire uniquement (Select)" ON public.etude_progression_themes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Propriétaire uniquement (Insert)" ON public.etude_progression_themes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Propriétaire uniquement (Update)" ON public.etude_progression_themes FOR UPDATE USING (auth.uid() = user_id);
