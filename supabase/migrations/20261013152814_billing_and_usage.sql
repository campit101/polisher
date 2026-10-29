-- T6: billing periods from Stripe, and the usage ledger for the cost-based allowance.
-- The ledger is usage_events itself: one row per AI call with its real cost. Totals for a user
-- and period are summed from it, so there is no second copy of the numbers to drift.

-- ---------------------------------------------------------------------------
-- subscriptions: the billing month comes from Stripe (it moves on each renewal).
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column stripe_price_id text check (char_length(stripe_price_id) <= 255),
  add column current_period_start timestamptz,
  add column current_period_end timestamptz,
  add column cancel_at_period_end boolean not null default false,
  add constraint subscriptions_period_order check (current_period_end is null or current_period_start is null or current_period_end > current_period_start);
create index subscriptions_customer_idx on public.subscriptions (stripe_customer_id);

-- ---------------------------------------------------------------------------
-- usage_events: cache tokens are priced differently, and free and paid use are counted apart.
-- Costs are exact to the nano-dollar (src/config/usage.ts counts in nano-dollars).
-- ---------------------------------------------------------------------------
alter table public.usage_events
  alter column cost_usd type numeric(14, 9),
  add column cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  add column cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  add column tier text not null default 'paid' check (tier in ('free', 'paid'));
create index usage_events_user_tier_created_idx on public.usage_events (user_id, tier, created_at);

-- Total cost for one user and tier since a moment (the start of today, or of the billing month).
create function public.usage_spent(p_user_id uuid, p_tier text, p_since timestamptz)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0)
  from public.usage_events
  where user_id = p_user_id and tier = p_tier and created_at >= p_since;
$$;
revoke execute on function public.usage_spent(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.usage_spent(uuid, text, timestamptz) to service_role;

-- Total AI cost for everyone since a moment, for the global daily ceiling.
create function public.ai_spend_since(p_since timestamptz)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0) from public.usage_events where created_at >= p_since;
$$;
revoke execute on function public.ai_spend_since(timestamptz) from public, anon, authenticated;
grant execute on function public.ai_spend_since(timestamptz) to service_role;
