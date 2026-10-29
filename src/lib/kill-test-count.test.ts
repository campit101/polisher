import { describe, expect, it } from "vitest";
import {
  adminList,
  countBySource,
  countPaid,
  countPeople,
  countSignups,
  type AccountRow,
  type SubscriptionRow,
  excludedReason,
  isPaidAdTraffic,
  normaliseEmail,
} from "./kill-test-count";

const admins = adminList("fakeowner0003@gmail.com, Other.Admin@Example.org ");
// FRIENDS_EMAILS (Cam, 21 Oct): free £0 subscribers for feedback, never counted.
const friends = adminList("Fake.Friend0001@gmail.com");
const window = { start: new Date("2026-10-20T09:00:00Z"), end: new Date("2026-10-30T09:00:00Z") };
const inside = "2026-10-21T12:00:00Z";
const before = "2026-10-19T12:00:00Z";
const after = "2026-10-30T09:00:00Z"; // the end is not inside

const acct = (email: string, created_at = inside, confirmed = true, utm_medium: string | null = null): AccountRow => ({
  email,
  created_at,
  email_confirmed_at: confirmed ? created_at : null,
  utm_medium,
});
const sub = (email: string, over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  email,
  status: "active",
  livemode: true,
  started_at: inside,
  refunded_at: null,
  ...over,
});

describe("normaliseEmail", () => {
  it("ignores case, plus tags and Gmail dots", () => {
    expect(normaliseEmail(" Fake.Owner0003+test@GoogleMail.com ")).toBe("fakeowner0003@gmail.com");
    expect(normaliseEmail("fake.ab0006+x@outlook.com")).toBe("fake.ab0006@outlook.com");
  });
});

describe("excludedReason", () => {
  it("excludes the admins in any spelling", () => {
    expect(excludedReason("fakeowner0003@gmail.com", admins)).toBe("admin");
    expect(excludedReason("fake.owner0003+kt@gmail.com", admins)).toBe("admin");
    expect(excludedReason("other.admin@example.org", admins)).toBe("admin");
  });
  it("excludes the project's own address", () => {
    expect(excludedReason("polisher.help@gmail.com", admins)).toBe("admin");
  });
  it("excludes test and reserved addresses", () => {
    expect(excludedReason("wl-1234+e2e@polisher.test", admins)).toBe("test");
    expect(excludedReason("someone@example.com", admins)).toBe("test");
    expect(excludedReason("x@foo.invalid", admins)).toBe("test");
    expect(excludedReason("x@foo.localhost", admins)).toBe("test");
  });
  it("excludes throwaway inboxes", () => {
    expect(excludedReason("x@mailinator.com", admins)).toBe("throwaway");
  });
  it("excludes friends and family in any spelling, after admins", () => {
    expect(excludedReason("fakefriend0001+polisher@gmail.com", admins, friends)).toBe("friends");
    expect(excludedReason("fakeowner0003@gmail.com", admins, adminList("fakeowner0003@gmail.com"))).toBe("admin");
    expect(excludedReason("fakefriend0001@gmail.com", admins)).toBeNull();
  });
  it("keeps ordinary people", () => {
    expect(excludedReason("fake.jo0005@outlook.com", admins)).toBeNull();
    expect(excludedReason("fake.person0002@gmail.com", admins)).toBeNull();
  });
});

describe("isPaidAdTraffic", () => {
  it.each(["cpc", "PPC", "paid", "paid_social", "paid-social", "paidsearch", "display", "ads", "cpm", "sponsored"])("%s is paid", (m) => {
    expect(isPaidAdTraffic(m)).toBe(true);
  });
  it.each([null, "", "social", "organic", "email", "referral", "video"])("%s is free", (m) => {
    expect(isPaidAdTraffic(m)).toBe(false);
  });
});

