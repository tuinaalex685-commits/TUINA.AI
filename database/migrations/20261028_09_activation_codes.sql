-- =====================================================================================
-- 09 — Activation des codes d'accès fiable (non destructive, ré-exécutable)
--
-- Constats en production (28/10/2026, lecture seule) :
--   * 5 codes sur 9 contiennent des minuscules ; la comparaison était EXACTE → sur mobile
--     (majuscule automatique), « code non valide » pour un code juste ;
--   * 3 codes liés à un compte sont inactifs ou expirés ; la contrainte UNIQUE(email) faisait
--     échouer l'activation d'un NOUVEAU code par ces étudiants (« Activation impossible »),
--     qui restaient en Free après avoir payé ;
--   * 10 comptes réels (créés de juin à août) n'ont pas de ligne user_roles.
--
-- 1. activate_access_code(email, code) : TOUT se fait dans une seule transaction, verrous
--    compris. Deux comptes ne peuvent jamais obtenir le même code ; un compte qui a déjà un
--    code expiré/désactivé peut en activer un nouveau (l'ancien est archivé, pas effacé).
-- 2. access_code_history : trace de chaque code remplacé (qui, quand, état).
-- 3. Rattrapage user_roles pour les comptes qui n'en ont pas.
-- =====================================================================================

create table if not exists public.access_code_history (
  id            uuid primary key default gen_random_uuid(),
  code_id       uuid not null,
  code          text not null,
  email         text not null,
  status        text not null,
  expires_at    timestamptz,
  replaced_by   uuid,
  replaced_at   timestamptz not null default now()
);
alter table public.access_code_history enable row level security;  -- aucune policy : service role uniquement
create index if not exists idx_access_code_history_email on public.access_code_history (lower(email));

-- Recherche du code saisi sans tenir compte de la casse ni des espaces.
create index if not exists idx_access_codes_code_norm on public.access_codes (upper(regexp_replace(code, '\s', '', 'g')));

-- p_days : durée de l'abonnement, fournie par l'application (PREMIUM_DURATION_DAYS, src/lib/plan.ts),
-- unique source de la règle commerciale ; bornée ici pour qu'une erreur d'appel ne crée jamais un
-- abonnement absurde.
create or replace function public.activate_access_code(p_email text, p_code text, p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_email text := lower(trim(p_email));
  v_norm  text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_new   public.access_codes%rowtype;
  v_old   public.access_codes%rowtype;
  v_n     int;
  v_exp   timestamptz := now() + make_interval(days => p_days);
begin
  if p_days is null or p_days < 1 or p_days > 366 then
    raise exception 'durée d''abonnement invalide : %', p_days;
  end if;
  if v_email = '' or length(v_norm) < 4 then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Le code saisi, verrouillé jusqu'à la fin de la transaction (deux activations simultanées
  -- du même code se suivent : la seconde le trouve déjà pris).
  select count(*) into v_n from public.access_codes where upper(regexp_replace(code, '\s', '', 'g')) = v_norm;
  if v_n <> 1 then
    return jsonb_build_object('status', 'invalid');  -- inconnu, ou ambigu (deux codes ne différant que par la casse)
  end if;
  select * into v_new from public.access_codes
   where upper(regexp_replace(code, '\s', '', 'g')) = v_norm
   for update;

  if v_new.status::text <> 'active' then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_new.email is not null then
    if lower(trim(v_new.email)) <> v_email then
      return jsonb_build_object('status', 'invalid');          -- code d'un autre étudiant
    end if;
    if v_new.expires_at is null or v_new.expires_at > now() then
      return jsonb_build_object('status', 'already_active', 'expires_at', v_new.expires_at);
    end if;
    return jsonb_build_object('status', 'expired');            -- son propre code, expiré
  end if;

  -- Code vierge. L'étudiant a-t-il déjà un code (contrainte : un code par email) ?
  select * into v_old from public.access_codes
   where lower(trim(email)) = v_email and id <> v_new.id
   for update;
  if found then
    if v_old.status::text = 'active' and (v_old.expires_at is null or v_old.expires_at > now()) then
      -- Déjà Premium : on ne consomme pas le nouveau code (il reste utilisable plus tard).
      return jsonb_build_object('status', 'already_active', 'expires_at', v_old.expires_at);
    end if;
    -- Ancien code expiré ou désactivé : archivé, puis détaché et bloqué (jamais réutilisable).
    insert into public.access_code_history (code_id, code, email, status, expires_at, replaced_by)
    values (v_old.id, v_old.code, v_old.email, v_old.status::text, v_old.expires_at, v_new.id);
    update public.access_codes set email = null, status = 'blocked' where id = v_old.id;
  end if;

  update public.access_codes set email = v_email, expires_at = v_exp
   where id = v_new.id and email is null;
  return jsonb_build_object('status', 'ok', 'expires_at', v_exp);
exception
  when unique_violation then
    -- Deux codes différents activés au même instant par le même compte : un seul passe.
    return jsonb_build_object('status', 'already_active');
end;
$$;

revoke all on function public.activate_access_code(text, text, int) from public, anon, authenticated;
grant execute on function public.activate_access_code(text, text, int) to service_role;

-- Recherche EXACTE d'un code sous sa forme normalisée (casse et espaces ignorés), sans motif :
-- utilisée par l'admin (doublons) et par le contrôle « mot de passe différent du code ».
create or replace function public.find_access_code(p_code text)
returns setof uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select id from public.access_codes
   where upper(regexp_replace(code, '\s', '', 'g')) = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'))
   limit 2;
$$;
revoke all on function public.find_access_code(text) from public, anon, authenticated;
grant execute on function public.find_access_code(text) to service_role;

-- Rattrapage : chaque compte a sa ligne de rôle (email en minuscules, rôle étudiant).
insert into public.user_roles (user_id, email, role)
select u.id, lower(trim(u.email)), 'student'
  from auth.users u
 where u.email is not null
   and not exists (select 1 from public.user_roles r where r.user_id = u.id)
on conflict (user_id) do nothing;

-- Vérification (lecture seule)
select 'activate_access_code' as objet, exists(select 1 from pg_proc where proname = 'activate_access_code') as ok
union all select 'access_code_history', exists(select 1 from pg_class where relname = 'access_code_history')
union all select 'comptes sans user_roles = 0', not exists(
  select 1 from auth.users u where not exists (select 1 from public.user_roles r where r.user_id = u.id));
