// The test-only functions run on the test project and nowhere else. The project is recognised by the
// SHA-256 fingerprint of its reference, so the public code does not name the project.
export const TEST_PROJECT_REF_SHA256 = "5ce6c3e5793fd158594c5f4a2b638ccb73143c1af4527ea14b565edd642dc440";

/** True only when the address is https://<ref>.supabase.co and the reference has this fingerprint. */
export async function isProject(projectUrl: string, fingerprint: string = TEST_PROJECT_REF_SHA256): Promise<boolean> {
  let host: string;
  try {
    host = new URL(projectUrl).hostname;
  } catch {
    return false;
  }
  const match = /^([a-z]{20})\.supabase\.co$/.exec(host);
  if (!match) return false;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(match[1])));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("") === fingerprint;
}
