import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Loads DATABASE_URL (and friends) from the repo-root .env, same as the
// scraper and db package, so `pnpm dev` works without a separate
// apps/web/.env.local.
function loadEnvFile() {
  if (process.env.DATABASE_URL) return;
  for (const name of [".env.local", ".env"]) {
    try {
      const path = fileURLToPath(new URL(`../../${name}`, import.meta.url));
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

loadEnvFile();

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@autotrekker/db"],
};

export default nextConfig;
