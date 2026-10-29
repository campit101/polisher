// One email check for every form: trimmed, lower-cased, well-formed and not a throwaway inbox.
import { z } from "zod";
import { isDisposableEmail } from "@/config/disposable-domains";

const emailSchema = z.string().trim().toLowerCase().max(320).pipe(z.email());

export const EMAIL_MESSAGES = {
  invalid: "Enter a full email address, like name@example.com.",
  disposable: "Use a permanent email address. Throwaway inboxes are not accepted.",
};

export function parseEmail(value: unknown): { ok: true; email: string } | { ok: false; message: string } {
  const parsed = emailSchema.safeParse(typeof value === "string" ? value : "");
  if (!parsed.success) return { ok: false, message: EMAIL_MESSAGES.invalid };
  if (isDisposableEmail(parsed.data)) return { ok: false, message: EMAIL_MESSAGES.disposable };
  return { ok: true, email: parsed.data };
}
