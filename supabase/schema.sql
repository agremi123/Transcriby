-- ── Transcriby — Supabase schema ──────────────────────────────────────────
-- Run this in Supabase → SQL Editor to set up the database.

-- ── subscriptions ───────────────────────────────────────────────────────────
-- One row per user, updated by our Stripe webhook handler.

create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text not null default 'inactive',  -- 'active' | 'inactive' | 'cancelled'
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint subscriptions_user_id_unique unique (user_id)
);

-- Keep updated_at fresh automatically
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_updated_at();

-- ── sessions ─────────────────────────────────────────────────────────────────
-- One row per finalised sentence processed through the correction loop.

create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  sentence    text not null,
  corrections jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

create index if not exists sessions_user_id_created_at_idx
  on public.sessions (user_id, created_at desc);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- The server uses the service-role key which bypasses RLS, so policies are
-- only needed if you ever query from the client directly.

alter table public.subscriptions enable row level security;
alter table public.sessions       enable row level security;

-- Users can read their own subscription status (useful for future client-side checks)
create policy "users can read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Users can read their own sessions
create policy "users can read own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);
