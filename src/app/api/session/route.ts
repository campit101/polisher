// Tells pages built ahead of time whether the visitor is signed in and still subscribed, for the
// header, the front-page tool and the price card. Answers only true or false: no email, no id.
import { isStillBilling } from "@/lib/billing";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  let subscribed = false;
  if (user) {
    // Read as the user, so Row Level Security shows only their own subscriptions.
    const supabase = await supabaseServer();
    const { data } = await supabase.from("subscriptions").select("status");
    subscribed = (data ?? []).some((row) => isStillBilling(row.status));
  }
  return Response.json({ signedIn: user !== null, subscribed }, { headers: { "cache-control": "no-store" } });
}
