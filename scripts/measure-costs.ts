// Measures what real rewrites cost (T7). Test project only: switches polisher-test to the real AI,
// runs one rewrite each of about 300, 800 and 1,500 words as a subscriber, switches back to mock
// (always, even on failure), prints the token use and cost of every call, and deletes the account.
// Needs ANTHROPIC_API_KEY in the polisher-test function secrets (CAM-TODO task 11). About $0.01.
// Usage: node scripts/measure-costs.ts
import { writeFileSync } from "node:fs";
import { admin, createTestUser, deleteTestUser, url } from "../tests/integration/supabase-test-project.ts";
import { draftOf, samples } from "./eval/inputs.ts";

const user = await createTestUser();
const report: string[] = [];
try {
  for (const body of samples) await user.client.from("writing_samples").insert({ body });
  await admin.from("subscriptions").insert({
    email: user.email,
    user_id: user.id,
    stripe_customer_id: "cus_measure",
    stripe_subscription_id: `sub_measure_${user.id}`,
    status: "active",
    livemode: false,
    started_at: new Date().toISOString(),
    current_period_start: new Date(Date.now() - 86_400_000).toISOString(),
    current_period_end: new Date(Date.now() + 29 * 86_400_000).toISOString(),
  });
  const set = await admin.from("app_settings").update({ value: "live", updated_at: new Date().toISOString() }).eq("key", "ai_mode");
  if (set.error) throw set.error;

  const token = (await user.client.auth.getSession()).data.session?.access_token;
  for (const target of [300, 800, 1500]) {
    const draft = draftOf(target);
    const started = Date.now();
    const response = await fetch(`${url}/functions/v1/rewrite`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "rewrite", draft }),
    });
    const result = await response.json();
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    report.push(`=== ${draft.split(/\s+/).length} words, ${seconds}s, status ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
    if (result.status === "ok") {
      report.push(`summary: ${result.summary.join("; ")}`);
      report.push(`warnings: ${JSON.stringify(result.warnings)}`);
      report.push(`rewrite words: ${result.text.split(/\s+/).length}`);
      report.push("--- draft ---", draft, "--- rewrite ---", result.text);
    }
  }
} finally {
  await admin.from("app_settings").update({ value: "mock", updated_at: new Date().toISOString() }).eq("key", "ai_mode");
  const mode = await admin.from("app_settings").select("value").eq("key", "ai_mode").single();
  const rows = await admin.from("usage_events").select("kind, outcome, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd").eq("user_id", user.id).order("id");
  report.unshift(`ai_mode is back to: ${mode.data?.value}`, "calls (kind, outcome, input, output, cache write, cache read, cost USD):", ...(rows.data ?? []).map((r) => [r.kind, r.outcome, r.input_tokens, r.output_tokens, r.cache_write_tokens, r.cache_read_tokens, r.cost_usd].join(", ")));
  await admin.from("subscriptions").delete().eq("stripe_subscription_id", `sub_measure_${user.id}`);
  await deleteTestUser(user);
}
const out = process.argv[2] ?? "measure-costs.txt";
writeFileSync(out, report.join("\n") + "\n");
process.stdout.write(`${report.slice(0, 10).join("\n")}\nFull report: ${out}\n`);
