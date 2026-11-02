import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { admin } from "../integration/supabase-test-project";
import { expect } from "./fixtures";

export const newEmail = (prefix = "auth") => `${prefix}-${randomUUID().slice(0, 8)}+e2e@polisher.test`;

/** Creates a confirmed user and signs in through the real /auth/confirm route (no email needed). */
export async function signIn(page: Page, userIds: string[], email = newEmail()) {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw created.error;
  userIds.push(created.data.user.id);
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  await page.goto(`/auth/confirm?token_hash=${link.data.properties.hashed_token}&type=email&next=/account`);
  await expect(page).toHaveURL(/\/account$/);
  return { id: created.data.user.id, email };
}

/** Finds a user by email (used for demo accounts the app made, so the test can clean them up). */
export async function findUserByEmail(email: string) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data.users.find((u) => u.email === email);
}
