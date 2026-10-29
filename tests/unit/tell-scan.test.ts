// The scanner port must agree with what ccf/humanize's own tests assert on its fixtures
// (tests/fixtures/ccf-humanize, MIT; the human_formal and human_plain texts are public domain).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanTells } from "../../scripts/eval/tell-scan.ts";

const scan = (name: string) => scanTells(readFileSync(`tests/fixtures/ccf-humanize/${name}`, "utf8"));

describe("tell scanner (port of ccf/humanize surface_scan.py)", () => {
  it("fires the obvious tells on the AI email", () => {
    const r = scan("ai_email.txt");
    expect(r.summaryCloser).toBe(true);
    expect(r.notBut).toBeGreaterThanOrEqual(1);
    expect(r.tricolon).toBeGreaterThanOrEqual(3);
    const terms = new Set(r.wordlist.hits.map((h) => h.term));
    for (const term of ["great question", "leveraging", "seamless", "reach out", "don't hesitate"]) expect(terms).toContain(term);
  });

  it("is quiet on the human email's word list", () => {
    expect(scan("human_email.txt").wordlist.ratePer1k).toBe(0);
  });

  it("leans AI on at least three of four surface metrics for the email pair", () => {
    const a = scan("ai_email.txt");
    const h = scan("human_email.txt");
    const checks = [a.sentenceLength.cv < h.sentenceLength.cv, a.emDashPer1k > h.emDashPer1k, a.tricolon > h.tricolon, a.wordlist.ratePer1k > h.wordlist.ratePer1k];
    expect(checks.filter(Boolean).length).toBeGreaterThanOrEqual(3);
  });

  it("finds participial tails in the AI report but at most one in human prose", () => {
    expect(scan("ai_report.txt").participialTail).toBeGreaterThanOrEqual(5);
    expect(scan("human_formal.txt").participialTail).toBeLessThanOrEqual(1);
    expect(scan("human_plain.txt").participialTail).toBeLessThanOrEqual(1);
  });

  it("matches the pinned sentence-length bands on the plain-language fixture", () => {
    const s = scan("human_plain.txt").sentenceLength;
    expect(s.pctOver30).toBeLessThanOrEqual(2);
    expect(s.cv).toBeGreaterThanOrEqual(0.28);
    expect(s.cv).toBeLessThanOrEqual(0.42);
    expect(s.longestFlatRun).toBeGreaterThanOrEqual(8);
    expect(s.longestFlatRun).toBeLessThanOrEqual(10);
    expect(scan("human_plain.txt").words).toBeGreaterThanOrEqual(600);
  });

  it("counts ordinary negation as nothing and the framing contrast as a tell", () => {
    expect(scanTells("Please do not wait, but call me if it breaks.").notBut).toBe(0);
    expect(scanTells("It's not just a tool, it's a movement.").notBut).toBe(1);
  });
});
