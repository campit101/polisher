// The deployed polisher-test "blind-model" function (blind comparison 2). It forwards requests to the
// paid AI only while ai_mode is live; these tests run in mock mode, so they cost nothing.
import { describe, expect, it } from "vitest";
import { admin, url } from "./supabase-test-project";

const endpoint = `${url}/functions/v1/blind-model`;
const key = process.env.SUPABASE_SECRET_KEY ?? "";
const post = (body: unknown, headers: Record<string, string> = { "x-polisher-key": key }) =>
  fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const request = (model: string, max_tokens = 1024) => ({ model, max_tokens, messages: [{ role: "user", content: "Say hello." }] });

describe("blind-model function", () => {
  it("refuses anyone without the project's secret key", async () => {
    expect((await post(request("claude-haiku-5-5"), {})).status).toBe(401);
    expect((await post(request("claude-haiku-5-5"), { "x-polisher-key": `${key}x` })).status).toBe(401);
  });

  it("answers only POST", async () => {
    expect((await fetch(endpoint)).status).toBe(405);
  });

  it("forwards only Haiku 5.5 and Sonnet 5.5, with a capped answer length and no tools", async () => {
    expect((await post(request("claude-opus-5-5"))).status).toBe(400);
    expect((await post(request("claude-haiku-5-5", 100_000))).status).toBe(400);
    expect((await post({ ...request("claude-sonnet-5-5"), tools: [{ name: "x" }] })).status).toBe(400);
    expect((await post({ ...request("claude-sonnet-5-5"), stream: true })).status).toBe(400);
  });

  it("spends nothing while the test project is in mock mode", async () => {
    const mode = await admin.from("app_settings").select("value").eq("key", "ai_mode").single();
    expect(mode.data?.value).toBe("mock");
    const response = await post(request("claude-sonnet-5-5"));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: "error", reason: "mock_mode" });
  });
});
