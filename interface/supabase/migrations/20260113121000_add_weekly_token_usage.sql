/*
  # Weekly token usage for Free users

  Free plan resets weekly (25k/week).

  Adds:
  - token_usage_weekly: tokens used per user/week

  RPC used by backend:
  - get_tokens_used_week(user_id, week)
  - add_tokens_week(user_id, week, tokens)
*/

create table if not exists public.token_usage_weekly (
  user_id uuid not null references auth.users(id) on delete cascade,
  week text not null,
  tokens_used bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, week)
);

alter table public.token_usage_weekly enable row level security;

drop policy if exists "Users can view own weekly token usage" on public.token_usage_weekly;
create policy "Users can view own weekly token usage"
  on public.token_usage_weekly
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.get_tokens_used_week(p_user_id uuid, p_week text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select tokens_used from public.token_usage_weekly where user_id = p_user_id and week = p_week),
    0
  );
$$;

create or replace function public.add_tokens_week(p_user_id uuid, p_week text, p_tokens bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.token_usage_weekly (user_id, week, tokens_used, updated_at)
  values (p_user_id, p_week, greatest(p_tokens, 0), now())
  on conflict (user_id, week)
  do update set
    tokens_used = public.token_usage_weekly.tokens_used + greatest(excluded.tokens_used, 0),
    updated_at = now();

  return (select tokens_used from public.token_usage_weekly where user_id = p_user_id and week = p_week);
end;
$$;
