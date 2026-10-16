-- ==============================================================================
-- 02 — PDF DES ÉTUDIANTS PRIVÉS (C-05)
--
-- À APPLIQUER EN DERNIER, après avoir vérifié sur le site déployé que la Bibliothèque et les
-- Matières ouvrent bien les PDF (liens signés « ...?token=... » au lieu de « /public/... »).
--
-- Effet : les anciennes adresses publiques des PDF cessent de fonctionner (c'est le but : elles
-- ouvraient le fichier à quiconque avait le lien). L'application génère des liens signés valables
-- 1 heure. Les politiques Storage « dossier du propriétaire » restent en place.
-- ==============================================================================
UPDATE storage.buckets SET public = false WHERE id = 'documents';

-- Vérification : doit renvoyer public = false
SELECT id, public FROM storage.buckets WHERE id = 'documents';

-- RETOUR ARRIÈRE :
-- UPDATE storage.buckets SET public = true WHERE id = 'documents';
