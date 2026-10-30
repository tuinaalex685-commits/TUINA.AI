-- =====================================================================================
-- Schéma de la PRODUCTION SJP, reconstitué depuis son catalogue (lecture seule, 28/10/2026),
-- pour créer un environnement de TEST identique. À appliquer SUR UN PROJET DE TEST UNIQUEMENT.
-- Reproduit volontairement l'état réel (y compris la politique de stockage trop large corrigée
-- par la migration 10), afin de vérifier les correctifs sur un double fidèle.
-- Ordre : extensions, types, tables, contraintes, index, fonctions, triggers, droits, RLS,
-- politiques, stockage, realtime, données de référence. Puis migrations 08, 09, 10.
-- =====================================================================================

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema public;   -- comme en production

-- Types ---------------------------------------------------------------------------------
create type public.code_status as enum ('active', 'inactive', 'blocked');
create type public.etude_generation_status as enum ('pending', 'en_cours', 'pret', 'erreur');
create type public.etude_section_etat as enum ('non_commencee', 'synthese_vue', 'themes_en_cours', 'cloture_reussie');
create type public.ia_status as enum ('draft', 'validated', 'archived');

-- Tables --------------------------------------------------------------------------------
create table public.access_codes (id uuid default extensions.uuid_generate_v4() not null, email text, code text not null, status code_status default 'active'::code_status, created_by uuid, created_at timestamptz default now(), expires_at timestamptz);
create table public.admin_settings (key text not null, value jsonb not null, updated_at timestamptz default now() not null, updated_by uuid);
create table public.ai_content_locks (hash text not null, created_at timestamptz default now(), expires_at timestamptz default (now() + '00:05:00'::interval));
create table public.ai_jobs (id uuid default gen_random_uuid() not null, user_id uuid not null, type text not null, status text default 'queued'::text not null, payload jsonb default '{}'::jsonb not null, result jsonb, error text, attempts integer default 0 not null, content_hash text, lease_until timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), progress integer default 0 not null, phase text, next_attempt_at timestamptz, last_error text, result_ref text);
create table public.niveaux (code text not null, libelle text not null, ordre integer default 0 not null, actif boolean default true not null, created_at timestamptz default now() not null);
create table public.catalog_courses (id uuid default gen_random_uuid() not null, etude_cours_id uuid not null, titre_affiche text not null, matiere text, ordre integer default 0 not null, actif boolean default true not null, added_by uuid, created_at timestamptz default now() not null, niveau text);
create table public.matieres (id uuid default extensions.uuid_generate_v4() not null, user_id uuid, titre text not null, description text, created_at timestamptz default now());
create table public.cours (id uuid default extensions.uuid_generate_v4() not null, matiere_id uuid, titre text not null, created_at timestamptz default now());
create table public.chapitres (id uuid default extensions.uuid_generate_v4() not null, cours_id uuid, titre text not null, contenu_texte text, created_at timestamptz default now());
create table public.documents (id uuid default extensions.uuid_generate_v4() not null, user_id uuid, nom text not null, url text not null, type text not null, matiere_id uuid, chapitre_id uuid, date_import timestamptz default now(), cours_id uuid, url_fichier text, taille bigint, extracted_text text, intelligence_pedagogique jsonb, text_hash text);
create table public.etude_a_revoir (user_id uuid not null, document_id uuid not null, sequence_ordre integer not null, activite_id text not null, notion text not null, created_at timestamptz default now() not null, resolu_at timestamptz);
create table public.etude_analyses (source_hash text not null, engine_version text not null, statut text default 'en_cours'::text not null, couverture jsonb, carte jsonb, plan jsonb, synthese jsonb, carte_mentale jsonb, erreur text, created_at timestamptz default now() not null, updated_at timestamptz default now() not null, pages_texte jsonb);
create table public.etude_cours (id uuid default gen_random_uuid() not null, pdf_id uuid not null, statut_generation etude_generation_status default 'pending'::etude_generation_status, generation_hash text, created_at timestamptz default timezone('utc'::text, now()) not null, started_at timestamptz, updated_at timestamptz default now(), heartbeat timestamptz, retry_count integer default 0, next_retry timestamptz, last_error text);
create table public.etude_generation_cache (source_hash text not null, data jsonb not null, created_at timestamptz default now());
create table public.etude_generation_locks (hash text not null, created_at timestamptz default now(), expires_at timestamptz default (now() + '00:10:00'::interval));
create table public.etude_parcours (user_id uuid not null, document_id uuid not null, source_hash text, engine_version text not null, started_at timestamptz default now() not null, sequence_courante integer default 0 not null, sequence_max integer default 1 not null, synthese_vue_at timestamptz, statut text default 'en_cours'::text not null, termine_at timestamptz, updated_at timestamptz default now() not null);
create table public.etude_progression_cours (id uuid default gen_random_uuid() not null, user_id uuid not null, cours_id uuid not null, statut text default 'en_cours'::text, updated_at timestamptz default timezone('utc'::text, now()) not null);
create table public.etude_sections (id uuid default gen_random_uuid() not null, cours_id uuid not null, ordre integer not null, titre text not null, synthese text not null, questions_cloture jsonb default '[]'::jsonb);
create table public.etude_themes (id uuid default gen_random_uuid() not null, section_id uuid not null, ordre integer not null, titre text not null, explication text not null, question_forme jsonb not null, cas_pratique_fond jsonb not null, remediation_forme jsonb default '[]'::jsonb, remediation_fond jsonb default '[]'::jsonb);
create table public.etude_progression_sections (id uuid default gen_random_uuid() not null, user_id uuid not null, section_id uuid not null, etat etude_section_etat default 'non_commencee'::etude_section_etat, updated_at timestamptz default timezone('utc'::text, now()) not null);
create table public.etude_progression_themes (id uuid default gen_random_uuid() not null, user_id uuid not null, theme_id uuid not null, forme_validee boolean default false, fond_valide boolean default false, tentatives_forme integer default 0, tentatives_fond integer default 0, reponses jsonb default '[]'::jsonb, updated_at timestamptz default timezone('utc'::text, now()) not null);
create table public.etude_sequences (source_hash text not null, engine_version text not null, ordre integer not null, contenu jsonb not null, created_at timestamptz default now() not null);
create table public.etude_tentatives (id uuid default gen_random_uuid() not null, user_id uuid not null, document_id uuid not null, sequence_ordre integer not null, activite_id text not null, numero integer not null, reponse text not null, verdict text not null, retour jsonb, request_id uuid not null, created_at timestamptz default now() not null);
create table public.evaluation_cache (id uuid default gen_random_uuid() not null, source_hash text not null, type text not null, count integer not null, questions jsonb not null, created_at timestamptz default now());
create table public.evaluations (id uuid default gen_random_uuid() not null, type character varying(50) not null, questions jsonb not null, score integer, user_id uuid not null, cours_id uuid, document_id uuid, created_at timestamptz default timezone('utc'::text, now()) not null, titre character varying(255), meta_type text);
create table public.examen_question_pools (id uuid default gen_random_uuid() not null, source_hash text not null, questions jsonb not null, question_count integer not null, engine_version integer default 1 not null, created_at timestamptz default now());
create table public.examen_sessions (id uuid default gen_random_uuid() not null, user_id uuid not null, document_id uuid, source_hash text not null, mode text default 'standard'::text not null, composition jsonb not null, seed bigint, answers jsonb default '{}'::jsonb not null, status text default 'in_progress'::text not null, started_at timestamptz default now() not null, deadline timestamptz not null, submitted_at timestamptz, score numeric(4,2), points_obtenus numeric(6,2), points_max numeric(6,2), theme_results jsonb, updated_at timestamptz default now() not null);
create table public.flashcards (id uuid default extensions.uuid_generate_v4() not null, chapitre_id uuid, cours_id uuid, document_id uuid, user_id uuid, question text not null, reponse text not null, statut ia_status default 'draft'::ia_status, box integer default 1, next_review timestamptz default now(), created_at timestamptz default now(), source_hash text);
create table public.flashcards_locks (hash text not null, created_at timestamptz default now(), expires_at timestamptz default (now() + '00:02:00'::interval));
create table public.free_daily_usage (user_id uuid not null, jour date not null, feature text not null, count integer default 0 not null);
create table public.historique_revisions (id uuid default extensions.uuid_generate_v4() not null, user_id uuid not null, flashcard_id uuid not null, evaluation character varying(20) not null, box_precedente integer, nouvelle_box integer, created_at timestamptz default now());
create table public.objectifs (id uuid default extensions.uuid_generate_v4() not null, user_id uuid, type text not null, cible integer not null, valeur_actuelle integer default 0, date_debut timestamptz, date_fin timestamptz, est_atteint boolean default false, created_at timestamptz default now(), titre text, progression integer default 0);
create table public.profiles (user_id uuid not null, niveau text, source_decouverte text, onboarding_termine_at timestamptz, created_at timestamptz default now() not null, updated_at timestamptz default now() not null);
create table public.quiz (id uuid default extensions.uuid_generate_v4() not null, titre text not null, score integer, total integer, matiere_id uuid, user_id uuid, created_at timestamptz default now(), cours_id uuid, document_id uuid, type_evaluation text default 'quiz'::text);
create table public.quiz_questions (id uuid default extensions.uuid_generate_v4() not null, chapitre_id uuid, question text not null, options jsonb not null, reponse_correcte text not null, statut ia_status default 'draft'::ia_status, created_at timestamptz default now());
create table public.redaction_sujets (source_hash text not null, type text not null, sujets jsonb not null, created_at timestamptz default now() not null);
create table public.redactions (id uuid default extensions.uuid_generate_v4() not null, user_id uuid, type text not null, sujet text not null, date_creation timestamptz default now(), titre character varying(255), texte text, rapport_analyse jsonb, cours_id uuid, statut character varying(50) default 'brouillon'::character varying, contenu text, updated_at timestamptz, worker_locked_at timestamptz, last_error text, etude_cours_id uuid, document_id uuid, source text default 'libre'::text not null, enonce text, note numeric(4,2));
create table public.redaction_versions (id uuid default extensions.uuid_generate_v4() not null, redaction_id uuid, contenu text not null, feedback_ia text, score integer, date_soumission timestamptz default now(), numero integer, rapport jsonb, note numeric(4,2));
create table public.saas_metrics (id uuid default extensions.uuid_generate_v4() not null, user_id uuid, feature text not null, document_id uuid, prompt_tokens integer default 0, completion_tokens integer default 0, cost_usd numeric(10,6) default 0, duration_ms integer default 0, created_at timestamptz default now());
create table public.user_roles (user_id uuid not null, email text not null, role text default 'student'::text not null, created_at timestamptz default now(), onboarding_vu boolean default false not null, free_import_used boolean default false not null, free_cas_pratique_count integer default 0 not null);

