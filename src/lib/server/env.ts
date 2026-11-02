// Server-only settings. Never import this from a "use client" file.

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example and npm run setup:secrets.`);
  return value;
}
