import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@polish": fileURLToPath(new URL("./supabase/functions/_shared/polish", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "supabase/functions/_shared/**/*.test.ts",
    ],
  },
});
