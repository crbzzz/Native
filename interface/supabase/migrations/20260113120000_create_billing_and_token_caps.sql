/*
  # Billing + token caps (stub for Stripe)

  Adds:
  - user_plans: per-user plan (free/pro)
  - token_allowance_period: optional top-ups per period key (week or month)

  RPC used by backend:
  - get_token_cap(user_id, month)
  - add_monthly_allowance(user_id, month, tokens)
  - set_user_plan(user_id, plan)
*/

create table if not exists public.user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  updated_at timestamptz not null default now(),
  constraint user_plans_plan_check check (plan in ('free', 'pro'))
);

alter table public.user_plans enable row level security;

drop policy if exists "Users can view own plan" on public.user_plans;
create policy "Users can view own plan"
  on public.user_plans
  for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.token_allowance_period (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  tokens_added bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

alter table public.token_allowance_period enable row level security;

drop policy if exists "Users can view own allowance" on public.token_allowance_period;
create policy "Users can view own allowance"
  on public.token_allowance_period
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Compute cap based on plan + period top-up.
-- Note: the backend decides which period key to use (weekly for free, monthly for pro).
create or replace function public.get_token_cap(p_user_id uuid, p_period text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select coalesce((select plan from public.user_plans where user_id = p_user_id), 'free') as plan
  ),
  topup as (
    select coalesce((select tokens_added from public.token_allowance_period where user_id = p_user_id and period = p_period), 0) as tokens
  )
  select (case when (select plan from p) = 'pro' then 500000 else 25000 end) + (select tokens from topup);
$$;

-- Admin/service helper: grant allowance for a given period key (e.g. after Stripe top-up).
create or replace function public.add_period_allowance(p_user_id uuid, p_period text, p_tokens bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.token_allowance_period (user_id, period, tokens_added, updated_at)
  values (p_user_id, p_period, greatest(p_tokens, 0), now())
  on conflict (user_id, period)
  do update set
    tokens_added = public.token_allowance_period.tokens_added + greatest(excluded.tokens_added, 0),
    updated_at = now();

  return (select tokens_added from public.token_allowance_period where user_id = p_user_id and period = p_period);
end;
$$;

-- Admin/service helper: set plan (used by Stripe webhook).
create or replace function public.set_user_plan(p_user_id uuid, p_plan text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_plan text;
begin
  next_plan := lower(coalesce(p_plan, 'free'));
  if next_plan not in ('free', 'pro') then
    next_plan := 'free';
  end if;

  insert into public.user_plans (user_id, plan, updated_at)
  values (p_user_id, next_plan, now())
  on conflict (user_id)
  do update set plan = excluded.plan, updated_at = now();

  return next_plan;
end;
$$;

-- Admin helper: resolve user_id from email (auth.users).
create or replace function public.admin_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
