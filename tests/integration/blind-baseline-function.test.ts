// The deployed polisher-test "blind-baseline" function (T9). Runs in mock mode, so it costs nothing.
import { describe, expect, it } from "vitest";
import { admin, url } from "./supabase-test-project";

const endpoint = `${url}/functions/v1/blind-baseline`;
const key = process.env.SUPABASE_SECRET_KEY ?? "";
const post = (body: unknown, headers: Record<string, string> = { "x-polisher-key": key }) =>
  fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("blind-baseline function", () => {
  it("refuses anyone without the project's secret key", async () => {
    expect((await post({ samples: ["a"], draft: "b" }, {})).status).toBe(401);
    expect((await post({ samples: ["a"], draft: "b" }, { "x-polisher-key": `${key}x` })).status).toBe(401);
  });

  it("answers only POST", async () => {
    expect((await fetch(endpoint)).status).toBe(405);
  });

  it("refuses a malformed request", async () => {
    expect((await post({ samples: [], draft: "b" })).status).toBe(400);
    expect((await post({ samples: ["a"], draft: "" })).status).toBe(400);
    expect((await post({ samples: ["1", "2", "3", "4", "5", "6"], draft: "b" })).status).toBe(400);
  });

  it("gives the mock answer while the test project is in mock mode", async () => {
    const mode = await admin.from("app_settings").select("value").eq("key", "ai_mode").single();
    expect(mode.data?.value).toBe("mock");
    const response = await post({ samples: ["my sample"], draft: "the draft" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", text: "Plain rewrite: the draft", usage: { input_tokens: 0, output_tokens: 0 } });
  });
});
