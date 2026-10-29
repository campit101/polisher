-- Demo (29 Oct 2026): Polisher is a portfolio demo. Throwaway demo accounts (made by the website with
-- app_metadata.demo = true, on example.com addresses) are deleted 24 hours after they were made, with
-- everything that cascades from them (profile, writing samples, style profile). Usage rows hold no text
-- and lose their account link (on delete set null); test-mode subscription rows of demo addresses go too.
-- pg_cron runs the clean-up every hour.
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.delete_expired_demo_accounts(max_age interval default interval '24 hours')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from auth.users
  where (raw_app_meta_data ->> 'demo') = 'true' and created_at < now() - max_age;
  get diagnostics removed = row_count;
  delete from public.subscriptions
  where email like 'demo-%@example.com' and created_at < now() - max_age;
  return removed;
end;
$$;

revoke all on function public.delete_expired_demo_accounts(interval) from public, anon, authenticated;
grant execute on function public.delete_expired_demo_accounts(interval) to service_role;

select cron.schedule('delete-expired-demo-accounts', '17 * * * *', $$select public.delete_expired_demo_accounts()$$);
