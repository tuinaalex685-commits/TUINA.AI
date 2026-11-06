-- =====================================================================================
-- 14 — Stockage des PDF : mêmes règles que l'application, appliquées par Supabase lui-même
--
-- Constat (test d'intrusion du 05/11/2026) : en déposant un fichier DIRECTEMENT dans le stockage
-- (sans passer par SJP), un compte pouvait envoyer n'importe quel type de fichier (HTML testé),
-- de n'importe quelle taille, n'importe où dans le bucket (hors de son dossier). Les contrôles de
-- SJP (PDF, 25 Mo, dossier de l'étudiant) n'étaient appliqués que par l'application.
--
-- Effet : le bucket « documents » n'accepte plus que des PDF de 25 Mo au plus, et chaque étudiant
-- ne peut déposer que dans SON dossier (<id de l'étudiant>/…), exactement comme le fait déjà
-- l'import de SJP (DocumentUploader → registerDocument). Aucune donnée n'est modifiée ni supprimée ;
-- la lecture et la suppression ne changent pas (propriétaire uniquement).
--
-- Ce n'est PAS une limite de nombre de PDF : le Premium reste illimité en nombre.
-- =====================================================================================

update storage.buckets
   set allowed_mime_types = array['application/pdf'],
       file_size_limit = 26214400            -- 25 Mo, comme MAX_PDF_BYTES (src/app/actions/documents.ts)
 where id = 'documents';

-- Deux règles d'envoi coexistaient (permissives : l'une OU l'autre suffisait). Remplacées par une
-- seule, qui impose en plus le dossier de l'étudiant.
drop policy if exists "Les utilisateurs peuvent uploader leurs documents" on storage.objects;
drop policy if exists "Upload documents" on storage.objects;
drop policy if exists "Depot PDF dans son dossier" on storage.objects;
create policy "Depot PDF dans son dossier" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and auth.uid() = owner
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -------------------------------------------------------------------------------------
-- Fiches de révision : un étudiant ne peut plus écrire le CONTENU des fiches.
-- Les fiches d'un même cours sont copiées d'un étudiant à l'autre (empreinte source_hash). Les
-- règles RLS laissaient un compte insérer ou modifier SES fiches, empreinte, question et réponse
-- comprises : de fausses fiches pouvaient être recopiées chez d'autres étudiants.
-- L'application ne crée les fiches que côté serveur (clé de service) ; l'étudiant ne met à jour
-- que sa boîte de révision et la date de la prochaine révision (actions/ai.ts).
-- -------------------------------------------------------------------------------------
revoke insert, update on public.flashcards from anon, authenticated;
grant update (box, next_review) on public.flashcards to authenticated;

-- Vérification (lecture seule) : bucket limité aux PDF de 25 Mo, une seule règle d'envoi.
select id, allowed_mime_types, file_size_limit from storage.buckets where id = 'documents';
select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' order by cmd, policyname;
-- Fiches : « authenticated » ne doit plus avoir INSERT ; UPDATE seulement sur box et next_review.
select privilege_type, column_name from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'flashcards' and grantee = 'authenticated'
   and privilege_type in ('INSERT', 'UPDATE') order by 1, 2;

-- ROLLBACK :
--   update storage.buckets set allowed_mime_types = null, file_size_limit = null where id = 'documents';
--   drop policy if exists "Depot PDF dans son dossier" on storage.objects;
--   create policy "Upload documents" on storage.objects as permissive for insert to public
--     with check (bucket_id = 'documents' and auth.uid() = owner);
--   grant insert, update on public.flashcards to authenticated;
