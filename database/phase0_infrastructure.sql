-- PHASE 0 : CORRECTION DE L'INFRASTRUCTURE

-- 1. CRÉATION DU BUCKET STORAGE "documents"
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- 2. (Ignoré : La sécurité RLS est déjà gérée nativement par Supabase pour le Storage)

-- 3. POLITIQUES DE PERMISSIONS POUR LE BUCKET (RLS)
-- L'utilisateur peut insérer ses propres fichiers
DROP POLICY IF EXISTS "Les utilisateurs peuvent uploader leurs documents" ON storage.objects;
CREATE POLICY "Les utilisateurs peuvent uploader leurs documents"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'documents' AND auth.uid() = owner );

-- L'utilisateur peut lire ses propres fichiers
DROP POLICY IF EXISTS "Les utilisateurs peuvent voir leurs propres documents" ON storage.objects;
CREATE POLICY "Les utilisateurs peuvent voir leurs propres documents"
ON storage.objects FOR SELECT
USING ( bucket_id = 'documents' AND auth.uid() = owner );

-- L'utilisateur peut supprimer ses propres fichiers
DROP POLICY IF EXISTS "Les utilisateurs peuvent supprimer leurs documents" ON storage.objects;
CREATE POLICY "Les utilisateurs peuvent supprimer leurs documents"
ON storage.objects FOR DELETE
USING ( bucket_id = 'documents' AND auth.uid() = owner );

-- 4. CORRECTION DU SCHÉMA DE LA TABLE documents
-- Le code frontend utilise des colonnes 'url_fichier' et 'taille' qui n'existaient pas dans la version initiale.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS url_fichier TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS taille BIGINT;

-- 5. SÉCURISATION (RLS) DES TABLES MANQUANTES
ALTER TABLE public.matieres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_matieres" ON public.matieres;
CREATE POLICY "select_matieres" ON public.matieres FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_matieres" ON public.matieres;
CREATE POLICY "insert_matieres" ON public.matieres FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_matieres" ON public.matieres;
CREATE POLICY "update_matieres" ON public.matieres FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_matieres" ON public.matieres;
CREATE POLICY "delete_matieres" ON public.matieres FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_documents" ON public.documents;
CREATE POLICY "select_documents" ON public.documents FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_documents" ON public.documents;
CREATE POLICY "insert_documents" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_documents" ON public.documents;
CREATE POLICY "delete_documents" ON public.documents FOR DELETE USING (auth.uid() = user_id);
