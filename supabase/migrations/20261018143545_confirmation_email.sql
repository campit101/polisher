-- T12: the subscription confirmation email (CCRs reg 16) is sent once per subscription. The webhook and
-- the return trip from Stripe can both save the same payment, so the first to set this sends it; a
-- failed send clears it again so a later event can retry. Written only by the server.
alter table public.subscriptions add column confirmation_sent_at timestamptz;
