import { describe, expect, it } from "vitest";
import { readUtm, utmQuery } from "./utm";

describe("readUtm", () => {
  it("keeps well-formed values, lower-cased", () => {
    expect(readUtm({ utm_source: "Reddit", utm_medium: "community", utm_campaign: ["launch-1", "x"] })).toEqual({
      utm_source: "reddit",
      utm_medium: "community",
      utm_campaign: "launch-1",
    });
  });

  it("drops anything with odd characters or too long", () => {
    expect(readUtm({ utm_source: "<script>", utm_medium: "a".repeat(101), other: "x" })).toEqual({});
  });

  it("reads URLSearchParams and FormData too", () => {
    expect(readUtm(new URLSearchParams("utm_source=tiktok"))).toEqual({ utm_source: "tiktok" });
    const form = new FormData();
    form.set("utm_medium", "video");
    expect(readUtm(form)).toEqual({ utm_medium: "video" });
  });
});

describe("utmQuery", () => {
  it("builds a query string or nothing", () => {
    expect(utmQuery({ utm_source: "reddit", utm_campaign: "launch" })).toBe("?utm_source=reddit&utm_campaign=launch");
    expect(utmQuery({})).toBe("");
  });
});
