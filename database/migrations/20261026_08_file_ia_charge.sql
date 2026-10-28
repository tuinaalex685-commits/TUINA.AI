-- =====================================================================================
-- 08 — File IA tenue sous charge (non destructive, ré-exécutable)
--
-- 1. claim_ai_job_v2 : réclamation avec PLAFOND de jobs en cours (p_max_inflight) et ordre
--    ÉQUITABLE. Sans plafond, 1 000 lancements simultanés partaient en 1 000 appels Gemini
--    parallèles : refus 429 en rafale, tentatives épuisées, échecs. Avec plafond, le surplus
--    attend dans la file. L'ordre coalesce(next_attempt_at, created_at) renvoie chaque étape
--    terminée en bout de file : une longue analyse ne monopolise plus le worker devant une
--    correction de dissertation lancée après elle.
--    L'ancienne claim_ai_job reste en place (le code s'y replie tant que celle-ci manque).
-- 2. Index manquants sur les chemins chauds :
--    - ai_jobs (type, content_hash) : recherche de doublon à chaque lancement d'IA ;
--    - user_roles (email) : vérification du rôle admin à chaque page (ilike exact).
-- =====================================================================================

create or replace function public.claim_ai_job_v2(now_ts timestamptz, lease_ts timestamptz, p_max_inflight int)
returns setof public.ai_jobs
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Sérialise la seule décision « reste-t-il une place ? » (quelques ms) : deux workers ne
  -- peuvent pas compter la même place libre et dépasser le plafond ensemble.
  perform pg_advisory_xact_lock(hashtext('public.claim_ai_job_v2'));

  if coalesce(p_max_inflight, 0) > 0 and (
    select count(*) from public.ai_jobs
     where status in ('processing','generating','saving') and lease_until >= now_ts
  ) >= p_max_inflight then
    return;  -- file pleine : le job attend, il sera repris par le relais d'un worker qui termine
  end if;

  return query
  update public.ai_jobs
     set status = 'processing', lease_until = lease_ts, updated_at = now_ts
   where id = (
     select id from public.ai_jobs
      where ( status in ('pending','queued') and (next_attempt_at is null or next_attempt_at <= now_ts) )
         or ( status in ('processing','generating','saving') and (lease_until < now_ts or lease_until is null) )
      order by coalesce(next_attempt_at, created_at) asc
      for update skip locked
      limit 1 )
  returning *;
end;
$$;

revoke all on function public.claim_ai_job_v2(timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.claim_ai_job_v2(timestamptz, timestamptz, int) to service_role;

create index if not exists idx_ai_jobs_dedup on public.ai_jobs (type, content_hash, created_at desc);
create index if not exists idx_user_roles_email_trgm on public.user_roles using gin (email gin_trgm_ops);

-- Vérification (lecture seule) : doit renvoyer la fonction et les deux index.
select 'claim_ai_job_v2' as objet, exists(select 1 from pg_proc where proname = 'claim_ai_job_v2') as ok
union all select 'idx_ai_jobs_dedup', exists(select 1 from pg_class where relname = 'idx_ai_jobs_dedup')
union all select 'idx_user_roles_email_trgm', exists(select 1 from pg_class where relname = 'idx_user_roles_email_trgm');
