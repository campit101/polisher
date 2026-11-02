import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".next-verify/**",
    ".next-e2e/**",
    ".next-lh/**",
    ".lighthouse/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    ".lighthouseci/**",
    // Local AI-checker tools for evaluation (Python, models), never part of the site.
    ".eval-tools/**",
    // Local video work (git-ignored, never uploaded), never part of the site.
    "videos/**",
    // Edge Functions run on Deno and are checked by `deno lint` instead.
    "supabase/functions/rewrite/**",
    "supabase/functions/keepalive/**",
  ]),
]);

export default eslintConfig;