-- Clés primaires, unicités, contrôles -----------------------------------------------------
alter table public.access_codes add constraint access_codes_pkey PRIMARY KEY (id);
alter table public.admin_settings add constraint admin_settings_pkey PRIMARY KEY (key);
alter table public.ai_content_locks add constraint ai_content_locks_pkey PRIMARY KEY (hash);
alter table public.ai_jobs add constraint ai_jobs_pkey PRIMARY KEY (id);
alter table public.catalog_courses add constraint catalog_courses_pkey PRIMARY KEY (id);
alter table public.chapitres add constraint chapitres_pkey PRIMARY KEY (id);
alter table public.cours add constraint cours_pkey PRIMARY KEY (id);
alter table public.documents add constraint documents_pkey PRIMARY KEY (id);
alter table public.etude_a_revoir add constraint etude_a_revoir_pkey PRIMARY KEY (user_id, document_id, sequence_ordre, activite_id);
alter table public.etude_analyses add constraint etude_analyses_pkey PRIMARY KEY (source_hash, engine_version);
alter table public.etude_cours add constraint etude_cours_pkey PRIMARY KEY (id);
alter table public.etude_generation_cache add constraint etude_generation_cache_pkey PRIMARY KEY (source_hash);
alter table public.etude_generation_locks add constraint etude_generation_locks_pkey PRIMARY KEY (hash);
alter table public.etude_parcours add constraint etude_parcours_pkey PRIMARY KEY (user_id, document_id);
alter table public.etude_progression_cours add constraint etude_progression_cours_pkey PRIMARY KEY (id);
alter table public.etude_progression_sections add constraint etude_progression_sections_pkey PRIMARY KEY (id);
alter table public.etude_progression_themes add constraint etude_progression_themes_pkey PRIMARY KEY (id);
alter table public.etude_sections add constraint etude_sections_pkey PRIMARY KEY (id);
alter table public.etude_sequences add constraint etude_sequences_pkey PRIMARY KEY (source_hash, engine_version, ordre);
alter table public.etude_tentatives add constraint etude_tentatives_pkey PRIMARY KEY (id);
alter table public.etude_themes add constraint etude_themes_pkey PRIMARY KEY (id);
alter table public.evaluation_cache add constraint evaluation_cache_pkey PRIMARY KEY (id);
alter table public.evaluations add constraint evaluations_pkey PRIMARY KEY (id);
alter table public.examen_question_pools add constraint examen_question_pools_pkey PRIMARY KEY (id);
alter table public.examen_sessions add constraint examen_sessions_pkey PRIMARY KEY (id);
alter table public.flashcards add constraint flashcards_pkey PRIMARY KEY (id);
alter table public.flashcards_locks add constraint flashcards_locks_pkey PRIMARY KEY (hash);
alter table public.free_daily_usage add constraint free_daily_usage_pkey PRIMARY KEY (user_id, jour, feature);
alter table public.historique_revisions add constraint historique_revisions_pkey PRIMARY KEY (id);
alter table public.matieres add constraint matieres_pkey PRIMARY KEY (id);
alter table public.niveaux add constraint niveaux_pkey PRIMARY KEY (code);
alter table public.objectifs add constraint objectifs_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (user_id);
alter table public.quiz add constraint quiz_pkey PRIMARY KEY (id);
alter table public.quiz_questions add constraint quiz_questions_pkey PRIMARY KEY (id);
alter table public.redaction_sujets add constraint redaction_sujets_pkey PRIMARY KEY (source_hash, type);
alter table public.redaction_versions add constraint redaction_versions_pkey PRIMARY KEY (id);
alter table public.redactions add constraint redactions_pkey PRIMARY KEY (id);
alter table public.saas_metrics add constraint saas_metrics_pkey PRIMARY KEY (id);
alter table public.user_roles add constraint user_roles_pkey PRIMARY KEY (user_id);
alter table public.access_codes add constraint access_codes_code_key UNIQUE (code);
alter table public.access_codes add constraint access_codes_email_key UNIQUE (email);
alter table public.catalog_courses add constraint catalog_courses_etude_cours_id_key UNIQUE (etude_cours_id);
alter table public.etude_cours add constraint etude_cours_generation_hash_key UNIQUE (generation_hash);
alter table public.etude_cours add constraint etude_cours_pdf_id_key UNIQUE (pdf_id);
alter table public.etude_cours add constraint unique_pdf_id UNIQUE (pdf_id);
alter table public.etude_progression_cours add constraint etude_progression_cours_user_id_cours_id_key UNIQUE (user_id, cours_id);
alter table public.etude_progression_sections add constraint etude_progression_sections_user_id_section_id_key UNIQUE (user_id, section_id);
alter table public.etude_progression_themes add constraint etude_progression_themes_user_id_theme_id_key UNIQUE (user_id, theme_id);
alter table public.etude_sections add constraint etude_sections_cours_ordre_key UNIQUE (cours_id, ordre);
alter table public.etude_tentatives add constraint etude_tentatives_user_id_document_id_sequence_ordre_activit_key UNIQUE (user_id, document_id, sequence_ordre, activite_id, numero);
alter table public.etude_tentatives add constraint etude_tentatives_user_id_request_id_key UNIQUE (user_id, request_id);
alter table public.etude_themes add constraint etude_themes_section_ordre_key UNIQUE (section_id, ordre);
alter table public.evaluation_cache add constraint evaluation_cache_source_hash_type_count_key UNIQUE (source_hash, type, count);
alter table public.examen_question_pools add constraint examen_question_pools_source_hash_key UNIQUE (source_hash);
alter table public.etude_analyses add constraint etude_analyses_statut_check CHECK ((statut = ANY (ARRAY['en_cours'::text, 'pret'::text, 'echec'::text])));
alter table public.etude_parcours add constraint etude_parcours_sequence_courante_check CHECK ((sequence_courante >= 0));
alter table public.etude_parcours add constraint etude_parcours_sequence_max_check CHECK ((sequence_max >= 1));
alter table public.etude_parcours add constraint etude_parcours_statut_check CHECK ((statut = ANY (ARRAY['en_cours'::text, 'termine'::text])));
alter table public.etude_sequences add constraint etude_sequences_ordre_check CHECK (((ordre >= 1) AND (ordre <= 60)));
alter table public.etude_tentatives add constraint etude_tentatives_numero_check CHECK (((numero >= 1) AND (numero <= 20)));
alter table public.etude_tentatives add constraint etude_tentatives_reponse_check CHECK ((char_length(reponse) <= 4000));
alter table public.etude_tentatives add constraint etude_tentatives_verdict_check CHECK ((verdict = ANY (ARRAY['juste'::text, 'partiel'::text, 'faux'::text])));
alter table public.evaluations add constraint evaluations_type_check CHECK (((type)::text = ANY ((ARRAY['quiz'::character varying, 'qcm'::character varying, 'vrai_faux'::character varying, 'juridique'::character varying])::text[])));
alter table public.historique_revisions add constraint historique_revisions_evaluation_check CHECK (((evaluation)::text = ANY ((ARRAY['hard'::character varying, 'toReview'::character varying, 'mastered'::character varying])::text[])));
alter table public.niveaux add constraint niveaux_code_check CHECK ((code ~ '^[a-z0-9_]{1,20}$'::text));
alter table public.profiles add constraint profiles_source_decouverte_check CHECK ((source_decouverte = ANY (ARRAY['ami'::text, 'groupe_etudiant'::text, 'reseaux_sociaux'::text, 'enseignant'::text, 'autre'::text])));
alter table public.redactions add constraint redactions_contenu_len CHECK (((contenu IS NULL) OR (char_length(contenu) <= 20000))) NOT VALID;
alter table public.redactions add constraint redactions_note_check CHECK (((note IS NULL) OR ((note >= (0)::numeric) AND (note <= (20)::numeric))));
alter table public.redactions add constraint redactions_source_check CHECK ((source = ANY (ARRAY['cours'::text, 'libre'::text])));

