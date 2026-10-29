import { describe, expect, it } from "vitest";
import { stripHidden } from "./hidden.ts";

describe("stripHidden", () => {
  it("removes zero-width, direction and other invisible characters, and counts them", () => {
    const input = "Hel​lo‌ wor⁠ld﻿, caf­é‮!";
    expect(stripHidden(input)).toEqual({ text: "Hello world, café!", hidden: 6, markers: 0 });
  });

  it("removes Unicode tag characters and supplementary variation selectors used as invisible payloads", () => {
    const payload = String.fromCodePoint(0xe0041, 0xe0042, 0xe0100, 0xe01ef);
    expect(stripHidden(`Plain${payload} text`)).toEqual({ text: "Plain text", hidden: 4, markers: 0 });
  });

  it("folds unusual spaces into ordinary spaces", () => {
    expect(stripHidden("£5 each, thin and　wide")).toEqual({ text: "£5 each, thin and wide", hidden: 4, markers: 0 });
  });

  it("keeps emoji intact, including joiners and variation selectors inside them", () => {
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    const heart = "❤️";
    expect(stripHidden(`Love ${family} ${heart}`)).toEqual({ text: `Love ${family} ${heart}`, hidden: 0, markers: 0 });
    // A joiner or selector away from any emoji is invisible noise.
    expect(stripHidden("a‍b️c")).toEqual({ text: "abc", hidden: 2, markers: 0 });
  });

  it("removes ChatGPT citation leftovers from copy and paste", () => {
    const input = "Prices rose 4% :contentReference[oaicite:0]{index=0} last year (oaicite:12){index=12}. Source 【4:0†source】 and citeturn0search3 here.";
    expect(stripHidden(input)).toEqual({ text: "Prices rose 4% last year. Source and here.", hidden: 0, markers: 4 });
  });

  it("removes private-use characters, so they can never clash with the clean-up's own markers", () => {
    expect(stripHidden("A 0 b")).toEqual({ text: "A 0 b", hidden: 3, markers: 0 });
  });

  it("keeps newlines and tabs but removes other control characters", () => {
    expect(stripHidden("Line one\r\n\tLine\u0007 two\u0085")).toEqual({ text: "Line one\r\n\tLine two", hidden: 2, markers: 0 });
  });

  it("leaves clean text exactly as it was", () => {
    const clean = "Plain British text, with £5 and “quotes”.\n\nNew paragraph.";
    expect(stripHidden(clean)).toEqual({ text: clean, hidden: 0, markers: 0 });
  });

  it("takes linear time on long runs of spaces, so a huge paste cannot tie up the server (audit, 29 Oct)", () => {
    const start = performance.now();
    const result = stripHidden(" ".repeat(150_000) + "a");
    expect(performance.now() - start).toBeLessThan(500);
    expect(result.markers).toBe(0);
    expect(result.text.endsWith("a")).toBe(true);
  });

  it("still removes a marker together with the spaces before it", () => {
    expect(stripHidden("Rose 4%    :contentReference[oaicite:0]{index=0} last year").text).toBe("Rose 4% last year");
    expect(stripHidden("   【4:0†source】").text).toBe("");
  });
});
