/*
  # Token usage + presence

  Ajoute :
  - token_usage_monthly: suivi tokens par user/mois (cap 10k)
  - user_presence: présence/dernière activité pour stats admin (utilisateurs "connectés")

  + Fonctions RPC utilisées par le backend:
  - get_tokens_used(user_id, month)
  - add_tokens(user_id, month, tokens)
  - admin_total_users()
  - admin_tokens_last_months(months)
*/

create table if not exists public.token_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  tokens_used bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.token_usage_monthly enable row level security;

-- Les utilisateurs peuvent lire leur propre consommation.
drop policy if exists "Users can view own token usage" on public.token_usage_monthly;
create policy "Users can view own token usage"
  on public.token_usage_monthly
  for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);

alter table public.user_presence enable row level security;

drop policy if exists "Users can view own presence" on public.user_presence;
create policy "Users can view own presence"
  on public.user_presence
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can upsert own presence" on public.user_presence;
create policy "Users can upsert own presence"
  on public.user_presence
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own presence" on public.user_presence;
create policy "Users can update own presence"
  on public.user_presence
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RPC: lecture tokens
create or replace function public.get_tokens_used(p_user_id uuid, p_month text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select tokens_used from public.token_usage_monthly where user_id = p_user_id and month = p_month),
    0
  );
$$;

-- RPC: incrément tokens (atomique)
create or replace function public.add_tokens(p_user_id uuid, p_month text, p_tokens bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.token_usage_monthly (user_id, month, tokens_used, updated_at)
  values (p_user_id, p_month, greatest(p_tokens, 0), now())
  on conflict (user_id, month)
  do update set
    tokens_used = public.token_usage_monthly.tokens_used + greatest(excluded.tokens_used, 0),
    updated_at = now();

  return (select tokens_used from public.token_usage_monthly where user_id = p_user_id and month = p_month);
end;
$$;

-- RPC admin: total users (auth.users)
create or replace function public.admin_total_users()
returns bigint
language sql
stable
security definer
as $$
  select count(*) from auth.users;
$$;

-- RPC admin: tokens total par mois (sur les N derniers mois)
create or replace function public.admin_tokens_last_months(p_months int default 6)
returns table(month text, tokens bigint)
language sql
stable
security definer
set search_path = public
as $$
  with seq as (
    select generate_series(0, greatest(p_months - 1, 0)) as i
  ),
  months as (
    select to_char(date_trunc('month', now()) - (i || ' months')::interval, 'YYYY-MM') as month
    from seq
  ),
  sums as (
    select t.month, sum(t.tokens_used)::bigint as tokens
    from public.token_usage_monthly t
    group by t.month
  )
  select m.month, coalesce(s.tokens, 0)::bigint as tokens
  from months m
  left join sums s on s.month = m.month
  order by m.month;
$$;
