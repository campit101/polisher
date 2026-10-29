-- Launch decision 2 (Cam, 16 Oct): customers see credits (100 a billing month, 20 a London day, one per
-- started 500 words). Each successful paid rewrite records the credits it used on its own usage row;
-- every other row (voice profiles, failures, free and mock calls) records 0. cost_usd stays the
-- internal ledger of real AI cost.
alter table public.usage_events
  add column credits smallint not null default 0 check (credits >= 0 and credits <= 10);

-- Credits one user's paid rewrites used since a moment (the start of today, or of the billing month).
create function public.credits_used(p_user_id uuid, p_since timestamptz)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(credits), 0)::integer
  from public.usage_events
  where user_id = p_user_id and tier = 'paid' and created_at >= p_since;
$$;
revoke execute on function public.credits_used(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.credits_used(uuid, timestamptz) to service_role;
