import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isProject, TEST_PROJECT_REF_SHA256 } from "./test-project.ts";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("isProject (test-only functions refuse any other project)", () => {
  it("matches a project address only by its reference's fingerprint", async () => {
    const fingerprint = sha("abcdefghijklmnopqrst");
    expect(await isProject("https://abcdefghijklmnopqrst.supabase.co", fingerprint)).toBe(true);
    expect(await isProject("https://zyxwvutsrqponmlkjihg.supabase.co", fingerprint)).toBe(false);
  });

  it("refuses look-alikes and nonsense", async () => {
    const fingerprint = sha("abcdefghijklmnopqrst");
    expect(await isProject("https://abcdefghijklmnopqrst.evil.example", fingerprint)).toBe(false);
    expect(await isProject("https://evil-abcdefghijklmnopqrst.supabase.co", fingerprint)).toBe(false);
    expect(await isProject("not a url", fingerprint)).toBe(false);
    expect(await isProject("", fingerprint)).toBe(false);
  });

  it("stores a fingerprint, never the project reference itself", () => {
    expect(TEST_PROJECT_REF_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });
});
