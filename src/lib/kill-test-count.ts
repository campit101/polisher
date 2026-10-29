// How the kill test counts sign-ups and paid subscriptions. Every rule here can only lower the
// numbers (DECISIONS.md "Count only confirmed accounts"), never raise them.
import { isDisposableEmail } from "@/config/disposable-domains";
import { site } from "@/config/site";

export type Window = { start: Date; end: Date };
export type AccountRow = { email: string; created_at: string; email_confirmed_at: string | null; utm_medium: string | null; utm_source?: string | null };
export type SubscriptionRow = { email: string; status: string; livemode: boolean; started_at: string; refunded_at: string | null; utm_source?: string | null };

type ExcludedReason = "admin" | "test" | "throwaway" | "friends";

/** One inbox, one key: lower case, no "+tag", and no dots for Gmail (Gmail ignores them). */
export function normaliseEmail(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);
  local = local.split("+")[0] ?? local;
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replaceAll(".", "");
  return `${local}@${domain}`;
}

/** An email list such as ADMIN_EMAILS or FRIENDS_EMAILS (comma separated), normalised. */
export function adminList(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim())
      .filter((email) => email.includes("@"))
      .map(normaliseEmail),
  );
}

// Reserved for testing by RFC 2606 and RFC 6761; the e2e tests use @polisher.test.
const RESERVED_TLDS = [".test", ".example", ".invalid", ".localhost"];
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

/**
 * friends is FRIENDS_EMAILS: people Cam gives a free (£0) subscription for feedback (21 Oct). They
 * are never counted, which can only lower the numbers.
 */
export function excludedReason(email: string, admins: ReadonlySet<string>, friends: ReadonlySet<string> = new Set()): ExcludedReason | null {
  const key = normaliseEmail(email);
  if (admins.has(key) || key === normaliseEmail(site.owner.email)) return "admin";
  if (friends.has(key)) return "friends";
  const domain = key.slice(key.lastIndexOf("@") + 1);
  if (RESERVED_DOMAINS.has(domain) || RESERVED_TLDS.some((tld) => domain.endsWith(tld))) return "test";
  if (isDisposableEmail(key)) return "throwaway";
  return null;
}

// utm_medium values that mean paid advertising. The test counts free-channel sign-ups only.
const PAID_MEDIUMS = /^(cpc|ppc|cpm|cpv|paid|paid[-_ ]?(social|search|media)|display|banner|ads?|sponsored)$/i;

export function isPaidAdTraffic(utmMedium: string | null | undefined): boolean {
  return !!utmMedium && PAID_MEDIUMS.test(utmMedium.trim());
}

const inWindow = (iso: string, w: Window) => {
  const t = new Date(iso).getTime();
  return t >= w.start.getTime() && t < w.end.getTime();
};

export type SignupCount = { counted: number; excluded: { admin: number; test: number; throwaway: number; friends: number; paidAds: number } };

/**
 * Unique confirmed accounts made inside the window. Since R1 (Cam, 15 Oct) the waitlist is gone and
 * only email-confirmed accounts count, which can only lower the number; the thresholds are unchanged.
 */
export function countSignups(accounts: AccountRow[], admins: ReadonlySet<string>, w: Window, friends: ReadonlySet<string> = new Set()): SignupCount {
  const people = new Map<string, { email: string; paidAd: boolean }>();
  const rows = accounts.filter((a) => a.email_confirmed_at !== null);
  for (const row of rows) {
    if (!row.email || !inWindow(row.created_at, w)) continue;
    const key = normaliseEmail(row.email);
    const person = people.get(key) ?? { email: row.email, paidAd: false };
    person.paidAd ||= isPaidAdTraffic(row.utm_medium);
    people.set(key, person);
  }
  const result: SignupCount = { counted: 0, excluded: { admin: 0, test: 0, throwaway: 0, friends: 0, paidAds: 0 } };
  for (const person of people.values()) {
    const reason = excludedReason(person.email, admins, friends);
    if (reason) result.excluded[reason] += 1;
    else if (person.paidAd) result.excluded.paidAds += 1;
    else result.counted += 1;
  }
  return result;
}

// Statuses Stripe only reaches after the first payment went through. incomplete,
// incomplete_expired and trialing never took money, so they are left out.
export const COUNTED_PAID_STATUSES: readonly string[] = ["active", "past_due", "unpaid", "canceled"];

export type PaidCount = { counted: number; excluded: { admin: number; test: number; throwaway: number; friends: number; testMode: number; refunded: number } };