-- Clés étrangères -----------------------------------------------------------------------
alter table public.access_codes add constraint access_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.catalog_courses add constraint catalog_courses_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id);
alter table public.catalog_courses add constraint catalog_courses_etude_cours_id_fkey FOREIGN KEY (etude_cours_id) REFERENCES etude_cours(id) ON DELETE CASCADE;
alter table public.catalog_courses add constraint catalog_courses_niveau_fkey FOREIGN KEY (niveau) REFERENCES niveaux(code) ON UPDATE CASCADE ON DELETE SET NULL;
alter table public.chapitres add constraint chapitres_cours_id_fkey FOREIGN KEY (cours_id) REFERENCES cours(id) ON DELETE CASCADE;
alter table public.cours add constraint cours_matiere_id_fkey FOREIGN KEY (matiere_id) REFERENCES matieres(id) ON DELETE CASCADE;
alter table public.documents add constraint documents_chapitre_id_fkey FOREIGN KEY (chapitre_id) REFERENCES chapitres(id) ON DELETE SET NULL;
alter table public.documents add constraint documents_cours_id_fkey FOREIGN KEY (cours_id) REFERENCES cours(id) ON DELETE CASCADE;
alter table public.documents add constraint documents_matiere_id_fkey FOREIGN KEY (matiere_id) REFERENCES matieres(id) ON DELETE SET NULL;
alter table public.documents add constraint documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.etude_a_revoir add constraint etude_a_revoir_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
alter table public.etude_a_revoir add constraint etude_a_revoir_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.etude_parcours add constraint etude_parcours_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
alter table public.etude_parcours add constraint etude_parcours_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.etude_progression_cours add constraint etude_progression_cours_cours_id_fkey FOREIGN KEY (cours_id) REFERENCES etude_cours(id) ON DELETE CASCADE;
alter table public.etude_progression_sections add constraint etude_progression_sections_section_id_fkey FOREIGN KEY (section_id) REFERENCES etude_sections(id) ON DELETE CASCADE;
alter table public.etude_progression_themes add constraint etude_progression_themes_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES etude_themes(id) ON DELETE CASCADE;
alter table public.etude_sections add constraint etude_sections_cours_id_fkey FOREIGN KEY (cours_id) REFERENCES etude_cours(id) ON DELETE CASCADE;
alter table public.etude_sequences add constraint etude_sequences_source_hash_engine_version_fkey FOREIGN KEY (source_hash, engine_version) REFERENCES etude_analyses(source_hash, engine_version) ON DELETE CASCADE;
alter table public.etude_tentatives add constraint etude_tentatives_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
alter table public.etude_tentatives add constraint etude_tentatives_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.etude_themes add constraint etude_themes_section_id_fkey FOREIGN KEY (section_id) REFERENCES etude_sections(id) ON DELETE CASCADE;
alter table public.evaluations add constraint evaluations_cours_id_fkey FOREIGN KEY (cours_id) REFERENCES cours(id) ON DELETE CASCADE;
alter table public.evaluations add constraint evaluations_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
alter table public.evaluations add constraint evaluations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.examen_sessions add constraint examen_sessions_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
alter table public.examen_sessions add constraint examen_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.flashcards add constraint flashcards_chapitre_id_fkey FOREIGN KEY (chapitre_id) REFERENCES chapitres(id) ON DELETE CASCADE;
alter table public.flashcards add constraint flashcards_cours_id_fkey FOREIGN KEY (cours_id) REFERENCES cours(id) ON DELETE CASCADE;
alter table public.flashcards add constraint flashcards_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
alter table public.flashcards add constraint flashcards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.free_daily_usage add constraint free_daily_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.historique_revisions add constraint historique_revisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.matieres add constraint matieres_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.objectifs add constraint objectifs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.profiles add constraint profiles_niveau_fkey FOREIGN KEY (niveau) REFERENCES niveaux(code) ON UPDATE CASCADE ON DELETE SET NULL;
alter table public.profiles add constraint profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.quiz add constraint quiz_cours_id_fkey FOREIGN KEY (cours_id) REFERENCES cours(id) ON DELETE CASCADE;
alter table public.quiz add constraint quiz_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
alter table public.quiz add constraint quiz_matiere_id_fkey FOREIGN KEY (matiere_id) REFERENCES matieres(id) ON DELETE CASCADE;
alter table public.quiz add constraint quiz_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.quiz_questions add constraint quiz_questions_chapitre_id_fkey FOREIGN KEY (chapitre_id) REFERENCES chapitres(id) ON DELETE CASCADE;
alter table public.redaction_versions add constraint redaction_versions_redaction_id_fkey FOREIGN KEY (redaction_id) REFERENCES redactions(id) ON DELETE CASCADE;
alter table public.redactions add constraint redactions_cours_id_fkey FOREIGN KEY (cours_id) REFERENCES cours(id) ON DELETE CASCADE;
alter table public.redactions add constraint redactions_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
alter table public.redactions add constraint redactions_etude_cours_id_fkey FOREIGN KEY (etude_cours_id) REFERENCES etude_cours(id) ON DELETE SET NULL;
alter table public.redactions add constraint redactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.saas_metrics add constraint saas_metrics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_roles add constraint user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Index ---------------------------------------------------------------------------------
CREATE INDEX idx_access_codes_email ON public.access_codes USING btree (email);
CREATE INDEX idx_access_codes_email_trgm ON public.access_codes USING gin (email gin_trgm_ops);
CREATE INDEX idx_access_codes_status ON public.access_codes USING btree (status);
CREATE INDEX idx_ai_content_locks_expires ON public.ai_content_locks USING btree (expires_at);
CREATE INDEX idx_ai_jobs_lease ON public.ai_jobs USING btree (status, lease_until);
CREATE INDEX idx_ai_jobs_pickup ON public.ai_jobs USING btree (status, next_attempt_at, created_at);
CREATE INDEX idx_ai_jobs_queue ON public.ai_jobs USING btree (status, created_at);
CREATE INDEX idx_ai_jobs_user ON public.ai_jobs USING btree (user_id, created_at DESC);
CREATE INDEX idx_catalog_courses_etude_cours ON public.catalog_courses USING btree (etude_cours_id) WHERE (actif = true);
CREATE INDEX idx_catalog_courses_niveau ON public.catalog_courses USING btree (niveau) WHERE actif;
CREATE INDEX idx_chapitres_cours ON public.chapitres USING btree (cours_id);
CREATE INDEX idx_cours_matiere_created ON public.cours USING btree (matiere_id, created_at);
CREATE INDEX idx_documents_cours ON public.documents USING btree (cours_id) WHERE (cours_id IS NOT NULL);
CREATE INDEX idx_documents_matiere_cours ON public.documents USING btree (matiere_id, cours_id) WHERE (matiere_id IS NOT NULL);
CREATE INDEX idx_documents_text_hash ON public.documents USING btree (text_hash);
CREATE INDEX idx_documents_user_id ON public.documents USING btree (user_id);
CREATE INDEX idx_etude_a_revoir_user ON public.etude_a_revoir USING btree (user_id, document_id) WHERE (resolu_at IS NULL);
CREATE INDEX idx_etude_cours_generation_hash ON public.etude_cours USING btree (generation_hash);
CREATE INDEX idx_etude_cours_genhash ON public.etude_cours USING btree (generation_hash, statut_generation);
CREATE INDEX idx_etude_cours_pdf_id ON public.etude_cours USING btree (pdf_id);
CREATE INDEX idx_etude_cours_statut ON public.etude_cours USING btree (statut_generation);
CREATE INDEX idx_etude_generation_locks_expires ON public.etude_generation_locks USING btree (expires_at);
CREATE INDEX idx_etude_parcours_document ON public.etude_parcours USING btree (document_id);
CREATE INDEX idx_etude_parcours_user ON public.etude_parcours USING btree (user_id, updated_at DESC);
CREATE INDEX idx_etude_prog_cours_user ON public.etude_progression_cours USING btree (user_id);
CREATE INDEX idx_etude_prog_sections_user ON public.etude_progression_sections USING btree (user_id, section_id);
CREATE INDEX idx_etude_prog_themes_user ON public.etude_progression_themes USING btree (user_id, theme_id);
CREATE INDEX idx_etude_sections_cours ON public.etude_sections USING btree (cours_id);
CREATE INDEX idx_etude_tentatives_document ON public.etude_tentatives USING btree (document_id);
CREATE INDEX idx_etude_tentatives_lookup ON public.etude_tentatives USING btree (user_id, document_id, sequence_ordre, activite_id);
CREATE INDEX idx_etude_themes_section ON public.etude_themes USING btree (section_id);
CREATE INDEX idx_evaluation_cache_lookup ON public.evaluation_cache USING btree (source_hash, type, count);
CREATE INDEX idx_evaluations_user_id ON public.evaluations USING btree (user_id);
CREATE INDEX idx_examen_sessions_user ON public.examen_sessions USING btree (user_id, started_at DESC);
CREATE INDEX idx_examen_sessions_user_doc ON public.examen_sessions USING btree (user_id, document_id);
CREATE INDEX idx_flashcards_locks_expires ON public.flashcards_locks USING btree (expires_at);
CREATE INDEX idx_flashcards_source_hash ON public.flashcards USING btree (source_hash);
CREATE INDEX idx_flashcards_user_id ON public.flashcards USING btree (user_id);
CREATE INDEX idx_free_daily_usage_user_jour ON public.free_daily_usage USING btree (user_id, jour);
CREATE INDEX idx_matieres_user_created ON public.matieres USING btree (user_id, created_at DESC);
CREATE INDEX idx_profiles_niveau ON public.profiles USING btree (niveau);
CREATE INDEX idx_redaction_versions_redaction ON public.redaction_versions USING btree (redaction_id, date_soumission DESC);
CREATE INDEX idx_redactions_document ON public.redactions USING btree (document_id) WHERE (document_id IS NOT NULL);
CREATE INDEX idx_redactions_etude_cours_id ON public.redactions USING btree (etude_cours_id);
CREATE INDEX idx_redactions_user_date ON public.redactions USING btree (user_id, date_creation DESC);
CREATE INDEX idx_redactions_user_id ON public.redactions USING btree (user_id);
CREATE INDEX idx_saas_metrics_created ON public.saas_metrics USING btree (created_at);
CREATE INDEX idx_saas_metrics_feature ON public.saas_metrics USING btree (feature);
CREATE INDEX idx_saas_metrics_user ON public.saas_metrics USING btree (user_id);
CREATE UNIQUE INDEX uq_redaction_versions_numero ON public.redaction_versions USING btree (redaction_id, numero) WHERE (numero IS NOT NULL);

