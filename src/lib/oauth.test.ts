import { describe, expect, it } from "vitest";
import { utmForNewAccount } from "./oauth";

describe("utmForNewAccount", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const empty = { utm_source: null, utm_medium: null, utm_campaign: null };

  it("saves the labels on an account made in the last ten minutes that has none", () => {
    expect(utmForNewAccount(empty, { utm_medium: "cpc" }, "2026-10-17T11:55:00Z", now)).toEqual({ utm_medium: "cpc" });
  });

  it("never overwrites labels the account already has", () => {
    expect(utmForNewAccount({ ...empty, utm_source: "reddit" }, { utm_medium: "cpc" }, "2026-10-17T11:59:00Z", now)).toBeNull();
  });

  it("leaves older accounts alone, so a later link cannot relabel them", () => {
    expect(utmForNewAccount(empty, { utm_medium: "cpc" }, "2026-10-17T11:49:00Z", now)).toBeNull();
  });

  it("does nothing when the link carried no labels", () => {
    expect(utmForNewAccount(empty, {}, "2026-10-17T11:59:00Z", now)).toBeNull();
  });
});
