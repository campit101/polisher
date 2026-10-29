-- Credits are charged by the exact word (Cam, 16 Oct): 1 credit = 100 words, every rewrite counting at
-- least 50 words. So the usage row records the words charged instead of whole credits. Replaces the
-- credits column and credits_used() added earlier the same day (polisher-test only; on production the
-- two migrations run back to back at T12, so nothing there ever held whole credits).
alter table public.usage_events drop column credits;
drop function public.credits_used(uuid, timestamptz);

alter table public.usage_events
  add column charged_words integer not null default 0 check (charged_words >= 0 and charged_words <= 10000);

-- Words one user's paid rewrites were charged since a moment (the start of today, or of the billing month).
create function public.words_charged(p_user_id uuid, p_since timestamptz)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(charged_words), 0)::integer
  from public.usage_events
  where user_id = p_user_id and tier = 'paid' and created_at >= p_since;
$$;
revoke execute on function public.words_charged(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.words_charged(uuid, timestamptz) to service_role;
