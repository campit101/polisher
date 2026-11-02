import { defineConfig, devices } from "@playwright/test";
import { E2E_ADMIN_EMAIL } from "./tests/e2e/admin-email";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const useLocalServer = !process.env.E2E_BASE_URL;
// Webhook tests sign their own events, so the local server gets a made-up signing secret.
// It is not a Stripe secret and only works against this local test server.
process.env.E2E_STRIPE_WEBHOOK_SECRET ??= "whsec_e2e_local_only";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // The real hosted Stripe Checkout test only runs when asked for with --grep @stripe-hosted.
  grepInvert: process.env.E2E_STRIPE_HOSTED ? undefined : /@stripe-hosted/,
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: useLocalServer
    ? {
        command: `node node_modules/next/dist/bin/next build && node node_modules/next/dist/bin/next start -p ${port}`,
        url: baseURL,
        timeout: 240_000,
        reuseExistingServer: false,
        env: {
          NEXT_DIST_DIR: ".next-e2e",
          NEXT_TELEMETRY_DISABLED: "1",
          STRIPE_WEBHOOK_SECRET: process.env.E2E_STRIPE_WEBHOOK_SECRET,
          // The admin tests sign in as a throwaway .test address, never a real inbox.
          ADMIN_EMAILS: E2E_ADMIN_EMAIL,
        },
      }
    : undefined,
});
