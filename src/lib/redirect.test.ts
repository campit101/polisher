import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";

describe("safeNext", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("/app?draft=1")).toBe("/app?draft=1");
  });

  it("sends people to the Write page when no destination is given (Cam, 16 Oct)", () => {
    expect(safeNext(null)).toBe("/app");
    expect(safeNext("")).toBe("/app");
  });

  it("refuses anything that could leave the site", () => {
    const bad = ["https://evil.example", "//evil.example", String.raw`/\evil.example`, "evil", "", null, undefined, "/ok\nx"];
    for (const value of bad) expect(safeNext(value), JSON.stringify(value)).toBe("/app");
  });
});
