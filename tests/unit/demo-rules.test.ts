// Demo rules (29 Oct 2026): Polisher is a portfolio demo. It sends no emails to anyone, never runs
// Stripe live and shows the demo banner on every page. These checks read the source, so a change that
// brings back an email sender, a live-mode switch or a sign-in that emails people fails here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { site } from "@/config/site";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = [...sourceFiles("src"), ...sourceFiles("supabase/functions"), ...sourceFiles("scripts")].filter(
  (path) => !path.replaceAll("\\", "/").startsWith("scripts/eval/"),
);
const read = (path: string) => readFileSync(path, "utf8");

describe("demo rules", () => {
  it("finds the source files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each([
    ["an email provider", /brevo|sendgrid|resend\.com|mailgun|nodemailer|smtp\./i],
    ["Supabase email sign-in or reset links", /signInWithOtp|resetPasswordForEmail|inviteUserByEmail|generateLink\(/],
    ["Google sign-in", /signInWithOAuth/],
    ["a live-mode Stripe switch", /ALLOW_LIVE_STRIPE|sk_live_|rk_live_|pk_live_/],
  ])("no source file uses %s", (_name, pattern) => {
    const hits = files.filter((path) => pattern.test(read(path)));
    expect(hits).toEqual([]);
  });

  it("shows the demo banner from the root layout, so every page has it", () => {
    expect(site.demo.banner).toBe("Demo: test payments only. Nothing is sold.");
    expect(read("src/app/layout.tsx")).toContain("{site.demo.banner}");
  });

  it("gives no postal address", () => {
    expect(site.owner.postalAddress).toBeNull();
  });
});
