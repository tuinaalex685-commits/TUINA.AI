-- =====================================================================================
-- 12 — Version gratuite : 3 PDF au MAXIMUM par compte (règle garantie par la base)
--
-- Depuis le 05/11/2026, un compte gratuit peut importer des PDF (Mes documents), 3 au total.
-- L'application le vérifie déjà (actions/documents.ts) ; ce déclencheur rend la règle
-- impossible à franchir quel que soit le chemin d'insertion, le nombre d'imports simultanés
-- ou le nombre d'onglets : chaque insertion d'un même étudiant prend un verrou transactionnel
-- à son nom, les imports concurrents passent donc UN PAR UN et le 4e voit les 3 premiers.
--
-- Premium = même règle que lib/plan.ts isPremium :
--   * un code d'accès 'active' lié à l'email (sans casse ni espaces), non expiré
--     (expires_at nul = code historique non daté, considéré actif) ;
--   * OU le rôle 'admin' dans user_roles.
-- Aucune donnée n'est modifiée ni supprimée : les documents existants restent en place.
-- =====================================================================================

create or replace function public.limite_pdf_gratuit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text;
  v_premium boolean;
  v_nb      integer;
begin
  if new.user_id is null then
    return new;
  end if;

  -- Sérialise les insertions d'un même étudiant (libéré à la fin de la transaction).
  perform pg_advisory_xact_lock(hashtextextended('limite_pdf_gratuit:' || new.user_id::text, 0));

  select lower(trim(u.email)) into v_email from auth.users u where u.id = new.user_id;

  select exists (
           select 1 from public.access_codes c
            where v_email is not null
              and lower(trim(c.email)) = v_email
              and c.status = 'active'
              and (c.expires_at is null or c.expires_at > now())
         )
      or exists (
           select 1 from public.user_roles r
            where r.role = 'admin'
              and (r.user_id = new.user_id or (v_email is not null and lower(trim(r.email)) = v_email))
         )
    into v_premium;

  if v_premium then
    return new;
  end if;

  select count(*) into v_nb from public.documents d where d.user_id = new.user_id;
  if v_nb >= 3 then
    raise exception 'LIMITE_PDF_GRATUIT: la version gratuite permet 3 PDF au maximum'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.limite_pdf_gratuit() from public;

drop trigger if exists limite_pdf_gratuit on public.documents;
create trigger limite_pdf_gratuit
  before insert on public.documents
  for each row execute function public.limite_pdf_gratuit();

-- Vérification : le déclencheur est installé.
select tgname, tgenabled from pg_trigger where tgname = 'limite_pdf_gratuit';
-- Résultat attendu : 1 ligne, tgenabled = 'O'.

-- ROLLBACK :
--   drop trigger if exists limite_pdf_gratuit on public.documents;
--   drop function if exists public.limite_pdf_gratuit();
