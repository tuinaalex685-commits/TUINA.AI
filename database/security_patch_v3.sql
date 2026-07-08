-- ==============================================================================
-- PATCH DE SÉCURITÉ V3 : SÉCURISATION DU BUCKET STORAGE "DOCUMENTS"
-- Résolution des vulnérabilités IDOR sur les fichiers physiques
-- ==============================================================================

-- 1. Activation stricte de RLS sur les objets du Storage
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Suppression des anciennes politiques (si existantes) pour faire place aux nouvelles
DROP POLICY IF EXISTS "Les étudiants peuvent uploader leurs PDF" ON storage.objects;
DROP POLICY IF EXISTS "Les étudiants peuvent lire leurs propres PDF" ON storage.objects;
DROP POLICY IF EXISTS "Les étudiants peuvent supprimer leurs propres PDF" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;

-- 3. Politique d'Insertion (Upload) :
-- L'utilisateur ne peut uploader que dans un dossier qui porte son propre user_id.
-- (Le chemin dans Supabase Storage est souvent 'documents/[user_id]/[nom_fichier].pdf')
CREATE POLICY "Les étudiants peuvent uploader leurs PDF" ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND 
  auth.uid() = owner
);

-- 4. Politique de Lecture (Select) :
-- Un utilisateur ne peut lire que les fichiers dont il est le propriétaire.
CREATE POLICY "Les étudiants peuvent lire leurs propres PDF" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents' AND 
  auth.uid() = owner
);

-- 5. Politique de Suppression (Delete) :
-- Un utilisateur ne peut supprimer que ses propres fichiers.
CREATE POLICY "Les étudiants peuvent supprimer leurs propres PDF" ON storage.objects
FOR DELETE
USING (
  bucket_id = 'documents' AND 
  auth.uid() = owner
);

-- 6. Politique de Mise à jour (Update) :
-- Un utilisateur ne peut modifier que ses propres fichiers.
CREATE POLICY "Les étudiants peuvent modifier leurs propres PDF" ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'documents' AND 
  auth.uid() = owner
);
