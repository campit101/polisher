-- T9 blind comparison: pairs belong to a named set, so the real 20 pairs ("kill-test") and
-- the browser tests' own pairs can live in the same test database without touching each other.
-- draft_id records which fixed draft a pair came from (for the "write why" review); never shown
-- while judging.
alter table public.blind_pairs
  add column set_name text not null default 'kill-test' check (set_name ~ '^[a-z0-9-]{1,64}$'),
  add column draft_id text check (char_length(draft_id) <= 64);
create unique index blind_pairs_set_draft_idx on public.blind_pairs (set_name, draft_id);
