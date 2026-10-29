import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript script without type declarations
import { COPY_HEADER, USAGE_COPY, USAGE_SOURCE } from "../../scripts/sync-usage.mjs";

describe("usage config copy for the Edge Function", () => {
  it("matches src/config/usage.ts exactly (run npm run sync:usage after editing it)", () => {
    expect(readFileSync(USAGE_COPY, "utf8")).toBe(COPY_HEADER + readFileSync(USAGE_SOURCE, "utf8"));
  });
});
