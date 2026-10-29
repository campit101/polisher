import { describe, expect, it } from "vitest";
import { dailyVisitorId } from "./visitor-id";

const salt = "test-salt";
const chrome = "Mozilla/5.0 (Windows NT 10.0) Chrome/150";

describe("dailyVisitorId", () => {
  it("is the same for one person all day, and a 64-character code", () => {
    const a = dailyVisitorId("81.2.69.160", chrome, salt, "2026-10-22");
    expect(a).toBe(dailyVisitorId("81.2.69.160", chrome, salt, "2026-10-22"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes every day, so visits on different days cannot be linked", () => {
    expect(dailyVisitorId("81.2.69.160", chrome, salt, "2026-10-22")).not.toBe(dailyVisitorId("81.2.69.160", chrome, salt, "2026-10-23"));
  });

  it("tells different addresses and different browsers apart", () => {
    const base = dailyVisitorId("81.2.69.160", chrome, salt, "2026-10-22");
    expect(dailyVisitorId("81.2.69.161", chrome, salt, "2026-10-22")).not.toBe(base);
    expect(dailyVisitorId("81.2.69.160", "Safari/18", salt, "2026-10-22")).not.toBe(base);
  });

  it("treats one IPv6 /64 network as one address, like the rate limits", () => {
    expect(dailyVisitorId("2001:db8:1:2::1", chrome, salt, "2026-10-22")).toBe(dailyVisitorId("2001:db8:1:2:ffff::9", chrome, salt, "2026-10-22"));
  });

  it("never contains the address itself", () => {
    expect(dailyVisitorId("81.2.69.160", chrome, salt, "2026-10-22")).not.toContain("81.2.69.160");
  });
});
