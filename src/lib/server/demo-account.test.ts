import { describe, expect, it } from "vitest";
import { createDemoAccount, DEMO_EMAIL_DOMAIN, DEMO_LIFETIME_HOURS, isDemoEmail, newDemoCredentials } from "./demo-account";

describe("newDemoCredentials", () => {
  it("makes a random address on example.com, which by internet rule never receives mail", () => {
    const { email } = newDemoCredentials();
    expect(DEMO_EMAIL_DOMAIN).toBe("example.com");
    expect(email).toMatch(/^demo-[0-9a-f-]{36}@example\.com$/);
    expect(isDemoEmail(email)).toBe(true);
  });

  it("makes a long random password nobody sees, different every time", () => {
    const a = newDemoCredentials();
    const b = newDemoCredentials();
    expect(a.password.length).toBeGreaterThanOrEqual(40);
    expect(a.password).not.toBe(b.password);
    expect(a.email).not.toBe(b.email);
  });
});

describe("isDemoEmail", () => {
  it("is true only for demo addresses", () => {
    expect(isDemoEmail("demo-1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed@example.com")).toBe(true);
    expect(isDemoEmail("fake.someone0004@gmail.com")).toBe(false);
    expect(isDemoEmail("demo-1@example.com.evil.test")).toBe(false);
    expect(isDemoEmail("")).toBe(false);
  });
});

describe("createDemoAccount", () => {
  it("creates a confirmed demo user through the admin API, so no confirmation email is ever sent", async () => {
    const calls: unknown[] = [];
    const admin = {
      createUser: async (attrs: unknown) => {
        calls.push(attrs);
        return { error: null };
      },
    };
    const made = await createDemoAccount(admin);
    expect(made).not.toBeNull();
    expect(calls).toEqual([
      {
        email: made!.email,
        password: made!.password,
        email_confirm: true,
        user_metadata: { demo: true },
        app_metadata: { demo: true },
      },
    ]);
  });

  it("returns null when Supabase refuses", async () => {
    const admin = { createUser: async () => ({ error: { message: "nope" } }) };
    expect(await createDemoAccount(admin)).toBeNull();
  });

  it("keeps demo accounts for 24 hours", () => {
    expect(DEMO_LIFETIME_HOURS).toBe(24);
  });
});
