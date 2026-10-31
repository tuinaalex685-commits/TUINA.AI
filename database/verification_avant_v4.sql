-- =============================================================================
-- Vérification EN LECTURE SEULE avant la mise en production des Études guidées v4.
-- À coller dans l'éditeur SQL de Supabase (projet de production). Ne modifie rien.
-- Chaque ligne doit afficher « oui ». Une ligne « non » = migration à appliquer d'abord.
-- =============================================================================
SELECT '08 file IA (claim_ai_job_v2)' AS migration,
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'claim_ai_job_v2') THEN 'oui' ELSE 'non' END AS appliquee
UNION ALL
SELECT '09 codes d''activation (activate_access_code)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'activate_access_code')
             AND to_regclass('public.access_code_history') IS NOT NULL THEN 'oui' ELSE 'non' END
UNION ALL
SELECT '10 stockage : lecture réservée au propriétaire',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                             AND policyname = 'Voir documents') THEN 'oui' ELSE 'non' END
UNION ALL
SELECT '11 Études guidées v4 (4 colonnes)',
       CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'etude_analyses'
                  AND column_name IN ('titre', 'idee_centrale', 'modules', 'analyses')) = 4 THEN 'oui' ELSE 'non' END;
