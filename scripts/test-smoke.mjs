#!/usr/bin/env node

/**
 * FORGOOD Cross-Platform Test Runner
 *
 * Replaces the bash-only test-api.sh with a Node.js script that works
 * on Windows (PowerShell), macOS, and Linux.
 *
 * Steps:
 *   1. Start Postgres via docker-compose (tries docker, falls back to wsl docker)
 *   2. Wait for Postgres to accept connections
 *   3. Run prisma migrate deploy
 *   4. Boot the API server in test mode
 *   5. Wait for /health
 *   6. Run the smoke test
 *   7. Tear down (kill API, optionally stop Postgres)
 *
 * Usage:
 *   node scripts/test-smoke.mjs              # full flow
 *   node scripts/test-smoke.mjs --skip-db    # skip Postgres startup (already running)
 *   node scripts/test-smoke.mjs --keep-db    # don't stop Postgres after test
 */

import { spawn, execSync } from "node:child_process";
import { resolve, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { createConnection } from "node:net";

// ─── Config ─────────────────────────────────────────────────

const ROOT_DIR = resolve(import.meta.dirname, "..");
const API_DIR = join(ROOT_DIR, "apps", "api");
const ENV_TEST = join(API_DIR, ".env.test");
const COMPOSE_FILE = join(ROOT_DIR, "docker-compose.yml");

const IS_WIN = process.platform === "win32";
const args = process.argv.slice(2);
const SKIP_DB = args.includes("--skip-db");
const KEEP_DB = args.includes("--keep-db");

// Parse .env.test into an object
function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    console.error(`❌ Missing ${filePath}`);
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return env;
}

const testEnv = parseEnvFile(ENV_TEST);
const PORT = testEnv.PORT || "4010";

// ─── Helpers ────────────────────────────────────────────────

function log(step, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`  [${ts}] ${step.padEnd(18)} ${msg}`);
}

/** Run a command and return { code, stdout, stderr } */
function exec(cmd, opts = {}) {
  try {
    const out = execSync(cmd, {
      cwd: ROOT_DIR,
      timeout: 60_000,
      stdio: "pipe",
      ...opts,
    });
    return { code: 0, stdout: out.toString() };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout?.toString() ?? "", stderr: e.stderr?.toString() ?? "" };
  }
}

/** Check if a TCP port is reachable */
function waitForPort(host, port, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      if (Date.now() > deadline) return reject(new Error(`Port ${port} not reachable after ${timeoutMs}ms`));
      const sock = createConnection({ host, port: Number(port) }, () => {
        sock.destroy();
        resolve();
      });
      sock.on("error", () => {
        sock.destroy();
        setTimeout(attempt, 1000);
      });
    }
    attempt();
  });
}