-- Vue -----------------------------------------------------------------------------------
create view public.theme_mastery with (security_invoker = true) as
 select user_id, theme_id,
   greatest(0, least(100, case when forme_validee then 40 else 0 end + case when fond_valide then 60 else 0 end
     - least(20, 5 * (coalesce(tentatives_forme, 0) + coalesce(tentatives_fond, 0))))) as score,
   updated_at
 from public.etude_progression_themes pt;

-- Fonctions -----------------------------------------------------------------------------
create or replace function public.ai_spend_since(p_since timestamptz) returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce(sum(cost_usd), 0)::numeric from public.saas_metrics where created_at >= p_since;
$$;
create or replace function public.claim_ai_job(now_ts timestamptz, lease_ts timestamptz) returns setof ai_jobs language sql security definer set search_path to 'public' as $$
  update public.ai_jobs set status='processing', lease_until=lease_ts, updated_at=now_ts
   where id = (select id from public.ai_jobs
      where ( status in ('pending','queued') and (next_attempt_at is null or next_attempt_at <= now_ts) )
         or ( status in ('processing','generating','saving') and lease_until < now_ts )
      order by created_at asc for update skip locked limit 1)
  returning *;
$$;
create or replace function public.consume_free_quota(p_user_id uuid, p_feature text, p_limit integer) returns table(allowed boolean, used integer, quota integer) language plpgsql security definer set search_path to 'public' as $$
declare v_jour date := (now() at time zone 'UTC')::date; v_count integer;
begin
  insert into public.free_daily_usage (user_id, jour, feature, count) values (p_user_id, v_jour, p_feature, 1)
  on conflict (user_id, jour, feature) do update set count = free_daily_usage.count + 1 where free_daily_usage.count < p_limit
  returning free_daily_usage.count into v_count;
  if v_count is null then
    select u.count into v_count from public.free_daily_usage u where u.user_id = p_user_id and u.jour = v_jour and u.feature = p_feature;
    return query select false, coalesce(v_count, p_limit), p_limit;
  else
    return query select true, v_count, p_limit;
  end if;
