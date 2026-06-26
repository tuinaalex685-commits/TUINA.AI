-- Schéma Supabase pour Tuina.ai (V1)
-- Fusionné avec les évaluations et rédactions complètes.

-- Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. Gestion des Rôles (Administrateur)
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fonction pour attribuer automatiquement le rôle 'admin' au premier utilisateur, et 'student' aux suivants
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, email, role)
  VALUES (
    NEW.id, 
    NEW.email, 
    CASE WHEN (SELECT count(*) FROM public.user_roles) = 0 THEN 'admin' ELSE 'student' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger pour déclencher la fonction à chaque nouvel utilisateur
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 1. Tables d'accès et d'authentification
CREATE TABLE IF NOT EXISTS public.access_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  email TEXT, -- Sera rempli quand le code sera réclamé
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Code d'accès de test (comme demandé par l'utilisateur)
INSERT INTO public.access_codes (code, status) VALUES ('TUINA-TEST', 'active') ON CONFLICT DO NOTHING;


-- 2. Tables de base pédagogiques
CREATE TABLE IF NOT EXISTS public.matieres (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  titre TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  matiere_id UUID REFERENCES public.matieres(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Entité centrale : Le Chapitre
CREATE TABLE IF NOT EXISTS public.chapitres (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cours_id UUID REFERENCES public.cours(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  contenu_texte TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- 3. La Bibliothèque Documentaire
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  nom TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  matiere_id UUID REFERENCES public.matieres(id) ON DELETE SET NULL,
  chapitre_id UUID REFERENCES public.chapitres(id) ON DELETE SET NULL,
  date_import TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- 4. Révisions & Évaluations (Flashcards & Quiz)
DO $$ BEGIN
    CREATE TYPE ia_status AS ENUM ('draft', 'validated', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.flashcards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chapitre_id UUID REFERENCES public.chapitres(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  reponse TEXT NOT NULL,
  statut ia_status DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chapitre_id UUID REFERENCES public.chapitres(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  reponse_correcte TEXT NOT NULL,
  statut ia_status DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.evaluations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type VARCHAR(50) NOT NULL CHECK (type IN ('quiz', 'qcm')),
    questions JSONB NOT NULL,
    score INT,
    user_id UUID NOT NULL,
    cours_id UUID NOT NULL,
    document_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    FOREIGN KEY (cours_id) REFERENCES public.cours(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL
);

-- RLS pour les évaluations
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Les utilisateurs peuvent voir leurs propres évaluations" ON public.evaluations;
CREATE POLICY "Les utilisateurs peuvent voir leurs propres évaluations" ON public.evaluations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Les utilisateurs peuvent insérer leurs propres évaluations" ON public.evaluations;
CREATE POLICY "Les utilisateurs peuvent insérer leurs propres évaluations" ON public.evaluations FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Les utilisateurs peuvent mettre à jour leurs propres évaluations" ON public.evaluations;
CREATE POLICY "Les utilisateurs peuvent mettre à jour leurs propres évaluations" ON public.evaluations FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Les utilisateurs peuvent supprimer leurs propres évaluations" ON public.evaluations;
CREATE POLICY "Les utilisateurs peuvent supprimer leurs propres évaluations" ON public.evaluations FOR DELETE USING (auth.uid() = user_id);


-- 5. Objectifs
CREATE TABLE IF NOT EXISTS public.objectifs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  type TEXT NOT NULL,
  cible INTEGER NOT NULL,
  valeur_actuelle INTEGER DEFAULT 0,
  date_debut TIMESTAMP WITH TIME ZONE,
  date_fin TIMESTAMP WITH TIME ZONE,
  est_atteint BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- 6. Rédactions (Analyses juridiques)
CREATE TABLE IF NOT EXISTS public.redactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    titre VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    statut VARCHAR(50) DEFAULT 'brouillon',
    contenu TEXT,
    rapport_analyse JSONB,
    user_id UUID NOT NULL,
    cours_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    FOREIGN KEY (cours_id) REFERENCES public.cours(id) ON DELETE CASCADE
);

-- RLS pour les rédactions
ALTER TABLE public.redactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Les utilisateurs peuvent voir leurs propres rédactions" ON public.redactions;
CREATE POLICY "Les utilisateurs peuvent voir leurs propres rédactions" ON public.redactions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Les utilisateurs peuvent insérer leurs propres rédactions" ON public.redactions;
CREATE POLICY "Les utilisateurs peuvent insérer leurs propres rédactions" ON public.redactions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Les utilisateurs peuvent mettre à jour leurs propres rédactions" ON public.redactions;
CREATE POLICY "Les utilisateurs peuvent mettre à jour leurs propres rédactions" ON public.redactions FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Les utilisateurs peuvent supprimer leurs propres rédactions" ON public.redactions;
CREATE POLICY "Les utilisateurs peuvent supprimer leurs propres rédactions" ON public.redactions FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.redaction_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  redaction_id UUID REFERENCES public.redactions(id) ON DELETE CASCADE,
  contenu TEXT NOT NULL,
  feedback_ia TEXT,
  score INTEGER,
  date_soumission TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
