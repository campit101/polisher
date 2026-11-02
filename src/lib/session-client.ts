// One question to /api/session shared by everything on a page (header, front-page tool, price
// card). A fresh question after a few seconds, so signing in or out never leaves a stale answer.
export type SessionInfo = { signedIn: boolean; subscribed: boolean };

const signedOut: SessionInfo = { signedIn: false, subscribed: false };
let asked: { at: number; answer: Promise<SessionInfo> } | undefined;

export function askSession(): Promise<SessionInfo> {
  if (asked && Date.now() - asked.at < 5_000) return asked.answer;
  const answer = fetch("/api/session", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : signedOut))
    .then((body: { signedIn?: unknown; subscribed?: unknown }) => ({ signedIn: body.signedIn === true, subscribed: body.subscribed === true }))
    .catch(() => signedOut);
  asked = { at: Date.now(), answer };
  return answer;
}
