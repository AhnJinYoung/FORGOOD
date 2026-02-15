#!/usr/bin/env node

/**
 * FORGOOD Smoke Test — exercises the full mission lifecycle.
 *
 * Usage:
 *   API_BASE_URL=http://127.0.0.1:4000 node scripts/smoke-test.mjs
 */

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4000";
const SAMPLE_PROOF_URL =
  process.env.SAMPLE_PROOF_URL ||
  "https://images.unsplash.com/photo-1552083375-1447ce886485?auto=format&fit=crop&w=800&q=60";

const startTime = Date.now();

// ─── Helpers ────────────────────────────────────────────────

function elapsed() {
  return `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
}

function log(step, message) {
  console.log(`  [${elapsed()}] ${step.padEnd(20)} ${message}`);
}

async function call(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    throw new Error(`${path} → ${res.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log(`\n🧪 FORGOOD Smoke Test`);
  console.log(`   Target: ${API_BASE_URL}\n`);

  // 1. Health
  const health = await call("/health");
  if (!health.ok) throw new Error("health check failed");
  log("Health", `ok=${health.ok} onChain=${health.onChainEnabled}`);

  // 2. Propose
  const proposer = "0x1111111111111111111111111111111111111111";
  const submitter = "0x2222222222222222222222222222222222222222";

  const created = await call("/missions", {
    method: "POST",
    body: JSON.stringify({
      title: "Smoke Test: Community park cleanup",
      description:
        "Collect litter in a public park, sort recyclables, and post before/after proof images demonstrating visible improvement.",
      category: "environment",
      location: "test-city",
      proposer,
    }),
  });

  const missionId = created?.mission?.id;
  if (!missionId) throw new Error("mission id missing");
  log("Propose", `id=${missionId}`);

  // 3. Evaluate (auto → fallback to manual)
  let evaluationMode = "auto";
  let aiConfidence = null;
  try {
    const evaluated = await call(`/missions/${missionId}/auto-evaluate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    aiConfidence = evaluated?.evaluation?.confidence;
    const reward = evaluated?.evaluation?.rewardFormatted ?? evaluated?.evaluation?.reward;
    log("Auto-Evaluate", `confidence=${aiConfidence} reward=${reward}`);
  } catch (error) {
    evaluationMode = "manual-fallback";
    log("Auto-Evaluate", `FAILED → manual fallback (${error.message?.slice(0, 60)})`);
    await call(`/missions/${missionId}/evaluate`, {
      method: "POST",
      body: JSON.stringify({
        difficulty: 5,
        impact: 6,
        confidence: 0.5,
        rewardAmount: "300000000000000000",
        rationale: `Manual fallback: auto-evaluate failed — ${error.message?.slice(0, 100)}`,
      }),
    });
    aiConfidence = 0.5;
    log("Manual-Evaluate", "difficulty=5 impact=6 reward=0.3 FORGOOD");
  }

  // 4. Activate
  await call(`/missions/${missionId}/activate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  log("Activate", "status → active");

  // 5. Submit Proof
  await call(`/missions/${missionId}/submit-proof`, {
    method: "POST",
    body: JSON.stringify({
      submitter,
      proofUri: SAMPLE_PROOF_URL,
      note: "Smoke test proof submission",
    }),
  });
  log("Submit Proof", `uri=${SAMPLE_PROOF_URL.slice(0, 50)}…`);

  // 6. Verify (auto → fallback to manual)
  let verificationVerdict = "unknown";
  try {
    const verified = await call(`/missions/${missionId}/auto-verify`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    verificationVerdict = verified?.verification?.verdict || "unknown";
    log("Auto-Verify", `verdict=${verificationVerdict} decision=${verified?.autoDecision}`);

    if (verificationVerdict !== "approved") {
      await call(`/missions/${missionId}/verify`, {
        method: "POST",
        body: JSON.stringify({
          verdict: "approved",
          confidence: 0.5,
          evidence: ["manual override in smoke test"],
        }),
      });
      verificationVerdict = "approved (manual override)";
      log("Manual-Verify", "overridden → approved");
    }
  } catch {
    await call(`/missions/${missionId}/verify`, {
      method: "POST",
      body: JSON.stringify({
        verdict: "approved",
        confidence: 0.5,
        evidence: ["manual fallback after auto-verify failure"],
      }),
    });
    verificationVerdict = "approved (manual fallback)";
    log("Manual-Verify", "fallback → approved");
  }

  // 7. Reward
  const rewarded = await call(`/missions/${missionId}/reward`, {
    method: "POST",
    body: JSON.stringify({
      txHash: "0xsmoketest0000000000000000000000000000000000000000000000000000",
    }),
  });

  const finalMission = rewarded?.mission;
  if (finalMission?.status !== "rewarded") {
    throw new Error(`expected status=rewarded, got ${finalMission?.status}`);
  }
  log("Reward", `status=${finalMission.status} reward=${rewarded.rewardFormatted ?? "N/A"}`);

  // ─── Summary ──────────────────────────────────────────────
  console.log(`\n✅ Smoke test PASSED in ${elapsed()}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        missionId,
        evaluationMode,
        aiConfidence,
        verificationVerdict,
        finalStatus: finalMission.status,
        rewardFormatted: rewarded.rewardFormatted ?? null,
        txHash: rewarded.txHash || finalMission.onchainTxHash || null,
        elapsed: elapsed(),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(`\n❌ Smoke test FAILED: ${err.message || err}`);
  process.exit(1);
});
