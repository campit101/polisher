-- T7: rewrite metering.
-- 1. Only successful calls count against a user's allowance (failed, cut-off or refused answers are
--    not charged). 'mock' rows exist only on the test project and count, so limits can be tested.
--    ai_spend_since still counts every call, because the global $1 a day ceiling is about real cost.
-- 2. Free rewrites are claimed atomically, so two rewrites started at once cannot both be the first.

create or replace function public.usage_spent(p_user_id uuid, p_tier text, p_since timestamptz)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0)
  from public.usage_events
  where user_id = p_user_id and tier = p_tier and created_at >= p_since and outcome in ('ok', 'mock');
$$;
revoke execute on function public.usage_spent(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.usage_spent(uuid, text, timestamptz) to service_role;

-- Takes one free rewrite if any are left. Returns the new count, or null when none were left.
create function public.claim_free_rewrite(p_user_id uuid, p_max integer)
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.profiles
  set free_rewrites_used = free_rewrites_used + 1
  where id = p_user_id and free_rewrites_used < p_max
  returning free_rewrites_used;
$$;
revoke execute on function public.claim_free_rewrite(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_free_rewrite(uuid, integer) to service_role;

-- Gives a free rewrite back when the AI failed, so failures are never charged.
create function public.release_free_rewrite(p_user_id uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.profiles
  set free_rewrites_used = free_rewrites_used - 1
  where id = p_user_id and free_rewrites_used > 0;
$$;
revoke execute on function public.release_free_rewrite(uuid) from public, anon, authenticated;
grant execute on function public.release_free_rewrite(uuid) to service_role;
