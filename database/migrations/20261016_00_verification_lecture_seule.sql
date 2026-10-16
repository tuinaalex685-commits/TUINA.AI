-- ==============================================================================
-- 00 — ÉTAT DES LIEUX (LECTURE SEULE) — à exécuter AVANT les migrations 01 et 02.
--
-- Aucune modification : uniquement des SELECT. Sert à confirmer l'état réel de la production
-- (point V-01 du SGP_MASTER_PLAN.md : les fichiers database/ n'ont pas de registre d'application).
-- Copie les résultats et transmets-les : ils permettent d'ajuster 01 si besoin.
-- ==============================================================================

-- 1. Tables du schéma public SANS Row Level Security (doit être vide).
SELECT c.relname AS table_sans_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 1;

-- 2. Politiques RLS en place sur les tables sensibles.
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('ai_jobs', 'documents', 'access_codes', 'user_roles', 'redactions',
                    'etude_cours', 'etude_sections', 'etude_themes', 'examen_sessions')
ORDER BY tablename, policyname;

-- 3. Qui peut exécuter les fonctions SECURITY DEFINER (anon / authenticated ne devraient pas).
SELECT p.proname AS fonction,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_peut,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_peut,
       p.proconfig                                               AS reglages
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY 1;

-- 4. Le bucket des PDF est-il public ?
SELECT id, public FROM storage.buckets WHERE id = 'documents';

-- 5. Codes d'accès : volumes par statut et emails avec majuscules (à normaliser).
SELECT status, (email IS NOT NULL) AS rattache, count(*) FROM public.access_codes GROUP BY 1, 2 ORDER BY 1, 2;
SELECT count(*) AS emails_avec_majuscules FROM public.access_codes WHERE email IS NOT NULL AND email <> lower(email);

-- 6. Tables publiées en temps réel (le tableau de bord écoute tout le schéma).
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY 1;
