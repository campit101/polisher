// UTM labels say where a visitor came from. They travel in links and hidden form fields only:
// no cookies and no browser storage.

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type Utm = Partial<Record<UtmKey, string>>;

type SearchParams = Record<string, string | string[] | undefined>;

/** Keeps only well-formed UTM values: lower-cased, at most 100 safe characters. */
export function readUtm(params: SearchParams | URLSearchParams | FormData): Utm {
  const utm: Utm = {};
  for (const key of UTM_KEYS) {
    const raw = params instanceof URLSearchParams || params instanceof FormData ? params.get(key) : params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== "string") continue;
    const clean = value.trim().toLowerCase();
    if (/^[a-z0-9._-]{1,100}$/.test(clean)) utm[key] = clean;
  }
  return utm;
}

/** "?utm_source=x&..." for carrying UTMs on internal links, or "" when there are none. */
export function utmQuery(utm: Utm): string {
  const query = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}
