import { describe, expect, it } from "vitest";
import { maskPreview, openLocked, sealLocked } from "./locked.ts";

const text = "Hi Sam, thanks for the quick reply. The quote is £450 and covers both rooms.\n\nCall me on 07700 900123 if anything changes!";

describe("maskPreview", () => {
  it("keeps the first sentence and hides everything else behind same-length placeholders", () => {
    const preview = maskPreview(text);
    const first = "Hi Sam, thanks for the quick reply.";
    expect(preview.startsWith(first)).toBe(true);
    expect([...preview].length).toBe([...text].length);
    const rest = preview.slice(first.length);
    expect(rest).toMatch(/^[\s•]*$/);
    expect(rest.split("\n").length).toBe(text.slice(first.length).split("\n").length);
  });

  it("sends no real text beyond the first sentence, whatever the words are", () => {
    for (const word of ["£450", "rooms", "07700", "changes", "Call"]) expect(maskPreview(text)).not.toContain(word);
  });

  it("stops at a line break when the first line has no full stop", () => {
    expect(maskPreview("Dear Ann,\nThe report is late.")).toBe("Dear Ann,\n••• •••••• •• •••••");
  });

  it("never shows more than 300 characters, even without any full stop", () => {
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const preview = maskPreview(long);
    const shown = preview.replace(/[\s•]+$/, "");
    expect(shown.length).toBeLessThanOrEqual(300);
    expect(long.startsWith(shown)).toBe(true);
    expect(preview.slice(shown.length)).toMatch(/^[\s•]*$/);
  });

  it("never shows more than half the words, so a one-sentence message stays locked (Cam's test, 16 Oct)", () => {
    const one = "Hi Sophie, I won't be able to take your shift on Wednesday, unfortunately my dog died and I'm really sad, I hope you understand.";
    const preview = maskPreview(one);
    const shown = preview.replace(/[\s•]+$/, "");
    expect(one.startsWith(shown)).toBe(true);
    expect(shown.split(/\s+/).length).toBeLessThanOrEqual(Math.floor(one.split(/\s+/).length / 2));
    expect(preview).not.toContain("understand");
    expect([...preview].length).toBe([...one].length);
  });

  it("handles empty text", () => {
    expect(maskPreview("")).toBe("");
  });
});

describe("sealLocked and openLocked", () => {
  const secret = "test-only-secret-not-a-real-key";
  const now = new Date("2026-10-13T12:00:00Z");

  it("gives the text back to the same account within 24 hours", async () => {
    const token = await sealLocked(secret, { userId: "user-1", text, now });
    expect(token).not.toContain("Sam");
    expect(await openLocked(secret, token, "user-1", new Date(now.getTime() + 23 * 3_600_000))).toBe(text);
  });

  it("refuses after 24 hours, for another account, with another key or when tampered with", async () => {
    const token = await sealLocked(secret, { userId: "user-1", text, now });
    expect(await openLocked(secret, token, "user-1", new Date(now.getTime() + 24 * 3_600_000 + 1))).toBeNull();
    expect(await openLocked(secret, token, "user-2", now)).toBeNull();
    expect(await openLocked("another-secret", token, "user-1", now)).toBeNull();
    const flipped = token.slice(0, 20) + (token[20] === "A" ? "B" : "A") + token.slice(21);
    expect(await openLocked(secret, flipped, "user-1", now)).toBeNull();
    expect(await openLocked(secret, "not a token", "user-1", now)).toBeNull();
  });

  it("makes a different token each time, so tokens cannot be compared", async () => {
    const a = await sealLocked(secret, { userId: "user-1", text, now });
    const b = await sealLocked(secret, { userId: "user-1", text, now });
    expect(a).not.toBe(b);
  });
});