/** Unique emails with a live, unrefunded, paid subscription started inside the window. */
export function countPaid(subscriptions: SubscriptionRow[], admins: ReadonlySet<string>, w: Window, friends: ReadonlySet<string> = new Set()): PaidCount {
  const result: PaidCount = { counted: 0, excluded: { admin: 0, test: 0, throwaway: 0, friends: 0, testMode: 0, refunded: 0 } };
  const people = new Map<string, SubscriptionRow[]>();
  for (const row of subscriptions) {
    if (!inWindow(row.started_at, w) || !COUNTED_PAID_STATUSES.includes(row.status)) continue;
    const key = normaliseEmail(row.email);
    people.set(key, [...(people.get(key) ?? []), row]);
  }
  for (const [key, rows] of people) {
    const reason = excludedReason(key, admins, friends);
    const live = rows.filter((row) => row.livemode);
    if (reason) result.excluded[reason] += 1;
    else if (live.some((row) => !row.refunded_at)) result.counted += 1;
    else if (live.length > 0) result.excluded.refunded += 1;
    else result.excluded.testMode += 1;
  }
  return result;
}

/** visitor_day is the daily visitor code (src/lib/visitor-id.ts); null for visits before 22 Oct 2026. */
export type VisitRow = { utm_source: string | null; created_at: string; visitor_day?: string | null };
export type SourceRow = { source: string | null; visits: number; people: number; signups: number; paid: number };

/**
 * Different people: each daily visitor code once. A person who comes back on another day counts
 * again, because the code changes every day. today is the UTC day of now. uncounted is visits with no code.
 */
export function countPeople(visits: VisitRow[], w: Window, now = new Date()): { total: number; today: number; uncounted: number } {
  const day = now.toISOString().slice(0, 10);
  const all = new Set<string>();
  const today = new Set<string>();
  let uncounted = 0;
  for (const v of visits) {
    if (!inWindow(v.created_at, w)) continue;
    if (!v.visitor_day) uncounted += 1;
    else {
      all.add(v.visitor_day);
      if (v.created_at.slice(0, 10) === day) today.add(v.visitor_day);
    }
  }
  return { total: all.size, today: today.size, uncounted };
}

const sourceKey = (value: string | null | undefined): string | null => value?.trim().toLowerCase() || null;

/**
 * Visits, sign-ups and paid per tracking source (utm_source), for /admin. Sign-ups and paid go through
 * countSignups and countPaid, so the rows add up to the headline counts. A subscription with no source
 * takes the source of the account with the same inbox. Rows with nothing in them are left out, except
 * the channels in `always`, which are listed with zeros until someone arrives from them.
 */
export function countBySource(
  input: { visits: VisitRow[]; accounts: AccountRow[]; subscriptions: SubscriptionRow[] },
  admins: ReadonlySet<string>,
  w: Window,
  friends: ReadonlySet<string> = new Set(),
  always: readonly string[] = [],
): SourceRow[] {
  const rows = new Map<string | null, SourceRow>();
  const row = (source: string | null) => {
    let r = rows.get(source);
    if (!r) rows.set(source, (r = { source, visits: 0, people: 0, signups: 0, paid: 0 }));
    return r;
  };
  const people = new Map<string | null, Set<string>>();
  for (const v of input.visits) {
    if (!inWindow(v.created_at, w)) continue;
    const source = sourceKey(v.utm_source);
    row(source).visits += 1;
    if (v.visitor_day) people.set(source, (people.get(source) ?? new Set()).add(v.visitor_day));
  }
  for (const [source, codes] of people) row(source).people = codes.size;

  const accountSource = new Map<string, string | null>();
  const accountsBySource = new Map<string | null, AccountRow[]>();
  for (const a of input.accounts) {
    const source = sourceKey(a.utm_source);
    if (a.email && !accountSource.has(normaliseEmail(a.email))) accountSource.set(normaliseEmail(a.email), source);
    accountsBySource.set(source, [...(accountsBySource.get(source) ?? []), a]);
  }
  for (const [source, accounts] of accountsBySource) row(source).signups += countSignups(accounts, admins, w, friends).counted;

  const subsBySource = new Map<string | null, SubscriptionRow[]>();
  for (const sub of input.subscriptions) {
    const source = sourceKey(sub.utm_source) ?? (sub.email ? (accountSource.get(normaliseEmail(sub.email)) ?? null) : null);
    subsBySource.set(source, [...(subsBySource.get(source) ?? []), sub]);
  }
  for (const [source, subs] of subsBySource) row(source).paid += countPaid(subs, admins, w, friends).counted;

  const listed = new Set(always.map(sourceKey));
  for (const source of listed) row(source);
  return [...rows.values()]
    .filter((r) => r.visits + r.signups + r.paid > 0 || listed.has(r.source))
    .sort((a, b) => b.signups - a.signups || b.paid - a.paid || b.visits - a.visits || (a.source === null ? 1 : b.source === null ? -1 : a.source.localeCompare(b.source)));
}
