// Edge Function "blind-baseline": the plain AI rewrite for the blind comparison (T9). Deployed to
// polisher-test only and called only by npm run blind:build with the project's secret key.
// POST { samples: string[], draft: string } -> { status: "ok", text, usage } or { status: "error", reason }.
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { type BaselineMessage, baselineRequest, parseBaseline } from "../_shared/blind/baseline.ts";

const TEST_PROJECT_REF = "knjkgaldmvnelgqpxcsr";
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
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  });
}

const validText = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;

Deno.serve(async (request) => {
  if (!projectUrl.includes(TEST_PROJECT_REF)) return json({ status: "error", reason: "not_test_project" }, 403);
  if (request.method !== "POST") return json({ status: "error", reason: "method" }, 405);
  if (!sameKey(request.headers.get("x-polisher-key") ?? "")) return json({ status: "error", reason: "not_allowed" }, 401);

  let input: { samples?: unknown; draft?: unknown };
  try {
    input = JSON.parse(await request.text());
  } catch {
    return json({ status: "error", reason: "bad_request" }, 400);
  }
  const { samples, draft } = input;
  if (!Array.isArray(samples) || samples.length < 1 || samples.length > 5 || !samples.every((s) => validText(s, 20_000)) || !validText(draft, 20_000)) {
    return json({ status: "error", reason: "bad_request" }, 400);
  }

  const mode = await db.from("app_settings").select("value").eq("key", "ai_mode").maybeSingle();
  if (mode.error) return json({ status: "error", reason: "server" }, 500);
  // Mock mode (the test project's normal state) answers without calling the paid AI.
  if (mode.data?.value === "mock") return json({ status: "ok", text: `Plain rewrite: ${draft}`, usage: { input_tokens: 0, output_tokens: 0 } });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ status: "error", reason: "no_ai_key" }, 500);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(baselineRequest(samples, draft)),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      console.error("anthropic error", response.status);
      return json({ status: "error", reason: "ai" }, 502);
    }
    const message = (await response.json()) as BaselineMessage;
    const parsed = parseBaseline(message);
    return parsed.ok ? json({ status: "ok", text: parsed.text, usage: message.usage }) : json({ status: "error", reason: parsed.reason, usage: message.usage });
  } catch (failure) {
    console.error("baseline failed", failure instanceof Error ? failure.message : "unknown");
    return json({ status: "error", reason: "server" }, 500);
  }
});
