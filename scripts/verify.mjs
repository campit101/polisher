// Runs every quality check in order and exits non-zero if any fails.
// Usage: npm run verify
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { findDeno } from "./find-deno.mjs";

const root = process.cwd();
const require = createRequire(join(root, "package.json"));

/** Path to a locally installed CLI's JavaScript entry, run with node directly (no shell). */
function bin(pkg, name) {
  const manifest = require.resolve(`${pkg}/package.json`);
  const { bin: bins } = require(manifest);
  const entry = typeof bins === "string" ? bins : bins[name];
  return join(dirname(manifest), entry);
}

function run(label, command, args, env = {}) {
  const started = Date.now();
  process.stdout.write(`\n=== ${label} ===\n`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status !== 0) {
    process.stderr.write(`\nVERIFY FAILED at step "${label}" (${seconds}s).\n`);
    process.exit(result.status ?? 1);
  }
  process.stdout.write(`--- ${label} passed (${seconds}s)\n`);
}

const node = (label, pkg, name, args, env) => run(label, process.execPath, [bin(pkg, name), ...args], env);

function edgeFunctionEntries() {
  const dir = join(root, "supabase", "functions");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith("_") && !name.startsWith("."))
    .map((name) => join("supabase", "functions", name, "index.ts"))
    .filter((file) => existsSync(file) && statSync(file).isFile());
}

node("lint", "eslint", "eslint", [".", "--max-warnings=0"]);
node("route types", "next", "next", ["typegen"]);
node("typecheck", "typescript", "tsc", ["--noEmit"]);
node("unit tests", "vitest", "vitest", ["run"]);

const entries = edgeFunctionEntries();
if (entries.length > 0) {
  const deno = findDeno();
  if (!deno) {
    process.stderr.write("\nVERIFY FAILED: Deno is not installed, so Edge Functions cannot be checked.\n");
    process.exit(1);
  }
  run("edge functions: deno check", deno, ["check", ...entries]);
  run("edge functions: deno lint", deno, ["lint", join("supabase", "functions")]);
} else {
  process.stdout.write("\n=== edge functions ===\nNo Edge Functions yet.\n");
}

node("build", "next", "next", ["build"], { NEXT_DIST_DIR: ".next-verify" });
run("secret scan", process.execPath, [join("scripts", "secret-scan.mjs")]);

process.stdout.write("\nVERIFY PASSED: all checks green.\n");
