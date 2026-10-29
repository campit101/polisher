# Polisher: case study

Polisher takes an AI draft and gives it back in your own voice. It first ran as a real £5-a-month product, failed its own validation test, and is now a sandbox portfolio demo. Live demo: https://polisher-demo.vercel.app. Code: https://github.com/campit101/polisher.

## The brief

I wanted to find out whether people would pay £5 a month for a tool that makes AI drafts sound like them. I did not guess. Before launch I fixed the pass and fail numbers for a 10-day test. Pass meant 100 sign-ups and 5 paid. Fail meant under 40 sign-ups or 1 or fewer paid. The numbers were locked in a test so I could not move them afterwards.

I am not a developer. I led the project and made the product, money and taste decisions.

## What it does

You paste 3 to 5 samples of your own writing, then paste an AI draft (or rough notes) and get it back in your own voice. A rule-based clean-up step strips AI habits: long dashes, stock phrases and hidden characters. It also enforces British or American spelling. A meaning check flags any number, link or quotation that changed.

Around that sit accounts, credit-based usage, Stripe Checkout and the Customer Portal, and a signed webhook. It runs on Next.js, Supabase in London, Stripe and Vercel in London.

## What happened

It ran with live Stripe payments from 19 to 29 October 2026. I stopped it a few hours before the 10 days were up. The result: 143 front-page views (my own included), 2 free tries, 0 sign-ups from strangers and 0 payments. That is a fail by my own rules. Nobody was charged. I stopped selling and turned it into this demo, which shows the build without selling anything.

## How the demo works

Every page shows the banner "Demo: test payments only. Nothing is sold." Stripe runs in test mode only. A visitor presses one button and gets a throwaway account on an example.com address, so no email is sent. A database job deletes these accounts after 24 hours, and it runs hourly.

Rewrites are made by Claude Haiku 5.5 (Anthropic). All visitors share a hard budget of about £0.10 a day. After that, the site shows real ready-made examples instead of calling the model.

## Decisions that mattered

**Fix the test before launch.** The pass and fail numbers were written down first and enforced by a test. When the result came in under the fail line, there was nothing to argue with.

**Clean-up by rules, not by asking the model nicely.** The model can still slip in a long dash or a stock phrase, so a deterministic step runs on every rewrite. Links, email addresses, code and quotations are protected so they come back untouched.

**A meaning check.** A rewrite that changes a number, a link or a quotation is flagged to the reader rather than passed off as fine.

**Test-mode payments only, enforced in code.** The code refuses any Stripe key that does not start `sk_test_`, `rk_test_` or `pk_test_`, both when the app runs and when it is built.

**A hard cost ceiling.** AI cost is metered per call in nano-dollars. A global daily ceiling of about £0.10 stops all AI spend for everyone.

**Nothing kept that does not need to be.** Polisher's servers never save drafts or rewrites (they go to Anthropic to be rewritten, and the last 5 are kept in your own browser). Demo accounts disappear after 24 hours.

**Security work before launch.** Per-account rate limits, input size caps, a limit on the signed-out free try, user text always in delimited data blocks, and no tools for the model. A written security review was done on 15 October 2026 and its findings were addressed.

## Results

- Paid test, 19 to 29 October 2026 (stopped a few hours early): 143 front-page views (my own included), 2 free tries, 0 sign-ups from strangers, 0 payments. A fail.
- Tests, measured 29 October 2026, all passing: 1,600 unit, 73 integration (against a separate test database) and 200 Playwright end-to-end tests at phone and desktop sizes.
- A source-only security audit (29 October 2026) found no confirmed vulnerability; the four leads it raised were fixed.
- Lighthouse mobile on the landing page, median of 5 runs, 18 October 2026, before the demo changes: 94 performance, 100 accessibility, 100 best practices, 100 SEO.
- Blind comparison, 15 October 2026: I judged 20 pairs without knowing which was which and picked Polisher's rewrite over a plain rewrite 14 times. One person's judgement, so treat it as an early signal only.
- Customer feedback and revenue: none to report beyond the test result above.

## What I would do next

- Test the idea with a better route to real buyers before building more.
- Re-run the blind comparison with more judges than me.
- Decide whether to add an open-source licence (today the code is public to read, with all rights reserved).

## Upwork version

See `docs/UPWORK.md`.
