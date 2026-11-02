// The visitor's hashed internet address and a database-backed rate limit.
import { headers } from "next/headers";
import { dailyVisitorId } from "@/lib/visitor-id";
import { hashIp, rateLimitAddress } from "@/lib/waitlist";
import { requireEnv } from "./env";
import { supabaseAdmin } from "./supabase-admin";

export async function visitorHash(): Promise<string> {
  const list = await headers();
  const ip = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "unknown";
  return hashIp(rateLimitAddress(ip), requireEnv("IP_HASH_SALT"));
}

/** Today's visitor code for counting different people (no address is stored). */
export async function visitorDayId(now = new Date()): Promise<string> {
  const list = await headers();
  const ip = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "unknown";
  return dailyVisitorId(ip, list.get("user-agent") ?? "", requireEnv("IP_HASH_SALT"), now.toISOString().slice(0, 10));
}

/** True while `key` is within `max` hits per window. Fails closed if the database is unreachable. */
export async function withinRateLimit(key: string, windowSeconds: number, max: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("hit_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) {
    console.error("rate limit check failed", error.code);
    return false;
  }
  return data === true;
}
