-- =====================================================================================
-- 13 — Paiement Premium en ligne (SasPay) : commandes, historique, attribution du code
--
-- Réutilise le système existant des codes d'accès (access_codes, migration 09) :
--   * PAS de deuxième système de codes : un paiement confirmé attribue un code vierge
--     créé par l'administrateur, ou RÉACTIVE l'ancien code de l'étudiant ;
--   * le statut Premium reste DÉRIVÉ de access_codes (src/lib/plan.ts) ;
--   * les outils administratifs existants ne changent pas.
--
-- Sécurité :
--   * tables en RLS sans policy : seul le serveur (service role) les lit et les écrit ;
--   * une transaction SasPay ne peut servir qu'à UNE commande (index unique) ;
--   * fulfill_premium_order est idempotente : notifications répétées, double retour de
--     l'étudiant ou vérifications simultanées ne donnent jamais deux attributions ;
--   * un compte bloqué par l'administrateur ('blocked' + email) n'est jamais réactivé par un
--     paiement : la commande passe en intervention, la preuve de paiement est conservée.
--
-- Non destructive, ré-exécutable. Aucune donnée existante n'est modifiée.
-- =====================================================================================

create table if not exists public.premium_orders (
  id                    uuid primary key default gen_random_uuid(),
  -- Compte acheteur. SET NULL si le compte est purgé : la preuve de paiement reste.
  user_id               uuid references auth.users (id) on delete set null,
  email                 text not null,
  kind                  text not null check (kind in ('first', 'renewal')),
  amount                numeric(12, 2) not null check (amount > 0),
  currency              text not null default 'XOF',
  provider              text not null default 'saspay',
  status                text not null default 'created'
                        check (status in ('created', 'pending', 'fulfilled', 'failed', 'expired', 'needs_review', 'resolved')),
  checkout_session_id   text unique,
  checkout_url          text,
  transaction_id        text unique,          -- une transaction SasPay = une seule commande
  transaction_reference text,
  paid_amount           numeric(12, 2),
  paid_currency         text,
  code_id               uuid,                 -- code attribué ou réactivé (pas de FK : un code supprimé ne doit pas effacer l'historique)
  code_action           text check (code_action in ('assigned', 'reactivated', 'extended')),
  premium_until         timestamptz,
  review_reason         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  paid_at               timestamptz,
  fulfilled_at          timestamptz
);

create index if not exists idx_premium_orders_user    on public.premium_orders (user_id, created_at desc);
create index if not exists idx_premium_orders_open    on public.premium_orders (created_at desc) where status in ('created', 'pending');
create index if not exists idx_premium_orders_review  on public.premium_orders (created_at desc) where status = 'needs_review';
alter table public.premium_orders enable row level security;  -- aucune policy : service role uniquement

-- Historique append-only : chaque étape et chaque notification reçue, même sans commande reconnue.
create table if not exists public.premium_order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.premium_orders (id) on delete set null,
  event       text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_premium_order_events_order on public.premium_order_events (order_id, created_at);
alter table public.premium_order_events enable row level security;  -- aucune policy : service role uniquement

-- -------------------------------------------------------------------------------------
-- Attribution APRÈS paiement vérifié côté serveur (SasPay verify = SUCCESS).
-- Appelée uniquement par le serveur, jamais par le navigateur.
--
-- Résultat (jsonb) : status = fulfilled | already_fulfilled | needs_review | invalid
-- -------------------------------------------------------------------------------------
create or replace function public.fulfill_premium_order(
  p_order_id              uuid,
  p_transaction_id        text,
  p_transaction_reference text,
  p_paid_amount           numeric,
  p_paid_currency         text,
  p_days                  int default 30
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order  public.premium_orders%rowtype;
  v_code   public.access_codes%rowtype;
  v_email  text;
  v_until  timestamptz;
  v_action text;
  v_reason text;
begin
  if p_days is null or p_days < 1 or p_days > 366 then
    raise exception 'durée d''abonnement invalide : %', p_days;
  end if;
  if coalesce(trim(p_transaction_id), '') = '' then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- La commande, verrouillée : deux confirmations simultanées se suivent.
  select * into v_order from public.premium_orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_order.status in ('fulfilled', 'resolved') then
    return jsonb_build_object('status', 'already_fulfilled', 'premium_until', v_order.premium_until,
                              'code_id', v_order.code_id, 'code_action', v_order.code_action);
  end if;
  if v_order.transaction_id is not null and v_order.transaction_id <> p_transaction_id then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_email := lower(trim(v_order.email));

  -- Preuve de paiement enregistrée AVANT toute décision : elle n'est jamais perdue.
  begin
    update public.premium_orders
       set transaction_id = p_transaction_id,
           transaction_reference = p_transaction_reference,
           paid_amount = p_paid_amount,
           paid_currency = upper(p_paid_currency),
           paid_at = coalesce(paid_at, now()),
           updated_at = now()
     where id = v_order.id;
  exception when unique_violation then
    -- Cette transaction a déjà servi à une autre commande : jamais deux attributions.
    insert into public.premium_order_events (order_id, event, detail)
    values (v_order.id, 'transaction_deja_utilisee', jsonb_build_object('transaction_id', p_transaction_id));
    return jsonb_build_object('status', 'invalid');
  end;

  -- Montant et devise : exactement ceux de la commande.
  if p_paid_amount is distinct from v_order.amount or upper(coalesce(p_paid_currency, '')) <> upper(v_order.currency) then
    v_reason := format('Montant ou devise inattendus : %s %s au lieu de %s %s',
                       p_paid_amount, p_paid_currency, v_order.amount, v_order.currency);
  end if;

  -- Sérialise les attributions d'un même étudiant (deux commandes payées en même temps).
  perform pg_advisory_xact_lock(hashtextextended('premium_order:' || v_email, 0));

  if v_reason is null then
    -- 1) Ancien étudiant : son code (un seul par email, contrainte access_codes_email_key).
    select * into v_code from public.access_codes
     where lower(trim(email)) = v_email
     for update;

    if found then
      if v_code.status::text = 'blocked' then
        v_reason := 'Compte bloqué par l''administrateur : réactivation automatique refusée.';
      elsif v_code.status::text = 'active' and v_code.expires_at is null then
        v_reason := 'Code historique sans date d''expiration : à traiter à la main.';
      elsif v_code.status::text = 'active' and v_code.expires_at > now() then
        -- Renouvellement AVANT expiration : les jours restants sont conservés.
        v_until  := v_code.expires_at + make_interval(days => p_days);
        v_action := 'extended';
      else
        -- Expiré, ou désactivé pour une raison ordinaire ('inactive') : nouvelle période dès maintenant.
        v_until  := now() + make_interval(days => p_days);
        v_action := 'reactivated';
      end if;

      if v_reason is null then
        update public.access_codes set status = 'active', expires_at = v_until where id = v_code.id;
      end if;
    else
      -- 2) Nouvel étudiant (ou ancien code supprimé/purgé) : un code vierge créé par l'administrateur.
      select * into v_code from public.access_codes
       where email is null and status = 'active'
       order by created_at nulls last, id
       limit 1
       for update skip locked;

      if not found then
        v_reason := 'Aucun code d''accès disponible au moment du paiement.';
      else
        v_until  := now() + make_interval(days => p_days);
        v_action := 'assigned';
        update public.access_codes set email = v_email, expires_at = v_until
         where id = v_code.id and email is null;
      end if;
    end if;
  end if;

  if v_reason is not null then
    update public.premium_orders
       set status = 'needs_review', review_reason = v_reason, updated_at = now()
     where id = v_order.id;
    insert into public.premium_order_events (order_id, event, detail)
    values (v_order.id, 'intervention_necessaire', jsonb_build_object('raison', v_reason, 'transaction_id', p_transaction_id));
    return jsonb_build_object('status', 'needs_review', 'reason', v_reason);
  end if;

  update public.premium_orders
     set status = 'fulfilled', code_id = v_code.id, code_action = v_action,
         premium_until = v_until, review_reason = null, fulfilled_at = now(), updated_at = now()
   where id = v_order.id;
  insert into public.premium_order_events (order_id, event, detail)
  values (v_order.id, 'code_' || v_action,
          jsonb_build_object('code_id', v_code.id, 'premium_until', v_until, 'transaction_id', p_transaction_id));

  return jsonb_build_object('status', 'fulfilled', 'code_id', v_code.id, 'code_action', v_action, 'premium_until', v_until);
end;
$$;

revoke all on function public.fulfill_premium_order(uuid, text, text, numeric, text, int) from public, anon, authenticated;
grant execute on function public.fulfill_premium_order(uuid, text, text, numeric, text, int) to service_role;

-- Vérification (lecture seule) : 3 lignes à true.
select 'premium_orders' as objet, exists(select 1 from pg_class where relname = 'premium_orders') as ok
union all select 'premium_order_events', exists(select 1 from pg_class where relname = 'premium_order_events')
union all select 'fulfill_premium_order', exists(select 1 from pg_proc where proname = 'fulfill_premium_order');

-- ROLLBACK (aucune donnée existante n'est touchée par cette migration) :
--   drop function if exists public.fulfill_premium_order(uuid, text, text, numeric, text, int);
--   drop table if exists public.premium_order_events;
--   drop table if exists public.premium_orders;