describe("countSignups", () => {
  it("counts unique confirmed accounts made inside the window (R1, 15 Oct: the waitlist is gone)", () => {
    const result = countSignups([acct("a@x.com"), acct("A@x.com"), acct("c@x.com")], admins, window);
    expect(result.counted).toBe(2);
  });
  it("leaves out unconfirmed accounts", () => {
    expect(countSignups([acct("a@x.com", inside, false)], admins, window).counted).toBe(0);
  });
  it("counts only sign-ups inside the window (start included, end not)", () => {
    const result = countSignups([acct("a@x.com", before), acct("b@x.com", after), acct("c@x.com", window.start.toISOString())], admins, window);
    expect(result.counted).toBe(1);
  });
  it("leaves out admin, test, throwaway and paid-ad sign-ups and says why", () => {
    const result = countSignups(
      [acct("fakeowner0003@gmail.com"), acct("t+e2e@polisher.test"), acct("x@yopmail.com"), acct("ad@x.com", inside, true, "cpc"), acct("ok@x.com")],
      admins,
      window,
    );
    expect(result.counted).toBe(1);
    expect(result.excluded).toEqual({ admin: 1, test: 1, throwaway: 1, friends: 0, paidAds: 1 });
  });
  it("leaves out friends and family and says why", () => {
    const result = countSignups([acct("fake.friend0001@gmail.com"), acct("ok@x.com")], admins, window, friends);
    expect(result.counted).toBe(1);
    expect(result.excluded.friends).toBe(1);
  });
  it("leaves a person out if any of their accounts came from a paid ad", () => {
    const result = countSignups([acct("p@x.com", inside, true, "social"), acct("P@x.com", inside, true, "paid_social")], admins, window);
    expect(result.counted).toBe(0);
    expect(result.excluded.paidAds).toBe(1);
  });
});

describe("countPaid", () => {
  it("counts live, unrefunded, paid subscriptions started inside the window", () => {
    expect(countPaid([sub("a@x.com"), sub("b@x.com", { status: "canceled" }), sub("c@x.com", { status: "past_due" })], admins, window).counted).toBe(3);
  });
  it("never counts test-mode payments", () => {
    const result = countPaid([sub("a@x.com", { livemode: false })], admins, window);
    expect(result.counted).toBe(0);
    expect(result.excluded.testMode).toBe(1);
  });
  it("leaves out refunds", () => {
    const result = countPaid([sub("a@x.com", { refunded_at: inside })], admins, window);
    expect(result.counted).toBe(0);
    expect(result.excluded.refunded).toBe(1);
  });
  it("leaves out subscriptions that were never paid", () => {
    expect(countPaid([sub("a@x.com", { status: "incomplete" }), sub("b@x.com", { status: "incomplete_expired" }), sub("c@x.com", { status: "trialing" })], admins, window).counted).toBe(0);
  });
  it("leaves out payments outside the window and from admin or test addresses", () => {
    const result = countPaid([sub("a@x.com", { started_at: before }), sub("fakeowner0003@gmail.com"), sub("t@polisher.test")], admins, window);
    expect(result.counted).toBe(0);
    expect(result.excluded.admin).toBe(1);
    expect(result.excluded.test).toBe(1);
  });
  it("leaves out friends' free subscriptions", () => {
    const result = countPaid([sub("fakefriend0001@gmail.com"), sub("a@x.com")], admins, window, friends);
    expect(result.counted).toBe(1);
    expect(result.excluded.friends).toBe(1);
  });
  it("counts one person once", () => {
    expect(countPaid([sub("a@x.com"), sub("A@x.com", { status: "canceled" })], admins, window).counted).toBe(1);
  });
  it("counts a person whose first payment was refunded but who paid again", () => {
    expect(countPaid([sub("a@x.com", { refunded_at: inside }), sub("a@x.com")], admins, window).counted).toBe(1);
  });
});

