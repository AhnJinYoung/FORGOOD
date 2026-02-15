#!/usr/bin/env node

/**
 * FORGOOD Doctor — cross-platform environment checker.
 * Replaces scripts/doctor.sh for PowerShell/Windows compatibility.
 *
 * Usage: node scripts/doctor.mjs
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createConnection } from "node:net";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const IS_WIN = process.platform === "win32";

let pass = 0;
let fail = 0;

function check(label, fn) {
  try {
    const result = fn();
    console.log(`  ✅ ${label}: ${result}`);
    pass++;
  } catch (e) {
    console.log(`  ❌ ${label}: ${e.message || e}`);
    fail++;
  }
}

function tryExec(cmd, opts = {}) {
  return execSync(cmd, { timeout: 10_000, stdio: "pipe", ...opts }).toString().trim();
}

function checkPort(host, port) {
  return new Promise((res) => {
    const sock = createConnection({ host, port }, () => { sock.destroy(); res(true); });
    sock.on("error", () => { sock.destroy(); res(false); });
    sock.setTimeout(3000, () => { sock.destroy(); res(false); });
  });
}

async function main() {
  console.log("\n🩺 FORGOOD Doctor\n");

  // ── Node ──
  check("Node.js", () => process.version);

  // ── pnpm ──
  check("pnpm", () => tryExec("pnpm --version"));

  // ── TypeScript ──
  check("TypeScript", () => {
    const tsc = IS_WIN ? join(ROOT_DIR, "node_modules", ".bin", "tsc.CMD") : "tsc";
    return tryExec(`${tsc} --version`, { cwd: ROOT_DIR });
  });

  // ── tsx ──
  check("tsx", () => {
    const tsx = IS_WIN
      ? join(ROOT_DIR, "node_modules", ".bin", "tsx.CMD")
      : join(ROOT_DIR, "node_modules", ".bin", "tsx");
    if (!existsSync(tsx)) throw new Error("not found — run pnpm install");
    return tryExec(`${tsx} --version`, { cwd: ROOT_DIR });
  });

  // ── Prisma ──
  check("Prisma CLI", () => {
    return tryExec("pnpm --filter @forgood/api exec prisma --version", { cwd: ROOT_DIR }).split("\n")[0];
  });

  // ── Prisma Client ──
  check("Prisma Client", () => {
    const clientPath = join(ROOT_DIR, "node_modules", "@prisma", "client", "index.js");
    if (!existsSync(clientPath)) throw new Error("not generated — run: pnpm --filter @forgood/api prisma:generate");
    return "generated";
  });

  // ── Docker ──
  check("Docker", () => {
    try {
      return tryExec("docker --version");
    } catch {
      // Try WSL
      try {
        return tryExec('wsl bash -c "docker --version"') + " (via WSL)";
      } catch {
        throw new Error("not found — install Docker Desktop or Docker in WSL");
      }
    }
  });

  // ── Postgres connectivity ──
  const pgUp = await checkPort("127.0.0.1", 5432);
  if (pgUp) {
    console.log("  ✅ Postgres: reachable on 127.0.0.1:5432");
    pass++;
  } else {
    console.log("  ⚠️  Postgres: not reachable on 5432 (run: pnpm test:stack:up)");
    // Not a hard fail, it's expected when not running tests
  }

  // ── .env files ──
  check("apps/api/.env", () => {
    if (!existsSync(join(ROOT_DIR, "apps", "api", ".env"))) throw new Error("missing");
    return "present";
  });

  check("apps/api/.env.test", () => {
    if (!existsSync(join(ROOT_DIR, "apps", "api", ".env.test"))) throw new Error("missing");
    return "present";
  });

  // ── node_modules ──
  check("node_modules", () => {
    if (!existsSync(join(ROOT_DIR, "node_modules", ".pnpm"))) throw new Error("missing — run pnpm install");
    return "installed";
  });

  // ── Foundry (optional) ──
  check("Foundry (forge)", () => {
    try {
      return tryExec("forge --version").split("\n")[0];
    } catch {
      return "(not installed — optional, needed for contracts)";
    }
  });

  // ── Summary ──
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`Doctor failed: ${err}`);
  process.exit(1);
});