end;
$$;
create or replace function public.examen_save_answer(p_session_id uuid, p_user_id uuid, p_position text, p_answer jsonb) returns boolean language sql security definer set search_path to 'public' as $$
  update public.examen_sessions set answers = coalesce(answers, '{}'::jsonb) || jsonb_build_object(p_position, p_answer), updated_at = now()
   where id = p_session_id and user_id = p_user_id and status = 'in_progress' returning true;
$$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.user_roles (user_id, email, role) values (new.id, lower(new.email), 'student') on conflict (user_id) do nothing;
  return new;
end;
$$;
create or replace function public.invalidate_pdf_cache() returns trigger language plpgsql as $$
begin
  if new.url_fichier is distinct from old.url_fichier then new.extracted_text = null; end if;
  return new;
end;
$$;
create or replace function public.redactions_guard_contenu() returns trigger language plpgsql as $$
begin
  if new.contenu is distinct from old.contenu and coalesce(old.statut, 'brouillon') not in ('brouillon', 'erreur')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Copie non modifiable dans cet état (%)', old.statut using errcode = '42501';
  end if;
  return new;
end $$;
create or replace function public.refund_free_quota(p_user_id uuid, p_feature text) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.free_daily_usage set count = greatest(count - 1, 0)
   where user_id = p_user_id and jour = (now() at time zone 'UTC')::date and feature = p_feature;
