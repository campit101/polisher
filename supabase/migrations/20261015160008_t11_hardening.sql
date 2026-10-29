-- T11 (security and compliance reviews, docs/SECURITY-REVIEW.md):
-- 1. Free use gets its own share of the daily AI ceiling, so free accounts can never use it all
--    up and block paying subscribers. Counts every call, like ai_spend_since.
-- 2. Rate-limit rows (keys can hold account ids or hashed addresses) are deleted a day after their
--    window, and waitlist hashed addresses after 30 days, as the privacy notice says. Done inside
--    hit_rate_limit, which runs on every waitlist join, sign-in and rewrite, so no scheduler is needed.

create function public.tier_spend_since(p_tier text, p_since timestamptz)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(cost_usd), 0) from public.usage_events where tier = p_tier and created_at >= p_since;
$$;
revoke execute on function public.tier_spend_since(text, timestamptz) from public, anon, authenticated;
grant execute on function public.tier_spend_since(text, timestamptz) to service_role;

create or replace function public.hit_rate_limit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
  update public.waitlist set ip_hash = null where ip_hash is not null and created_at < now() - interval '30 days';
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
