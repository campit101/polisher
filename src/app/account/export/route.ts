// "Download my data": everything Polisher holds about the signed-in user, as a JSON file.
import { exportAccount } from "@/lib/server/account";
import { currentUser } from "@/lib/supabase/server";

export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const data = await exportAccount(user);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="polisher-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
