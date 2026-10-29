// A visitor code for counting different people per day on /admin (Cam, 21 Oct). It mixes the day,
// the visitor's address (IPv6 cut to its /64, like the rate limits) and browser type, scrambled with
// the server's secret salt. A new day gives a new code, so visits on different days cannot be linked,
// and the code cannot be turned back into an address.
import { hashIp, rateLimitAddress } from "./waitlist";

/** `day` is the UTC date, YYYY-MM-DD. */
export function dailyVisitorId(ip: string, userAgent: string, salt: string, day: string): string {
  return hashIp(`visitor|${day}|${rateLimitAddress(ip)}|${userAgent.slice(0, 300)}`, salt);
}