end;
$$;

create trigger trigger_invalidate_pdf_cache before update on public.documents for each row execute function invalidate_pdf_cache();
create trigger trg_redactions_guard_contenu before update of contenu on public.redactions for each row execute function redactions_guard_contenu();
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Droits (identiques à la production) ---------------------------------------------------
revoke execute on function public.ai_spend_since(timestamptz), public.claim_ai_job(timestamptz, timestamptz),
  public.consume_free_quota(uuid, text, integer), public.examen_save_answer(uuid, uuid, text, jsonb),
  public.handle_new_user(), public.refund_free_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_spend_since(timestamptz), public.claim_ai_job(timestamptz, timestamptz),
  public.consume_free_quota(uuid, text, integer), public.examen_save_answer(uuid, uuid, text, jsonb),
  public.refund_free_quota(uuid, text) to service_role;
revoke insert, update on public.redactions from anon, authenticated;
grant update (contenu, updated_at) on public.redactions to authenticated;
revoke insert, update, delete on public.etude_a_revoir, public.etude_parcours, public.etude_tentatives, public.redaction_versions from anon, authenticated;

-- RLS -----------------------------------------------------------------------------------
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "Admin a le contrôle total des codes" on public.access_codes as permissive for all to public using ((auth.uid() in (select user_roles.user_id from user_roles where (user_roles.role = 'admin'::text))));
create policy "L'étudiant voit son propre statut" on public.access_codes as permissive for select to public using ((auth.email() = email));
create policy ai_jobs_select_own on public.ai_jobs as permissive for select to public using ((auth.uid() = user_id));
create policy "Ecriture catalogue admin" on public.catalog_courses as permissive for all to authenticated using ((exists (select 1 from user_roles where ((user_roles.user_id = auth.uid()) and (user_roles.role = 'admin'::text))))) with check ((exists (select 1 from user_roles where ((user_roles.user_id = auth.uid()) and (user_roles.role = 'admin'::text)))));
create policy "Lecture catalogue actif" on public.catalog_courses as permissive for select to authenticated using ((actif = true));
create policy "Acces_Chapitres" on public.chapitres as permissive for all to public using ((cours_id in (select c.id from (cours c join matieres m on ((c.matiere_id = m.id))) where (m.user_id = auth.uid())))) with check ((cours_id in (select c.id from (cours c join matieres m on ((c.matiere_id = m.id))) where (m.user_id = auth.uid()))));
create policy "Chapitres : Accès utilisateur" on public.chapitres as permissive for all to public using ((cours_id in (select cours.id from cours where (cours.matiere_id in (select matieres.id from matieres where (matieres.user_id = auth.uid()))))));
create policy "Acces_Cours" on public.cours as permissive for all to public using ((matiere_id in (select matieres.id from matieres where (matieres.user_id = auth.uid())))) with check ((matiere_id in (select matieres.id from matieres where (matieres.user_id = auth.uid()))));
create policy "Cours : Accès utilisateur" on public.cours as permissive for all to public using ((matiere_id in (select matieres.id from matieres where (matieres.user_id = auth.uid()))));
create policy delete_documents on public.documents as permissive for delete to public using ((auth.uid() = user_id));
create policy select_documents on public.documents as permissive for select to public using ((auth.uid() = user_id));
create policy etude_a_revoir_select_own on public.etude_a_revoir as permissive for select to public using ((auth.uid() = user_id));
create policy "Acces_Etude_Cours" on public.etude_cours as permissive for select to public using (((pdf_id in (select documents.id from documents where (documents.user_id = auth.uid()))) or (exists (select 1 from catalog_courses cc where ((cc.etude_cours_id = etude_cours.id) and (cc.actif = true))))));
create policy etude_parcours_select_own on public.etude_parcours as permissive for select to public using ((auth.uid() = user_id));
create policy "Propriétaire uniquement (Insert)" on public.etude_progression_cours as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Propriétaire uniquement (Select)" on public.etude_progression_cours as permissive for select to public using ((auth.uid() = user_id));
create policy "Propriétaire uniquement (Update)" on public.etude_progression_cours as permissive for update to public using ((auth.uid() = user_id));
create policy "Propriétaire uniquement (Insert)" on public.etude_progression_sections as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Propriétaire uniquement (Select)" on public.etude_progression_sections as permissive for select to public using ((auth.uid() = user_id));
create policy "Propriétaire uniquement (Update)" on public.etude_progression_sections as permissive for update to public using ((auth.uid() = user_id));
create policy "Propriétaire uniquement (Insert)" on public.etude_progression_themes as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Propriétaire uniquement (Select)" on public.etude_progression_themes as permissive for select to public using ((auth.uid() = user_id));
create policy "Propriétaire uniquement (Update)" on public.etude_progression_themes as permissive for update to public using ((auth.uid() = user_id));
create policy "Acces_Etude_Sections" on public.etude_sections as permissive for select to public using (((cours_id in (select ec.id from (etude_cours ec join documents d on ((ec.pdf_id = d.id))) where (d.user_id = auth.uid()))) or (exists (select 1 from catalog_courses cc where ((cc.etude_cours_id = etude_sections.cours_id) and (cc.actif = true))))));
create policy etude_tentatives_select_own on public.etude_tentatives as permissive for select to public using ((auth.uid() = user_id));
create policy "Acces_Etude_Themes" on public.etude_themes as permissive for select to public using (((section_id in (select es.id from ((etude_sections es join etude_cours ec on ((es.cours_id = ec.id))) join documents d on ((ec.pdf_id = d.id))) where (d.user_id = auth.uid()))) or (exists (select 1 from (etude_sections es join catalog_courses cc on ((cc.etude_cours_id = es.cours_id))) where ((es.id = etude_themes.section_id) and (cc.actif = true))))));
create policy "Les utilisateurs peuvent insérer leurs propres évaluations" on public.evaluations as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Les utilisateurs peuvent mettre à jour leurs propres évaluati" on public.evaluations as permissive for update to public using ((auth.uid() = user_id));
create policy "Les utilisateurs peuvent supprimer leurs propres évaluations" on public.evaluations as permissive for delete to public using ((auth.uid() = user_id));
create policy "Les utilisateurs peuvent voir leurs propres évaluations" on public.evaluations as permissive for select to public using ((auth.uid() = user_id));
create policy examen_sessions_select_own on public.examen_sessions as permissive for select to public using ((auth.uid() = user_id));
create policy "Users can delete own flashcards" on public.flashcards as permissive for delete to public using ((auth.uid() = user_id));
create policy "Users can insert own flashcards" on public.flashcards as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users can see own flashcards" on public.flashcards as permissive for select to public using ((auth.uid() = user_id));
create policy "Users can update own flashcards" on public.flashcards as permissive for update to public using ((auth.uid() = user_id));
create policy "Lecture de ses propres compteurs" on public.free_daily_usage as permissive for select to authenticated using ((user_id = auth.uid()));
create policy "Les utilisateurs insèrent dans leur propre historique" on public.historique_revisions as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Les utilisateurs voient leur propre historique" on public.historique_revisions as permissive for select to public using ((auth.uid() = user_id));
create policy "Users can insert own history" on public.historique_revisions as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users can see own history" on public.historique_revisions as permissive for select to public using ((auth.uid() = user_id));
create policy "Matières : Accès utilisateur" on public.matieres as permissive for all to public using ((auth.uid() = user_id));
create policy delete_matieres on public.matieres as permissive for delete to public using ((auth.uid() = user_id));
create policy insert_matieres on public.matieres as permissive for insert to public with check ((auth.uid() = user_id));
create policy select_matieres on public.matieres as permissive for select to public using ((auth.uid() = user_id));
create policy update_matieres on public.matieres as permissive for update to public using ((auth.uid() = user_id));
create policy niveaux_lecture on public.niveaux as permissive for select to anon, authenticated using (actif);
create policy "Objectifs : Accès utilisateur" on public.objectifs as permissive for all to public using ((auth.uid() = user_id));
create policy "Users can delete own objectifs" on public.objectifs as permissive for delete to public using ((auth.uid() = user_id));
create policy "Users can insert own objectifs" on public.objectifs as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users can see own objectifs" on public.objectifs as permissive for select to public using ((auth.uid() = user_id));
create policy "Users can update own objectifs" on public.objectifs as permissive for update to public using ((auth.uid() = user_id));
create policy profiles_lecture_soi on public.profiles as permissive for select to authenticated using ((user_id = auth.uid()));
create policy "Quiz : Accès utilisateur" on public.quiz_questions as permissive for all to public using ((chapitre_id in (select chapitres.id from chapitres where (chapitres.cours_id in (select cours.id from cours where (cours.matiere_id in (select matieres.id from matieres where (matieres.user_id = auth.uid()))))))));
create policy "Users can see own versions" on public.redaction_versions as permissive for select to public using ((exists (select 1 from redactions where ((redactions.id = redaction_versions.redaction_id) and (redactions.user_id = auth.uid())))));
create policy "Les utilisateurs peuvent insérer leurs propres rédactions" on public.redactions as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Les utilisateurs peuvent mettre à jour leurs propres rédactio" on public.redactions as permissive for update to public using ((auth.uid() = user_id));
create policy "Les utilisateurs peuvent supprimer leurs propres rédactions" on public.redactions as permissive for delete to public using ((auth.uid() = user_id));
create policy "Les utilisateurs peuvent voir leurs propres rédactions" on public.redactions as permissive for select to public using ((auth.uid() = user_id));
create policy "Rédactions : Accès utilisateur" on public.redactions as permissive for all to public using ((auth.uid() = user_id));
create policy "Les utilisateurs voient leur propre rôle" on public.user_roles as permissive for select to public using ((auth.uid() = user_id));

