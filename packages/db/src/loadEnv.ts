import { readFileSync } from "node:fs";

// Loads DATABASE_URL (and friends) from the repo-root .env when running locally,
// so commands work without prefixing env vars every time.
export function loadEnvFile() {
  if (process.env.DATABASE_URL) return;
  for (const name of [".env.local", ".env"]) {
    try {
      const path = new URL(`../../../${name}`, import.meta.url);
      const content = readFileSync(path, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      // file not present, that's fine
    }
  }
}
