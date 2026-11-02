import { describe, expect, it } from "vitest";
import { addRemoved, buildReport, summariseReport } from "./report.ts";

describe("buildReport", () => {
  it("adds up every change", () => {
    const report = buildReport(2, [{ phrase: "moreover", count: 3 }], [{ from: "color", to: "colour", count: 1 }]);
    expect(report.totalChanges).toBe(6);
  });
});

describe("summariseReport", () => {
  it("says so when nothing changed", () => {
    expect(summariseReport(buildReport(0, [], []))).toEqual(["No changes needed."]);
  });

  it("uses singular and plural correctly", () => {
    expect(summariseReport(buildReport(1, [{ phrase: "moreover", count: 1 }], [{ from: "color", to: "colour", count: 1 }]))).toEqual([
      "1 dash replaced",
      "1 stock phrase removed or reworded",
      "1 word changed to UK spelling",
    ]);
    expect(
      summariseReport(
        buildReport(
          3,
          [
            { phrase: "moreover", count: 1 },
            { phrase: "leverage", count: 1 },
          ],
          [{ from: "color", to: "colour", count: 4 }],
        ),
      ),
    ).toEqual(["3 dashes replaced", "2 stock phrases removed or reworded", "4 words changed to UK spelling"]);
  });

  it("mentions quotations left as written, which are not changes", () => {
    const report = buildReport(1, [], [], 2);
    expect(report.totalChanges).toBe(1);
    expect(summariseReport(report)).toEqual(["1 dash replaced", "2 quotations left exactly as written"]);
    expect(summariseReport(buildReport(0, [], [], 1))).toEqual(["No changes needed.", "1 quotation left exactly as written"]);
  });

  it("counts hidden characters and citation markers as changes, including ones removed from the draft", () => {
    const report = addRemoved(buildReport(0, [], [], 0, { hidden: 1, markers: 0 }), { hidden: 2, markers: 3 });
    expect(report.totalChanges).toBe(6);
    expect(summariseReport(report)).toEqual(["3 hidden characters removed", "3 chat citation markers removed"]);
  });

  it("skips categories with no changes", () => {
    expect(summariseReport(buildReport(2, [], []))).toEqual(["2 dashes replaced"]);
  });
});
