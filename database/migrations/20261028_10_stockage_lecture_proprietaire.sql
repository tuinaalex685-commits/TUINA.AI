-- =====================================================================================
-- 10 — Stockage : lecture des PDF réservée à leur propriétaire (correctif de sécurité)
--
-- Constat (production, 28/10/2026, lecture du catalogue) : la politique « Voir documents » sur
-- storage.objects autorise la LECTURE de tout objet du bucket « documents » au rôle PUBLIC,
-- sans condition de propriétaire. Les politiques étant permissives (OU logique), elle annule
-- les autres : avec la seule clé publique du site, n'importe qui peut lister les dossiers et
-- télécharger les PDF de tous les étudiants (57 fichiers, 18 dossiers à ce jour).
--
-- L'application n'en dépend pas :
--   * lectures serveur (worker, URL signées) : service role, qui ignore la RLS ;
--   * envoi depuis le navigateur : upload(upsert: false) = INSERT, couvert par sa politique ;
--   * l'étudiant garde la lecture de SES fichiers (« Les utilisateurs peuvent voir leurs propres
--     documents » : owner = auth.uid()).
-- Aucune donnée n'est modifiée ni supprimée : seule une règle d'accès trop large est retirée.
-- =====================================================================================

drop policy if exists "Voir documents" on storage.objects;

-- Vérification : plus aucune politique de lecture du bucket sans condition de propriétaire.
select policyname, cmd, qual
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL')
   and qual ilike '%documents%' and qual not ilike '%owner%';
-- Résultat attendu : AUCUNE ligne.
