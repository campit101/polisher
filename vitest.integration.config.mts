import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests talk to the real polisher-test Supabase project, so they are kept out of
// `npm run verify` (which must run offline in CI). Run with: npm run test:integration
export default defineConfig({
  resolve: {
    alias: {
      "@polish": fileURLToPath(new URL("./supabase/functions/_shared/polish", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
