// Shared by the waitlist form (browser) and the server action. No server-only imports here.

/** The hidden field bots fill in and people never see. */
export const HONEYPOT_FIELD = "website";

/** Bots fill forms instantly; people take a few seconds. The sign-in form waits this out itself. */
export const MIN_FILL_MS = 3_000;
