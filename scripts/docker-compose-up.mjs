#!/usr/bin/env node

/**
 * Cross-platform docker-compose up -d postgres
 * Tries native docker-compose, then docker compose (v2), then WSL fallback.
 */

import { execSync } from "node:child_process";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const COMPOSE = join(ROOT, "docker-compose.yml");
const IS_WIN = process.platform === "win32";

function tryExec(cmd) {
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit", timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

function wslPath(p) {
  return p.replace(/\\/g, "/").replace(/^([A-Z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
}

console.log("Starting Postgres...");

const ok =
  tryExec(`docker-compose -f "${COMPOSE}" up -d postgres`) ||
  tryExec(`docker compose -f "${COMPOSE}" up -d postgres`) ||
  (IS_WIN && tryExec(`wsl bash -c "docker-compose -f '${wslPath(COMPOSE)}' up -d postgres"`)) ||
  (IS_WIN && tryExec(`wsl bash -c "docker compose -f '${wslPath(COMPOSE)}' up -d postgres"`));

if (!ok) {
  console.error("❌ Could not start Postgres. Ensure Docker is running.");
  process.exit(1);
}

console.log("✅ Postgres started on port 5432");
