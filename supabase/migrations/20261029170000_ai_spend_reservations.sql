-- Hard daily AI ceiling (audit, 29 Oct 2026). The rewrite function checked the day's spend before its
-- model calls but recorded the cost after them, so requests arriving together could all pass the check.
-- Now each request first reserves its worst-case cost: under one advisory lock, the day's recorded
-- spend plus every open reservation plus the new amount must stay within the cap. The reservation is
-- released once the real cost has been recorded. A reservation left behind by a crash expires after
-- 10 minutes (model calls time out after 90 seconds), so it can only make the ceiling stricter.
create table public.ai_spend_reservations (
  id bigint generated always as identity primary key,
  amount_usd numeric(14, 9) not null check (amount_usd > 0),
  created_at timestamptz not null default now()
);
alter table public.ai_spend_reservations enable row level security;
revoke all on public.ai_spend_reservations from anon, authenticated;

create function public.reserve_ai_spend(p_since timestamptz, p_cap_usd numeric, p_amount_usd numeric)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('polisher-ai-daily-ceiling'));
  delete from public.ai_spend_reservations where created_at < now() - interval '10 minutes';
  if (select coalesce(sum(cost_usd), 0) from public.usage_events where created_at >= p_since)
     + (select coalesce(sum(amount_usd), 0) from public.ai_spend_reservations)
     + p_amount_usd > p_cap_usd then
    return null;
  end if;
  insert into public.ai_spend_reservations (amount_usd) values (p_amount_usd) returning id into v_id;
  return v_id;
end;
$$;

create function public.release_ai_spend(p_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.ai_spend_reservations where id = p_id;
$$;

revoke execute on function public.reserve_ai_spend(timestamptz, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.release_ai_spend(bigint) from public, anon, authenticated;
grant execute on function public.reserve_ai_spend(timestamptz, numeric, numeric) to service_role;
grant execute on function public.release_ai_spend(bigint) to service_role;
grant select, insert, delete on public.ai_spend_reservations to service_role;
