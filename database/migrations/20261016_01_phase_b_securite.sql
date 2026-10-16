-- ==============================================================================
-- 01 — PHASE B : SÉCURITÉ ET ABONNEMENT D'UN MOIS
--
-- À APPLIQUER APRÈS LE DÉPLOIEMENT DU CODE de la branche fix/phase-b-securite-latence
-- (le nouveau code n'utilise plus les droits retirés ici ; l'ancien code, lui, en a besoin).
-- Transactionnel : tout passe ou rien ne passe. Retour arrière en bas du fichier.
--
-- Corrige (voir SGP_MASTER_PLAN.md) :
--   C-02  insertion directe de jobs IA par le navigateur
--   C-06  insertion directe de documents par le navigateur (url_fichier libre)
--   C-17  fonctions SECURITY DEFINER appelables par tout le monde (claim_ai_job renvoyait les
--         jobs — et donc les corrections — des autres utilisateurs)
--   C-18  examen_save_answer appelable directement (réponses après la fin du chrono)
--   C-14  « le premier inscrit devient administrateur »
--   + abonnement Premium d'un mois : access_codes.expires_at
-- ==============================================================================
BEGIN;

-- 1. JOBS IA : plus aucune création depuis le navigateur ----------------------------------------
-- Le serveur crée les jobs avec le service role (enqueueAiJob, /api/etude/generate), après
-- contrôle de propriété, du Premium et des quotas. La lecture de SES jobs reste permise.
DROP POLICY IF EXISTS "ai_jobs_insert_own" ON public.ai_jobs;

-- 2. DOCUMENTS : plus aucune insertion depuis le navigateur -----------------------------------
-- Le serveur enregistre le document (registerDocument) à partir du chemin Storage vérifié.
DROP POLICY IF EXISTS "insert_documents" ON public.documents;

-- 3. FONCTIONS SECURITY DEFINER : réservées au serveur ----------------------------------------
-- Supabase accorde par défaut EXECUTE à anon et authenticated : REVOKE FROM PUBLIC ne suffit pas.
REVOKE ALL ON FUNCTION public.claim_ai_job(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_job(timestamptz, timestamptz) TO service_role;
ALTER FUNCTION public.claim_ai_job(timestamptz, timestamptz) SET search_path = public;

REVOKE ALL ON FUNCTION public.examen_save_answer(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.examen_save_answer(uuid, uuid, text, jsonb) TO service_role;
ALTER FUNCTION public.examen_save_answer(uuid, uuid, text, jsonb) SET search_path = public;

REVOKE ALL ON FUNCTION public.consume_free_quota(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_free_quota(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_free_quota(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_free_quota(uuid, text) TO service_role;

-- 4. INSCRIPTION : plus jamais d'administrateur automatique ------------------------------------
-- Avant : le premier compte créé (base vide, restauration, environnement de test) devenait admin.
-- Un administrateur se nomme désormais explicitement :
--   UPDATE public.user_roles SET role = 'admin' WHERE user_id = '<uuid>';
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, email, role)
  VALUES (NEW.id, lower(NEW.email), 'student')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 5. ABONNEMENT D'UN MOIS ------------------------------------------------------------------
-- Le Premium vaut tant que le code est 'active' ET que expires_at est dans le futur. À la date,
-- l'étudiant redevient Free automatiquement (calcul à la lecture, aucune tâche planifiée).
-- L'administrateur « Réactive » → expires_at = maintenant + 30 jours.
ALTER TABLE public.access_codes ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Codes déjà rattachés et actifs : on leur donne un mois à partir d'aujourd'hui (aucun étudiant
-- payant ne perd son accès le jour de la migration). DÉCISION À CONFIRMER si tu préfères une autre date.
UPDATE public.access_codes
   SET expires_at = now() + interval '30 days'
 WHERE email IS NOT NULL AND status = 'active' AND expires_at IS NULL;

-- 6. EMAILS NORMALISÉS (minuscules) --------------------------------------------------------
-- Les comparaisons se font désormais à l'identique (insensible à la casse, sans jokers).
UPDATE public.access_codes SET email = lower(email) WHERE email IS NOT NULL AND email <> lower(email);
UPDATE public.user_roles   SET email = lower(email) WHERE email <> lower(email);

CREATE INDEX IF NOT EXISTS idx_access_codes_email ON public.access_codes (email);

COMMIT;

-- ==============================================================================
-- VÉRIFICATION (après COMMIT) : relancer le fichier 00. Attendu :
--   - plus de policy ai_jobs_insert_own ni insert_documents ;
--   - anon_peut = false et authenticated_peut = false pour les 5 fonctions.
-- ==============================================================================
-- RETOUR ARRIÈRE (seulement si le code précédent est redéployé) :
-- BEGIN;
-- CREATE POLICY "ai_jobs_insert_own" ON public.ai_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "insert_documents" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
-- GRANT EXECUTE ON FUNCTION public.claim_ai_job(timestamptz, timestamptz) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.examen_save_answer(uuid, uuid, text, jsonb) TO anon, authenticated;
-- (la colonne expires_at peut rester : l'ancien code l'ignore)
-- COMMIT;
-- ==============================================================================