/** Check if a URL returns ok */
async function waitForHealth(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = await res.json();
        if (body.ok) return body;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Health check at ${url} failed after ${timeoutMs}ms`);
}

/** Try to run docker-compose, falling back to WSL on Windows */
function dockerCompose(action) {
  // Try native docker-compose first
  let result = exec(`docker-compose -f "${COMPOSE_FILE}" ${action}`);
  if (result.code === 0) return true;

  // On Windows, try 'docker compose' (v2 syntax)
  if (IS_WIN) {
    result = exec(`docker compose -f "${COMPOSE_FILE}" ${action}`);
    if (result.code === 0) return true;
  }

  // Fall back to WSL
  const wslCompose = COMPOSE_FILE.replace(/\\/g, "/").replace(/^([A-Z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
  result = exec(`wsl bash -c "docker-compose -f '${wslCompose}' ${action}"`);
  if (result.code === 0) return true;

  // Try WSL docker compose v2
  result = exec(`wsl bash -c "docker compose -f '${wslCompose}' ${action}"`);
  return result.code === 0;
}

// ─── Main Flow ──────────────────────────────────────────────

let apiProcess = null;

async function cleanup(exitCode = 0) {
  if (apiProcess && !apiProcess.killed) {
    log("Cleanup", "Stopping API server...");
    apiProcess.kill("SIGTERM");
    // On Windows, sometimes SIGTERM isn't enough
    await new Promise((r) => setTimeout(r, 500));
    try { apiProcess?.kill("SIGKILL"); } catch { /* already dead */ }
  }

  if (!KEEP_DB && !SKIP_DB) {
    log("Cleanup", "Stopping Postgres...");
    dockerCompose("down");
  }

  // Force exit — child process death can cause non-zero codes otherwise
  process.exitCode = exitCode;
  setTimeout(() => process.exit(exitCode), 200);
}

process.on("SIGINT", () => cleanup(1));
process.on("SIGTERM", () => cleanup(1));

async function main() {
  console.log("\n🧪 FORGOOD Test Runner (cross-platform)\n");

  // ──── Step 1: Postgres ────────────────────────────────────
  if (!SKIP_DB) {
    log("Postgres", "Starting via docker-compose...");
    const ok = dockerCompose("up -d postgres");
    if (!ok) {
      console.error("❌ Could not start Postgres. Make sure Docker is running.");
      console.error("   - On Windows: Start Docker Desktop, or ensure WSL has Docker installed.");
      console.error("   - Try: node scripts/test-smoke.mjs --skip-db  (if Postgres is already running)");
      process.exit(1);
    }
    log("Postgres", "Container started");
  } else {
    log("Postgres", "Skipped (--skip-db)");
  }

  // ──── Step 2: Wait for Postgres ───────────────────────────
  log("Postgres", "Waiting for port 5432...");
  try {
    await waitForPort("127.0.0.1", 5432, 30_000);
    log("Postgres", "✓ Accepting connections");
  } catch {
    console.error("❌ Postgres is not reachable on 127.0.0.1:5432");
    console.error("   Make sure Docker is running and port 5432 is exposed.");
    await cleanup(1);
  }

  // ──── Step 3: Prisma Migrate ──────────────────────────────
  log("Prisma", "Running migrate deploy...");
  const migrateResult = exec(
    `pnpm --filter @forgood/api exec prisma migrate deploy`,
    { env: { ...process.env, ...testEnv } },
  );
  if (migrateResult.code !== 0) {
    console.error("❌ Prisma migrate failed:");
    console.error(migrateResult.stderr || migrateResult.stdout);
    await cleanup(1);
  }
  log("Prisma", "✓ Migrations applied");

  // ──── Step 4: Boot API Server ─────────────────────────────
  log("API", `Booting on port ${PORT} (test mode)...`);

  const tsxBin = IS_WIN
    ? join(ROOT_DIR, "node_modules", ".bin", "tsx.CMD")
    : join(ROOT_DIR, "node_modules", ".bin", "tsx");

  // Find tsx - try workspace root, then api-local
  let tsxPath = tsxBin;
  if (!existsSync(tsxPath)) {
    tsxPath = IS_WIN
      ? join(API_DIR, "node_modules", ".bin", "tsx.CMD")
      : join(API_DIR, "node_modules", ".bin", "tsx");
  }
  if (!existsSync(tsxPath)) {
    // Fallback: use pnpm exec
    tsxPath = null;
  }

  const apiEnv = {
    ...process.env,
    ...testEnv,
    FORGOOD_MODE: "test",
    NODE_ENV: "test",
  };

  // On Windows, .CMD wrappers require shell; on Unix, use the binary directly
  const needsShell = IS_WIN;

  if (tsxPath) {
    apiProcess = spawn(tsxPath, [join(API_DIR, "src", "index.ts")], {
      cwd: API_DIR,
      env: apiEnv,
      stdio: ["ignore", "pipe", "pipe"],
      shell: needsShell,
      windowsHide: true,
    });
  } else {
    apiProcess = spawn("pnpm", ["--filter", "@forgood/api", "exec", "tsx", "src/index.ts"], {
      cwd: ROOT_DIR,
      env: apiEnv,
      stdio: ["ignore", "pipe", "pipe"],
      shell: needsShell,
      windowsHide: true,
    });
  }

  // Capture API output for debugging
  let apiLog = "";
  apiProcess.stdout?.on("data", (d) => { apiLog += d.toString(); });
  apiProcess.stderr?.on("data", (d) => { apiLog += d.toString(); });

  apiProcess.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`\n❌ API server exited with code ${code}`);
      if (apiLog) console.error("API output:\n" + apiLog.slice(-2000));
    }
  });

  // ──── Step 5: Wait for Health ─────────────────────────────
  log("API", "Waiting for /health...");
  try {
    const health = await waitForHealth(`http://127.0.0.1:${PORT}/health`, 45_000);
    log("API", `✓ Healthy (mode=${health.mode}, text=${health.models?.text})`);
  } catch {
    console.error(`\n❌ API health check failed on port ${PORT}`);
    if (apiLog) console.error("API output:\n" + apiLog.slice(-2000));
    await cleanup(1);
  }

  // ──── Step 6: Smoke Test ──────────────────────────────────
  log("Smoke", "Running smoke-test.mjs...");
  const smokeResult = exec(
    `node "${join(API_DIR, "scripts", "smoke-test.mjs")}"`,
    {
      env: { ...apiEnv, API_BASE_URL: `http://127.0.0.1:${PORT}` },
      timeout: 120_000,
    },
  );

  if (smokeResult.stdout) console.log(smokeResult.stdout);
  if (smokeResult.stderr) console.error(smokeResult.stderr);

  if (smokeResult.code !== 0) {
    console.error("\n❌ Smoke test FAILED");
    if (apiLog) console.error("API output:\n" + apiLog.slice(-2000));
    await cleanup(1);
  }

  // ──── Step 7: Done ────────────────────────────────────────
  console.log("\n✅ All tests passed!\n");
  await cleanup(0);
}

main().catch(async (err) => {
  console.error(`\n❌ Test runner failed: ${err.message || err}`);
  await cleanup(1);
});
