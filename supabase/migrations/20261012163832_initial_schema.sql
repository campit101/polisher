-- Polisher initial schema.
-- Access model:
--   * Browser (publishable key + user session, role "authenticated"): reads its own profile,
--     subscription and style profile; full control of its own writing samples. Nothing else.
--   * Server code (Next.js routes, Edge Functions) uses the secret key (role "service_role").
--   * "anon" gets no table access at all.
-- New tables are not exposed to the Data API automatically on this project, so every grant is
-- explicit. Revoking first makes the result the same whatever the project defaults are.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles: one row per account, created by a trigger on auth.users.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 320),
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  free_rewrites_used integer not null default 0 check (free_rewrites_used >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- waitlist: written only by the server route.
-- ---------------------------------------------------------------------------
create table public.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email) and char_length(email) between 3 and 320),
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  marketing_consent boolean not null default false,
  consent_at timestamptz,
  ip_hash text check (char_length(ip_hash) <= 128),
  created_at timestamptz not null default now(),
  check (marketing_consent = (consent_at is not null))
);
create index waitlist_created_at_idx on public.waitlist (created_at);

-- ---------------------------------------------------------------------------
-- writing_samples: the user's own writing, 3 to 5 per user.
-- ---------------------------------------------------------------------------
create table public.writing_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 20000),
  -- Set by a trigger from body, so a client cannot fake it.
  word_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index writing_samples_user_id_idx on public.writing_samples (user_id);

-- ---------------------------------------------------------------------------
-- style_profiles: the AI's description of a user's voice, cached per set of samples.
-- ---------------------------------------------------------------------------
create table public.style_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  samples_hash text not null check (char_length(samples_hash) <= 128),
  profile text not null check (char_length(profile) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- subscriptions: the "pre-orders". Written only by the Stripe webhook.
-- user_id is null until someone signs in with the email they paid with.
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and char_length(email) <= 320),
  user_id uuid references auth.users (id) on delete set null,
  stripe_customer_id text not null check (char_length(stripe_customer_id) <= 255),
  stripe_subscription_id text not null unique check (char_length(stripe_subscription_id) <= 255),
  status text not null check (char_length(status) <= 32),
  livemode boolean not null,
  amount_pence integer check (amount_pence >= 0),
  currency text check (char_length(currency) = 3),
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  started_at timestamptz not null,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_id_idx on public.subscriptions (user_id);
create index subscriptions_email_idx on public.subscriptions (email);
create index subscriptions_live_started_idx on public.subscriptions (started_at) where livemode;

-- ---------------------------------------------------------------------------
-- Server-only tables.
-- ---------------------------------------------------------------------------
create table public.stripe_events (
  event_id text primary key check (char_length(event_id) <= 255),
  type text not null check (char_length(type) <= 100),
  livemode boolean not null,
  received_at timestamptz not null default now()
);

-- Never holds any user text: counts and costs only.
create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('style_profile', 'rewrite')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  outcome text not null check (outcome in ('ok', 'error', 'limited', 'mock')),
  created_at timestamptz not null default now()
);
create index usage_events_created_at_idx on public.usage_events (created_at);
create index usage_events_user_created_idx on public.usage_events (user_id, created_at);

create table public.rate_limits (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_start_idx on public.rate_limits (window_start);

-- Only one test run can ever exist. The window is fixed at 240 hours in UTC.
create table public.kill_test_runs (
  id bigint generated always as identity primary key,
  singleton boolean not null default true unique check (singleton),
  started_at timestamptz not null default now(),
  -- Added in UTC, so the clock change on 25 October 2026 cannot shift the end.
  ends_at timestamptz generated always as (((started_at at time zone 'UTC') + interval '240 hours') at time zone 'UTC') stored,
  started_by text not null check (char_length(started_by) <= 320),
  frozen_result jsonb,
  frozen_at timestamptz
);

create table public.blind_pairs (
  id bigint generated always as identity primary key,
  text_a text not null check (char_length(text_a) <= 20000),
  text_b text not null check (char_length(text_b) <= 20000),
  source_a text not null check (source_a in ('polisher', 'baseline')),
  source_b text not null check (source_b in ('polisher', 'baseline') and source_b <> source_a),
  winner text check (winner in ('a', 'b')),
  judged_at timestamptz,
  created_at timestamptz not null default now()
);

-- First-party analytics: no identifiers of any kind.
create table public.events (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 64),
  path text check (char_length(path) <= 200),
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  created_at timestamptz not null default now()
);
create index events_created_at_idx on public.events (created_at);

create table public.app_settings (
  key text primary key check (char_length(key) <= 64),
  value text not null check (char_length(value) <= 500),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values ('ai_mode', 'live');

-- ---------------------------------------------------------------------------
-- Row Level Security on every table. Tables with no policy are closed to
-- anon and authenticated even if a grant is added by mistake.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.waitlist enable row level security;
alter table public.writing_samples enable row level security;
alter table public.style_profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.usage_events enable row level security;
alter table public.rate_limits enable row level security;
alter table public.kill_test_runs enable row level security;
alter table public.blind_pairs enable row level security;
alter table public.events enable row level security;
alter table public.app_settings enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "style_profiles: read own" on public.style_profiles
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "subscriptions: read own" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "writing_samples: read own" on public.writing_samples
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "writing_samples: insert own" on public.writing_samples
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "writing_samples: update own" on public.writing_samples
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "writing_samples: delete own" on public.writing_samples
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants. anon: nothing. authenticated: only what the policies above allow.
-- service_role: everything (server code only).
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.style_profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, delete on public.writing_samples to authenticated;
grant update (body) on public.writing_samples to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Functions.
-- ---------------------------------------------------------------------------

-- Creates the profile row when an account is made. UTM labels come from the sign-up form
-- (user metadata is user-editable, so it is used for analytics only, never for access).
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, utm_source, utm_medium, utm_campaign)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    left(new.raw_user_meta_data ->> 'utm_source', 100),
    left(new.raw_user_meta_data ->> 'utm_medium', 100),
    left(new.raw_user_meta_data ->> 'utm_campaign', 100)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- At most 5 samples per user, checked in the database so no client can get round it.
create function private.enforce_sample_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  if (select count(*) from public.writing_samples where user_id = new.user_id) >= 5 then
    raise exception 'sample limit reached' using errcode = 'P0001', hint = 'A maximum of 5 samples is allowed.';
  end if;
  return new;
end;
$$;
-- Trigger functions are not called directly, so nobody needs EXECUTE on it.
revoke execute on function private.enforce_sample_limit() from public, anon, authenticated;

create trigger writing_samples_limit
  before insert on public.writing_samples
  for each row execute function private.enforce_sample_limit();

create function private.set_word_count()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.word_count := coalesce(array_length(regexp_split_to_array(btrim(new.body), '\s+'), 1), 0);
  return new;
end;
$$;
revoke execute on function private.set_word_count() from public, anon, authenticated;

create trigger writing_samples_word_count
  before insert or update of body on public.writing_samples
  for each row execute function private.set_word_count();

-- Atomic fixed-window rate limit. Returns true while the caller is within the limit.
-- Callable only by server code (service_role) through the Data API.
create function public.hit_rate_limit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  insert into public.rate_limits as r (key, window_start, count)
  values (
    p_key,
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds),
    1
  )
  on conflict (key, window_start) do update set count = r.count + 1
  returning count <= p_max;
$$;
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
