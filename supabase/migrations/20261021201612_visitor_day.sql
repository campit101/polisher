-- Daily visitor code on page-view events, so /admin can count different people (Cam, 21 Oct).
-- A salted hash that changes every UTC day (src/lib/visitor-id.ts); it never holds an address.
alter table public.events add column visitor_day text check (visitor_day ~ '^[0-9a-f]{64}$');
