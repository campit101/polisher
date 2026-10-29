// Campaign labels for accounts made by the old Continue with Google sign-in (G1, removed for the demo).
import { UTM_KEYS, type Utm } from "./utm";

type ProfileUtm = Record<(typeof UTM_KEYS)[number], string | null>;

const NEW_ACCOUNT_MS = 10 * 60 * 1000;

/**
 * Campaign labels to save on an account that Google sign-in has just created. Email sign-ups get
 * them when the account is made; Google ones cannot, so they are saved on the way back. Only a
 * new account with no labels yet is changed, so the first link a person came from is what counts.
 */
export function utmForNewAccount(profile: ProfileUtm, utm: Utm, createdAt: string, now = new Date()): Utm | null {
  if (Object.keys(utm).length === 0) return null;
  if (UTM_KEYS.some((key) => profile[key])) return null;
  if (now.getTime() - new Date(createdAt).getTime() > NEW_ACCOUNT_MS) return null;
  return utm;
}