describe("countBySource", () => {
  const visit = (utm_source: string | null, created_at = inside, visitor_day: string | null = null) => ({ utm_source, created_at, visitor_day });
  const src = (email: string, utm_source: string | null, over: Partial<AccountRow> = {}): AccountRow => ({ ...acct(email), utm_source, ...over });

  it("counts visits, sign-ups and paid per tracking source, with the kill-test rules", () => {
    const rows = countBySource(
      {
        visits: [visit("tiktok"), visit("TikTok "), visit("reddit-sideproject"), visit(null), visit("tiktok", before)],
        accounts: [
          src("a@x.com", "tiktok"),
          src("b@x.com", "tiktok"),
          src("c@x.com", "reddit-sideproject"),
          src("fakeowner0003@gmail.com", "tiktok"),
          src("fakefriend0001@gmail.com", "tiktok"),
          src("d@x.com", "tiktok", { email_confirmed_at: null }),
          src("e@x.com", null),
        ],
        subscriptions: [{ ...sub("a@x.com"), utm_source: "tiktok" }, { ...sub("c@x.com"), utm_source: null }],
      },
      admins,
      window,
      friends,
    );
    expect(rows).toEqual([
      { source: "tiktok", visits: 2, people: 0, signups: 2, paid: 1 },
      { source: "reddit-sideproject", visits: 1, people: 0, signups: 1, paid: 1 },
      { source: null, visits: 1, people: 0, signups: 1, paid: 0 },
    ]);
  });

  it("adds up to the same totals as the headline counts", () => {
    const accounts = [src("a@x.com", "tiktok"), src("b@x.com", null), src("ad@x.com", "tiktok", { utm_medium: "cpc" })];
    const subscriptions = [{ ...sub("a@x.com"), utm_source: "tiktok" }, sub("b@x.com")];
    const rows = countBySource({ visits: [], accounts, subscriptions }, admins, window);
    expect(rows.reduce((n, r) => n + r.signups, 0)).toBe(countSignups(accounts, admins, window).counted);
    expect(rows.reduce((n, r) => n + r.paid, 0)).toBe(countPaid(subscriptions, admins, window).counted);
  });

  it("counts different people per source: one per daily visitor code", () => {
    const rows = countBySource(
      { visits: [visit("tiktok", inside, "p1"), visit("tiktok", inside, "p1"), visit("tiktok", inside, "p2"), visit("tiktok", inside, null)], accounts: [], subscriptions: [] },
      admins,
      window,
    );
    expect(rows).toEqual([{ source: "tiktok", visits: 4, people: 2, signups: 0, paid: 0 }]);
  });

  it("always lists the channels Cam has set up, with zeros until someone arrives from them (21 Oct)", () => {
    const rows = countBySource({ visits: [visit("youtube"), visit(null)], accounts: [], subscriptions: [] }, admins, window, new Set(), ["tiktok", "instagram", "youtube"]);
    expect(rows).toEqual([
      { source: "youtube", visits: 1, people: 0, signups: 0, paid: 0 },
      { source: null, visits: 1, people: 0, signups: 0, paid: 0 },
      { source: "instagram", visits: 0, people: 0, signups: 0, paid: 0 },
      { source: "tiktok", visits: 0, people: 0, signups: 0, paid: 0 },
    ]);
  });

  it("is empty when nothing happened", () => {
    expect(countBySource({ visits: [], accounts: [], subscriptions: [] }, admins, window)).toEqual([]);
  });
});

describe("countPeople", () => {
  const v = (visitor_day: string | null, created_at = inside) => ({ utm_source: null, created_at, visitor_day });
  it("counts each daily visitor code once inside the window, and today's separately", () => {
    const now = new Date("2026-10-21T20:00:00Z");
    const yesterday = "2026-10-20T12:00:00Z";
    const result = countPeople([v("a", yesterday), v("a", yesterday), v("b", yesterday), v(null, yesterday), v("c", before), v("d", "2026-10-21T19:00:00Z")], window, now);
    expect(result).toEqual({ total: 3, today: 1, uncounted: 1 });
  });
});
