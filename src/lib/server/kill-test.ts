// Reads the kill-test numbers for /admin. Server only: uses the secret key.
import { verdict, type Verdict } from "@/config/kill-test";
import { NANO_PER_USD, usage } from "@/config/usage";
import {
  adminList,
  countBySource,
  countPaid,
  countPeople,
  countSignups,
  type AccountRow,
  type PaidCount,
  type SignupCount,
  type SourceRow,
  type SubscriptionRow,
  type VisitRow,
  type Window,
} from "@/lib/kill-test-count";
import { supabaseAdmin } from "./supabase-admin";

/** First-party events in funnel order. They carry no identifiers, so admin visits are included. */
export const FUNNEL_EVENTS = [
  "landing_view",
  "taste_completed",
  "taste_to_signup",
  "free_rewrite_shown",
  "free_rewrite_locked",
  "locked_rewrite_unlocked",
  "paid_rewrite",
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** Channels Cam has set up with tracked bio links: always shown on /admin, even at zero (21 Oct). */
export const ALWAYS_LISTED_SOURCES = ["tiktok", "instagram", "youtube"] as const;

export type Run = { startedAt: string; endsAt: string; frozenAt: string | null };

/** Saved once when the window closes, so later refunds or deletions cannot change the result. */
export type Result = {
  signups: SignupCount;
  paid: PaidCount;
  verdict: Verdict;
  funnel: Record<FunnelEvent, number>;
  sources?: SourceRow[];
  people?: { total: number; today: number; uncounted: number };
};

export type Dashboard = {
  state: "not_started" | "running" | "finished";
  run: Run | null;
  result: Result;
  aiSpendTodayUsd: number;
  aiCapUsd: number;
  aiMode: string;
  /** AI calls that failed today (error rows, no cost). An empty Anthropic balance shows up here first. */
  aiFailuresToday: number;
};

const PAGE = 1000;

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function confirmedAccounts(): Promise<AccountRow[]> {
  const db = supabaseAdmin();
  const users: { id: string; email?: string; created_at: string; email_confirmed_at?: string | null }[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < PAGE) break;
  }
  const profiles = await fetchAll<{ id: string; utm_medium: string | null; utm_source: string | null }>((from, to) =>
    db.from("profiles").select("id, utm_medium, utm_source").range(from, to),
  );
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return users.map((u) => ({
    email: u.email ?? "",
    created_at: u.created_at,
    email_confirmed_at: u.email_confirmed_at ?? null,
    utm_medium: byId.get(u.id)?.utm_medium ?? null,
    utm_source: byId.get(u.id)?.utm_source ?? null,
  }));
}

async function funnel(w: Window): Promise<Record<FunnelEvent, number>> {
  const db = supabaseAdmin();
  const counts = await Promise.all(
    FUNNEL_EVENTS.map(async (name) => {
      const { count, error } = await db
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("name", name)
        .gte("created_at", w.start.toISOString())
        .lt("created_at", w.end.toISOString());
      if (error) throw new Error(error.message);
      return [name, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<FunnelEvent, number>;
}

/** Front-page visits in the window with their tracking source (no identifiers). */
async function visits(w: Window): Promise<VisitRow[]> {
  const db = supabaseAdmin();
  return fetchAll<VisitRow>((from, to) =>
    db
      .from("events")
      .select("utm_source, created_at, visitor_day")
      .eq("name", "landing_view")
      .gte("created_at", w.start.toISOString())
      .lt("created_at", w.end.toISOString())
      .range(from, to),
  );
}

async function computeResult(w: Window): Promise<Result> {
  const db = supabaseAdmin();
  const admins = adminList(process.env.ADMIN_EMAILS);
  const friends = adminList(process.env.FRIENDS_EMAILS);
  const [accounts, subscriptions, events, views] = await Promise.all([
    confirmedAccounts(),
    fetchAll<SubscriptionRow>((from, to) =>
      db.from("subscriptions").select("email, status, livemode, started_at, refunded_at, utm_source").range(from, to),
    ),
    funnel(w),
    visits(w),
  ]);
  const signups = countSignups(accounts, admins, w, friends);
  const paid = countPaid(subscriptions, admins, w, friends);
  const sources = countBySource({ visits: views, accounts, subscriptions }, admins, w, friends, ALWAYS_LISTED_SOURCES);
  const people = countPeople(views, w);
  return { signups, paid, verdict: verdict(signups.counted, paid.counted), funnel: events, sources, people };
}

// The global AI ceiling resets at midnight UTC (see the rewrite handler), so this does too.
const utcDayStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export async function loadDashboard(now = new Date()): Promise<Dashboard> {
  const db = supabaseAdmin();
  const [runRow, spend, mode, failures] = await Promise.all([
    db.from("kill_test_runs").select("id, started_at, ends_at, frozen_result, frozen_at").maybeSingle(),
    db.rpc("ai_spend_since", { p_since: utcDayStart(now).toISOString() }),
    db.from("app_settings").select("value").eq("key", "ai_mode").maybeSingle(),
    db.from("usage_events").select("id", { count: "exact", head: true }).eq("outcome", "error").gte("created_at", utcDayStart(now).toISOString()),
  ]);
  if (failures.error) throw new Error(failures.error.message);
  if (runRow.error) throw new Error(runRow.error.message);
  if (spend.error) throw new Error(spend.error.message);
  const ai = {
    aiSpendTodayUsd: Math.round(Number(spend.data ?? 0) * NANO_PER_USD) / NANO_PER_USD,
    aiCapUsd: usage.globalDailyCapUsd,
    aiMode: mode.data?.value ?? "unknown",
    aiFailuresToday: failures.count ?? 0,
  };

  const row = runRow.data;
  if (!row) {
    // Before the test: everything so far, so Cam can see the counting works.
    return { state: "not_started", run: null, result: await computeResult({ start: new Date(0), end: now }), ...ai };
  }

  const run: Run = { startedAt: row.started_at, endsAt: row.ends_at, frozenAt: row.frozen_at };
  const w = { start: new Date(row.started_at), end: new Date(row.ends_at) };
  if (now < w.end) return { state: "running", run, result: await computeResult(w), ...ai };

  if (row.frozen_result) return { state: "finished", run, result: row.frozen_result as Result, ...ai };
  const result = await computeResult(w);
  // Only the first save wins, even if two admin pages load at the same moment.
  const frozenAt = now.toISOString();
  const { data: saved, error } = await db
    .from("kill_test_runs")
    .update({ frozen_result: result, frozen_at: frozenAt })
    .eq("id", row.id)
    .is("frozen_result", null)
    .select("frozen_result, frozen_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (saved) return { state: "finished", run: { ...run, frozenAt: saved.frozen_at }, result: saved.frozen_result as Result, ...ai };
  return loadDashboard(now);
}

/** Hours left in the window, rounded down; 0 once it has ended. */
export function hoursLeft(endsAt: string, now = new Date()): number {
  return Math.max(0, Math.floor((new Date(endsAt).getTime() - now.getTime()) / 3_600_000));
}

