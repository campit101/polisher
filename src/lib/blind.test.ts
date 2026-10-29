import { describe, expect, it } from "vitest";
import { arrange, blindVerdict, chosenSource, isModelCompareSet, isSide, KILL_TEST_SET, MODEL_COMPARE_SET, modelVerdict, setNameFrom, sonnetWins, tally, type JudgedRow } from "./blind";

describe("blindVerdict", () => {
  it.each([
    [14, 20, "pass"],
    [20, 20, "pass"],
    [13, 20, "write_why"],
    [11, 20, "write_why"],
    [10, 20, "stop"],
    [0, 20, "stop"],
    [14, 19, "in_progress"],
    [0, 0, "in_progress"],
  ] as const)("%i wins of %i judged is %s", (wins, judged, expected) => {
    expect(blindVerdict(wins, judged)).toBe(expected);
  });
});

describe("chosenSource and tally", () => {
  const row = (source_a: "polisher" | "baseline", winner: "a" | "b" | null): JudgedRow => ({
    source_a,
    source_b: source_a === "polisher" ? "baseline" : "polisher",
    winner,
  });

  it("follows the side Cam picked, whichever side Polisher was on", () => {
    expect(chosenSource(row("polisher", "a"))).toBe("polisher");
    expect(chosenSource(row("polisher", "b"))).toBe("baseline");
    expect(chosenSource(row("baseline", "b"))).toBe("polisher");
    expect(chosenSource(row("baseline", "a"))).toBe("baseline");
    expect(chosenSource(row("baseline", null))).toBeNull();
  });

  it("counts judged pairs and Polisher wins only", () => {
    expect(tally([row("polisher", "a"), row("baseline", "b"), row("baseline", "a"), row("polisher", null)])).toEqual({
      total: 4,
      judged: 3,
      polisherWins: 2,
    });
  });
});

describe("arrange", () => {
  it("puts Polisher on either side and labels both texts", () => {
    expect(arrange("P", "B", true)).toEqual({ text_a: "P", source_a: "polisher", text_b: "B", source_b: "baseline" });
    expect(arrange("P", "B", false)).toEqual({ text_a: "B", source_a: "baseline", text_b: "P", source_b: "polisher" });
  });
});

describe("setNameFrom and isSide", () => {
  it("accepts only plain set names and falls back to the real set", () => {
    expect(setNameFrom("e2e-1a2b")).toBe("e2e-1a2b");
    expect(setNameFrom(undefined)).toBe(KILL_TEST_SET);
    expect(setNameFrom(["a", "b"])).toBe(KILL_TEST_SET);
    expect(setNameFrom("Kill Test")).toBe(KILL_TEST_SET);
    expect(setNameFrom("x".repeat(65))).toBe(KILL_TEST_SET);
  });

  it("knows the two sides", () => {
    expect(isSide("a")).toBe(true);
    expect(isSide("b")).toBe(true);
    expect(isSide("c")).toBe(false);
    expect(isSide(null)).toBe(false);
  });
});

describe("blind comparison 2: Haiku against Sonnet (launch decision 1)", () => {
  it("knows the model set and the browser tests' copies of it", () => {
    expect(MODEL_COMPARE_SET).toBe("model-compare");
    expect(isModelCompareSet("model-compare")).toBe(true);
    expect(isModelCompareSet("model-compare-e2e-1234")).toBe(true);
    expect(isModelCompareSet(KILL_TEST_SET)).toBe(false);
    expect(isModelCompareSet("e2e-model-compare")).toBe(false);
  });

  // Sonnet sits in the "baseline" slot: Haiku is Polisher today. The switch rule uses the locked 14 of 20.
  it.each([
    [14, 20, "switch"],
    [20, 20, "switch"],
    [13, 20, "keep"],
    [0, 20, "keep"],
    [14, 19, "in_progress"],
  ] as const)("Sonnet picked %i times in %i judged gives %s", (sonnetWins, judged, verdict) => {
    expect(modelVerdict(sonnetWins, judged)).toBe(verdict);
  });

  it("counts Sonnet's wins from the judged rows", () => {
    const rows: JudgedRow[] = [
      { source_a: "polisher", source_b: "baseline", winner: "b" },
      { source_a: "baseline", source_b: "polisher", winner: "a" },
      { source_a: "polisher", source_b: "baseline", winner: "a" },
      { source_a: "polisher", source_b: "baseline", winner: null },
    ];
    expect(tally(rows)).toEqual({ total: 4, judged: 3, polisherWins: 1 });
    expect(sonnetWins(rows)).toBe(2);
  });
});
