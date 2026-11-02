// Finds the Deno binary: PATH first, then the winget install folder on Windows.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function findDeno() {
  const onPath = spawnSync("deno", ["--version"], { stdio: "ignore", shell: false });
  if (onPath.status === 0) return "deno";

  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  const packages = join(localAppData, "Microsoft", "WinGet", "Packages");
  if (!existsSync(packages)) return null;
  const folder = readdirSync(packages).find((name) => name.startsWith("DenoLand.Deno"));
  if (!folder) return null;
  const exe = join(packages, folder, "deno.exe");
  return existsSync(exe) ? exe : null;
}
