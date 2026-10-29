// Edge Function "blind-model": blind comparison 2 (launch decision 1). Forwards one Messages API
// request to Anthropic with the test project's own key, so npm run blind:models can run Polisher's
// pipeline (supabase/functions/_shared/blind/models.ts) on this laptop for Haiku 5.5 and Sonnet 5.5.
// Deployed to polisher-test only, callable only with the project's secret key, only while ai_mode is
// live (the script switches it on and back to mock), only for those two models. Stores nothing.
// POST <Messages API body> -> { status: "ok", message } or { status: "error", reason }.
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const TEST_PROJECT_REF = "knjkgaldmvnelgqpxcsr";
const MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"];
const MAX_OUTPUT_TOKENS = 8192;
const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys: string[] = [
  ...Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
].filter(Boolean);
const db = createClient(projectUrl, secretKeys[0] ?? "", { auth: { persistSession: false, autoRefreshToken: false } });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Constant-time comparison, so the key cannot be guessed from response times. */
function sameKey(given: string): boolean {
  const a = new TextEncoder().encode(given);
  return secretKeys.some((key) => {
    const b = new TextEncoder().encode(key);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
    return diff === 0;
  });
}

Deno.serve(async (request) => {
  if (!projectUrl.includes(TEST_PROJECT_REF)) return json({ status: "error", reason: "not_test_project" }, 403);
  if (request.method !== "POST") return json({ status: "error", reason: "method" }, 405);
  if (!sameKey(request.headers.get("x-polisher-key") ?? "")) return json({ status: "error", reason: "not_allowed" }, 401);

  const raw = await request.text();
  if (raw.length > 100_000) return json({ status: "error", reason: "too_long" }, 413);
  let body: { model?: unknown; max_tokens?: unknown; stream?: unknown; tools?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ status: "error", reason: "bad_request" }, 400);
  }
  if (typeof body !== "object" || body === null || !MODELS.includes(body.model as string) || typeof body.max_tokens !== "number" || body.max_tokens > MAX_OUTPUT_TOKENS || body.stream || body.tools) {
    return json({ status: "error", reason: "bad_request" }, 400);
  }

  // Nothing is spent unless the test project has been switched to the real AI on purpose.
  const mode = await db.from("app_settings").select("value").eq("key", "ai_mode").maybeSingle();
  if (mode.error) return json({ status: "error", reason: "server" }, 500);
  if (mode.data?.value !== "live") return json({ status: "error", reason: "mock_mode" }, 409);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ status: "error", reason: "no_ai_key" }, 500);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: raw,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      // The status only: Anthropic's error text could echo the request.
      console.error("anthropic error", response.status);
      return json({ status: "error", reason: "ai", code: response.status }, 502);
    }
    return json({ status: "ok", message: await response.json() });
  } catch (failure) {
    console.error("forward failed", failure instanceof Error ? failure.message : "unknown");
    return json({ status: "error", reason: "server" }, 500);
  }
});
