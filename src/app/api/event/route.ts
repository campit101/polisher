// First-party page-view counter: an event name, a path, campaign labels and a daily visitor code
// that changes every day and holds no address (src/lib/visitor-id.ts). Count my visits and Global
// Privacy Control stop the browser sending it at all.
import { readUtm } from "@/lib/utm";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { visitorDayId, visitorHash, withinRateLimit } from "@/lib/server/visitor";

const ALLOWED_EVENTS = new Set(["landing_view"]);

export async function POST(request: Request): Promise<Response> {
  let body: { name?: unknown; path?: unknown; search?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  if (!ALLOWED_EVENTS.has(name)) return new Response(null, { status: 400 });
  const path = typeof body.path === "string" && /^\/[\w\-/]{0,199}$/.test(body.path) ? body.path : null;
  const utm = readUtm(new URLSearchParams(typeof body.search === "string" ? body.search : ""));

  // Over the limit: drop the view quietly (an error status would show in the visitor's console).
  if (!(await withinRateLimit(`event:${await visitorHash()}`, 3600, 60))) return new Response(null, { status: 204 });

  const { error } = await supabaseAdmin().from("events").insert({ name, path, ...utm, visitor_day: await visitorDayId() });
  if (error) console.error("event insert failed", error.code);
  return new Response(null, { status: 204 });
}
