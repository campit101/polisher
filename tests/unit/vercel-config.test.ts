// Production changes only through a deliberate CLI deploy with Cam's yes (DECISIONS 21 Oct):
// Vercel's Git integration must never deploy on a push. Also keeps functions next to the London database.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8"));

describe("vercel.json", () => {
  it("turns off automatic deployments from Git for every branch", () => {
    expect(config.git?.deploymentEnabled).toBe(false);
  });

  it("pins functions to London", () => {
    expect(config.regions).toEqual(["lhr1"]);
  });
});