-- Stockage ------------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
create policy "Les utilisateurs peuvent supprimer leurs documents" on storage.objects as permissive for delete to public using (((bucket_id = 'documents'::text) and (auth.uid() = owner)));
create policy "Les utilisateurs peuvent uploader leurs documents" on storage.objects as permissive for insert to public with check (((bucket_id = 'documents'::text) and (auth.uid() = owner)));
create policy "Les utilisateurs peuvent voir leurs propres documents" on storage.objects as permissive for select to public using (((bucket_id = 'documents'::text) and (auth.uid() = owner)));
create policy "Supprimer documents" on storage.objects as permissive for delete to public using (((bucket_id = 'documents'::text) and (auth.uid() = owner)));
create policy "Upload documents" on storage.objects as permissive for insert to public with check (((bucket_id = 'documents'::text) and (auth.uid() = owner)));
create policy "Voir documents" on storage.objects as permissive for select to public using ((bucket_id = 'documents'::text));  -- faille reproduite (corrigée par la migration 10)

-- Realtime et données de référence ------------------------------------------------------
alter publication supabase_realtime add table public.etude_cours;
insert into public.niveaux (code, libelle, ordre, actif) values ('l1', 'Licence 1', 1, true), ('l2', 'Licence 2', 2, true) on conflict (code) do nothing;
