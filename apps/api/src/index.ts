import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { PrismaClient, MissionStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { evaluateMission, verifyProof, detectAiGenerated, screenMissionProposal, getForGoodMode, getActiveModels, callOpenRouterRaw, isAiAvailable } from "./ai/openrouter";
import { getTreasuryBalance, releaseReward, isOnChainEnabled, publicClient } from "./chain/monad";
import {
  MissionProposalSchema,
  ProofSubmissionSchema,
  ProofVerificationSchema,
  formatReward,
  resolveVerdict,
  CONFIDENCE,
  CATEGORIES,
  computeReward,
  computeRank,
  getAllRanks,
} from "@forgood/shared";

// ─── Type augmentation for new schema fields (pending prisma generate) ──
// These fields exist in the DB schema but prisma generate may not have
// been re-run yet, so we cast where needed.
type MissionRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string | null;
  proposer: string;
  status: MissionStatus;
  rewardAmount: bigint | null;
  aiDifficulty: number | null;
  aiImpact: number | null;
  aiConfidence: number | null;
  aiRationale: string | null;
  proofUri: string | null;
  proofNote: string | null;
  proofSubmittedBy: string | null;
  onchainTxHash: string | null;
  claimedBy: string | null;
  claimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  proofs?: unknown[];
  [key: string]: unknown;
};

// ─── Prisma ─────────────────────────────────────────────────
const prisma = new PrismaClient();

// Cast helper — Prisma types may not include claimedBy/claimedAt until
// prisma generate is re-run after the migration. This is safe because
// the columns exist in the DB schema.
function asMission<T>(row: T): MissionRow { return row as unknown as MissionRow; }
function asMissions<T>(rows: T[]): MissionRow[] { return rows as unknown as MissionRow[]; }

// ─── Fastify ────────────────────────────────────────────────
const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024, // 10MB for image uploads
});

// BigInt JSON serialization
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

await app.register(cors, {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : true, // dev: allow all; prod: set CORS_ORIGIN to "https://forgood.vercel.app,https://forgood.xyz"
});
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

// ─── Uploads directory ──────────────────────────────────────
const UPLOADS_DIR = join(process.cwd(), "uploads");
await mkdir(UPLOADS_DIR, { recursive: true });

// ─── Request Schemas ────────────────────────────────────────

const MissionEvaluationRequestSchema = z.object({
  difficulty: z.number().min(1).max(10),
  impact: z.number().min(1).max(10),
  confidence: z.number().min(0).max(1),
  rewardAmount: z.string().regex(/^\d+$/),
  rationale: z.string().min(10).max(2000),
});

const ProofSubmissionRequestSchema = ProofSubmissionSchema.omit({ missionId: true });

const RewardRequestSchema = z.object({
  txHash: z.string().min(10).max(128).optional(),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

const BoostRequestSchema = z.object({
  booster: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^\d+$/, "Amount must be wei string"),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
});

// ─── Helpers ────────────────────────────────────────────────

function serializeMission(raw: unknown) {
  const mission = raw as MissionRow;
  return {
    ...mission,
    rewardAmount: mission.rewardAmount?.toString() ?? null,
    rewardFormatted: formatReward(mission.rewardAmount),
    claimedAt: mission.claimedAt?.toISOString() ?? null,
  };
}

function httpError(reply: { code: (n: number) => { send: (body: unknown) => void } }, code: number, message: string) {
  return reply.code(code).send({ error: message });
}

async function findMission(id: string): Promise<MissionRow | null> {
  const m = await prisma.mission.findUnique({ where: { id } });
  return m as MissionRow | null;
}

async function findMissionOrThrow(id: string, reply: { code: (n: number) => { send: (body: unknown) => void } }): Promise<MissionRow | null> {
  const mission = await findMission(id);
  if (!mission) {
    httpError(reply, 404, "Mission not found");
    return null;
  }
  return mission;
}

function expectStatus(
  mission: { status: MissionStatus },
  expected: MissionStatus | MissionStatus[],
  reply: { code: (n: number) => { send: (body: unknown) => void } },
): boolean {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(mission.status)) {
    httpError(reply, 409, `Mission status is "${mission.status}", expected ${allowed.map((s) => `"${s}"`).join(" or ")}`);
    return false;
  }
  return true;
}

// ─── Routes: Root & Health & Treasury ────────────────────────

app.get("/", async () => {
  const models = getActiveModels();
  return {
    name: "FORGOOD API",
    version: "0.0.1",
    mode: models.mode,
    aiAvailable: isAiAvailable(),
    onChainEnabled: isOnChainEnabled(),
    endpoints: ["/health", "/missions", "/treasury"],
  };
});

app.get("/health", async () => {
  const models = getActiveModels();
  return {
    ok: true,
    mode: models.mode,
    models: { text: models.text, vision: models.vision },
    aiAvailable: isAiAvailable(),
    onChainEnabled: isOnChainEnabled(),
    contracts: {
      treasury: process.env.TREASURY_ADDRESS ?? null,
      token: process.env.FORGOOD_TOKEN_ADDRESS ?? null,
    },
    timestamp: new Date().toISOString(),
  };
});

app.get("/treasury", async (_request, reply) => {
  // When on-chain is not configured (test mode), return a placeholder response
  if (!isOnChainEnabled()) {
    return {
      balance: "0",
      formatted: "0 FORGOOD",
      onChainEnabled: false,
      note: "On-chain features disabled. Set AGENT_PRIVATE_KEY, TREASURY_ADDRESS, and FORGOOD_TOKEN_ADDRESS to enable.",
    };
  }

  try {
    const balance = await getTreasuryBalance();
    return {
      balance: balance.toString(),
      formatted: formatReward(balance),
      onChainEnabled: true,
    };
  } catch (error) {
    return httpError(reply, 500, error instanceof Error ? error.message : "Failed to fetch treasury balance");
  }
});

// ─── Routes: Mission CRUD ───────────────────────────────────

app.get("/missions", async (request) => {
  const { status, limit, excludeClaimed } = request.query as {
    status?: string;
    limit?: string;
    excludeClaimed?: string;
  };

  const where: Record<string, unknown> = {};
  if (status) where.status = status as MissionStatus;
  // For active missions feed: hide missions already claimed by someone
  if (excludeClaimed === "true") {
    where.claimedBy = null;
  }
  const take = limit ? Math.min(Number(limit), 100) : 50;

  const missions = await prisma.mission.findMany({
    where: where as any,
    orderBy: { createdAt: "desc" },
    take,
  });

  return { missions: missions.map(serializeMission), count: missions.length };
});

app.get("/missions/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const mission = await prisma.mission.findUnique({
    where: { id },
    include: { proofs: { orderBy: { createdAt: "desc" } } },
  });
  if (!mission) return httpError(reply, 404, "Mission not found");
  return { mission: serializeMission(mission) };
});

app.post("/missions", async (request, reply) => {
  const parsed = MissionProposalSchema.safeParse(request.body);
  if (!parsed.success) return httpError(reply, 400, parsed.error.issues.map((i) => i.message).join("; "));

  const { title, description, category, location, proposer } = parsed.data;

  // ── AI Social-Good Screening ──
  let screening: { approved: boolean; confidence: number; reason: string; suggestion?: string } | null = null;
  try {
    screening = await screenMissionProposal({ title, description, category });
    app.log.info({ screening }, "Mission screening result");

    if (!screening.approved && screening.confidence >= 0.6) {
      return reply.code(422).send({
        error: "Mission proposal was not approved by the AI screening agent",
        screening: {
          approved: false,
          reason: screening.reason,
          suggestion: screening.suggestion ?? "Please revise your mission to better serve a community or social good cause.",
          confidence: screening.confidence,
        },
      });
    }
  } catch (screenError) {
    app.log.warn(screenError, "Mission screening failed — allowing through");
  }

  const mission = await prisma.mission.create({
    data: {
      title,
      description,
      category,
      location: location ?? null,
      proposer,
      status: MissionStatus.proposed,
    },
  });

  return reply.code(201).send({
    mission: serializeMission(mission),
    screening: screening ? { approved: screening.approved, reason: screening.reason, suggestion: screening.suggestion } : null,
  });
});

// ─── Routes: Evaluation ─────────────────────────────────────

app.post("/missions/:id/evaluate", async (request, reply) => {
  const { id } = request.params as { id: string };
  const parsed = MissionEvaluationRequestSchema.safeParse(request.body);
  if (!parsed.success) return httpError(reply, 400, parsed.error.issues.map((i) => i.message).join("; "));

  const mission = await findMissionOrThrow(id, reply);
  if (!mission) return;
  if (!expectStatus(mission, MissionStatus.proposed, reply)) return;

  const { difficulty, impact, confidence, rewardAmount, rationale } = parsed.data;
  const updated = await prisma.mission.update({
    where: { id },
    data: {
      status: MissionStatus.evaluated,
      aiDifficulty: Math.round(difficulty),
      aiImpact: Math.round(impact),
      aiConfidence: confidence,
      aiRationale: rationale,
      rewardAmount: BigInt(rewardAmount),
    },
  });

  return { mission: serializeMission(updated) };
});

app.post("/missions/:id/auto-evaluate", async (request, reply) => {
  const { id } = request.params as { id: string };
  const mission = await findMissionOrThrow(id, reply);
  if (!mission) return;
  if (!expectStatus(mission, MissionStatus.proposed, reply)) return;

  try {
    const evaluation = await evaluateMission({
      title: mission.title,
      description: mission.description,
      category: mission.category,
      location: mission.location ?? undefined,
      proposer: mission.proposer,
    });

    const rewardWei =
      typeof evaluation.reward === "string"
        ? BigInt(evaluation.reward)
        : BigInt(Math.floor(evaluation.reward));

    const updated = await prisma.mission.update({
      where: { id },
      data: {
        status: MissionStatus.evaluated,
        aiDifficulty: Math.round(evaluation.difficulty),
        aiImpact: Math.round(evaluation.impact),
        aiConfidence: evaluation.confidence,
        aiRationale: evaluation.rationale,
        rewardAmount: rewardWei,
      },
    });

    return {
      mission: serializeMission(updated),
      evaluation: {
        ...evaluation,
        reward: rewardWei.toString(),
        rewardFormatted: formatReward(rewardWei),
      },
    };
  } catch (error) {
    app.log.error(error, "Auto-evaluation failed");
    return httpError(reply, 502, `AI evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

// ─── Routes: Activation ─────────────────────────────────────

app.post("/missions/:id/activate", async (request, reply) => {
  const { id } = request.params as { id: string };
  const mission = await findMissionOrThrow(id, reply);
  if (!mission) return;
  if (!expectStatus(mission, MissionStatus.evaluated, reply)) return;

  const updated = await prisma.mission.update({
    where: { id },
    data: { status: MissionStatus.active },
  });

  return { mission: serializeMission(updated) };
});

// ─── Routes: Claiming ───────────────────────────────────────

app.post("/missions/:id/claim", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as { claimer?: string };
  const claimer = body?.claimer;

  if (!claimer || !/^0x[a-fA-F0-9]{40}$/.test(claimer)) {
    return httpError(reply, 400, "Valid claimer address required");
  }

  const mission = await findMissionOrThrow(id, reply);
  if (!mission) return;
  if (!expectStatus(mission, MissionStatus.active, reply)) return;

  if (mission.claimedBy) {
    return httpError(reply, 409, "Mission already claimed by another user");
  }

  // Check: user can only claim one mission at a time
  const existingClaim = await prisma.mission.findFirst({
    where: {
      claimedBy: claimer,
      status: { in: [MissionStatus.active, MissionStatus.proof_submitted] },
    } as any,
  });

  if (existingClaim) {
    return httpError(reply, 409, `You already have an active claim on mission "${existingClaim.title}". Complete or unclaim it first.`);
  }

  const updated = await prisma.mission.update({
    where: { id },
    data: {
      claimedBy: claimer,
      claimedAt: new Date(),
    } as any,
  });

  return { mission: serializeMission(updated) };
});

app.post("/missions/:id/unclaim", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as { claimer?: string };
  const claimer = body?.claimer;

  if (!claimer || !/^0x[a-fA-F0-9]{40}$/.test(claimer)) {
    return httpError(reply, 400, "Valid claimer address required");
  }

  const mission = await findMissionOrThrow(id, reply);
  if (!mission) return;

  if (mission.claimedBy?.toLowerCase() !== claimer.toLowerCase()) {
    return httpError(reply, 403, "You did not claim this mission");
  }

  // Can only unclaim if no proof submitted yet
  if (mission.status === MissionStatus.proof_submitted) {
    return httpError(reply, 409, "Cannot unclaim after proof submission");
  }

  const updated = await prisma.mission.update({
    where: { id },
    data: {
      claimedBy: null,
      claimedAt: null,
    } as any,
  });

  return { mission: serializeMission(updated) };
});

// ─── Routes: My Missions ────────────────────────────────────

app.get("/my-missions/:address", async (request, reply) => {
  const { address } = request.params as { address: string };
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return httpError(reply, 400, "Invalid Ethereum address");
  }

  // Missions I proposed
  const proposed = await prisma.mission.findMany({
    where: { proposer: { equals: address, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Missions I claimed (active work)
  const claimed = await prisma.mission.findMany({
    where: { claimedBy: { equals: address, mode: "insensitive" } } as any,
    orderBy: { claimedAt: "desc" } as any,
    take: 50,
  });

  return {
    proposed: proposed.map(serializeMission),
    claimed: claimed.map(serializeMission),
    proposedCount: proposed.length,
    claimedCount: claimed.length,
  };
});

// ─── Routes: User Profile ───────────────────────────────────

app.get("/profile/:address", async (request, reply) => {
  const { address } = request.params as { address: string };
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return httpError(reply, 400, "Invalid Ethereum address");
  }

  const addrLower = address.toLowerCase();

  try {
    // Get or create profile
    let profile: Record<string, unknown>;
    try {
      const found = await (prisma as any).userProfile.findUnique({ where: { address: addrLower } });
      profile = found ?? { address: addrLower, displayName: null, bio: null, avatarUrl: null };
    } catch (profileErr) {
      app.log.warn(profileErr, "UserProfile table not available — returning default profile");
      profile = { address: addrLower, displayName: null, bio: null, avatarUrl: null };
    }

    // Compute stats from missions
    const missionsCompleted = await prisma.mission.count({
      where: { claimedBy: { equals: addrLower, mode: "insensitive" }, status: MissionStatus.rewarded } as any,
    });

    const missionsProposed = await prisma.mission.count({
      where: { proposer: { equals: addrLower, mode: "insensitive" } },
    });

    const missionsClaimed = await prisma.mission.count({
      where: { claimedBy: { equals: addrLower, mode: "insensitive" } } as any,
    });

    const missionsVerified = await prisma.mission.count({
      where: {
        claimedBy: { equals: addrLower, mode: "insensitive" },
        status: { in: [MissionStatus.verified, MissionStatus.rewarded] },
      } as any,
    });

    const totalBoostWei = 0n;
    const rank = computeRank({ missionsCompleted, totalBoostWei });

    return {
      profile,
      stats: {
        missionsCompleted,
        missionsProposed,
        missionsClaimed,
        missionsVerified,
        totalBoostWei: totalBoostWei.toString(),
      },
      rank,
    };
  } catch (error) {
    app.log.error(error, "Profile GET failed");
    return httpError(reply, 500, error instanceof Error ? error.message : "Failed to load profile");
  }
});

app.put("/profile/:address", async (request, reply) => {
  const { address } = request.params as { address: string };
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return httpError(reply, 400, "Invalid Ethereum address");
  }

  const body = request.body as { displayName?: string; bio?: string; avatarUrl?: string };
  const addrLower = address.toLowerCase();

  try {
    const profile = await (prisma as any).userProfile.upsert({
      where: { address: addrLower },
      create: {
        address: addrLower,
        displayName: body.displayName?.slice(0, 50) ?? null,
        bio: body.bio?.slice(0, 500) ?? null,
        avatarUrl: body.avatarUrl?.slice(0, 256) ?? null,
      },
      update: {
        ...(body.displayName !== undefined ? { displayName: body.displayName.slice(0, 50) || null } : {}),
        ...(body.bio !== undefined ? { bio: body.bio.slice(0, 500) || null } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl.slice(0, 256) || null } : {}),
      },
    });

    return { profile };
  } catch (error) {
    app.log.error(error, "Profile PUT failed");
    return httpError(reply, 500, error instanceof Error ? error.message : "Failed to update profile");
  }
});

// ─── Routes: Rank System ────────────────────────────────────

app.get("/ranks", async () => {
  return { ranks: getAllRanks() };
});

app.get("/rank/:address", async (request, reply) => {
  const { address } = request.params as { address: string };
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return httpError(reply, 400, "Invalid Ethereum address");
  }

  const addrLower = address.toLowerCase();

  const missionsCompleted = await prisma.mission.count({
    where: { claimedBy: { equals: addrLower, mode: "insensitive" }, status: MissionStatus.rewarded } as any,
  });

  const totalBoostWei = 0n; // Simplified until boost ledger

  const rank = computeRank({ missionsCompleted, totalBoostWei });

  return { address: addrLower, rank, stats: { missionsCompleted, totalBoostWei: totalBoostWei.toString() } };
});

// ─── Routes: Boost Reward ───────────────────────────────────

app.post("/missions/:id/boost", async (request, reply) => {
  const { id } = request.params as { id: string };
  const parsed = BoostRequestSchema.safeParse(request.body);
  if (!parsed.success) return httpError(reply, 400, parsed.error.issues.map((i) => i.message).join("; "));

  const mission = await findMissionOrThrow(id, reply);
  if (!mission) return;

  // Can boost missions that are evaluated, active, or proof_submitted
  const boostableStatuses: MissionStatus[] = [MissionStatus.evaluated, MissionStatus.active, MissionStatus.proof_submitted];
  if (!boostableStatuses.includes(mission.status)) {
    return httpError(reply, 409, `Cannot boost mission in "${mission.status}" status`);
  }

  const boostAmount = BigInt(parsed.data.amount);
  const currentReward = mission.rewardAmount ?? 0n;
  const newReward = currentReward + boostAmount;

  let verifiedTxHash: string | null = parsed.data.txHash ?? null;

  // Verify on-chain transfer if txHash provided and on-chain is enabled
  if (verifiedTxHash && isOnChainEnabled()) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: verifiedTxHash as `0x${string}` });
      if (receipt.status !== "success") {
        return httpError(reply, 400, "On-chain transfer transaction failed");
      }
      app.log.info({ txHash: verifiedTxHash, booster: parsed.data.booster, amount: boostAmount.toString() }, "Boost transfer verified on-chain");
    } catch (err) {
      app.log.warn(err, "Could not verify boost tx on-chain — accepting anyway");
    }
  } else if (!verifiedTxHash && !isOnChainEnabled()) {
    // Test mode: generate a clearly prefixed mock tx hash for UI continuity
    verifiedTxHash = "0xMOCK" + Array.from({ length: 58 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    app.log.info({ txHash: verifiedTxHash, booster: parsed.data.booster }, "Test mode: mock boost (no on-chain tx)");
  }

  const updated = await prisma.mission.update({
    where: { id },
    data: { rewardAmount: newReward },
  });

  return {
    mission: serializeMission(updated),
    boosted: {
      booster: parsed.data.booster,
      amount: boostAmount.toString(),
      amountFormatted: formatReward(boostAmount),
      newTotal: newReward.toString(),
      newTotalFormatted: formatReward(newReward),
      txHash: verifiedTxHash,
    },
  };
});

// ─── Routes: Proof ──────────────────────────────────────────

app.post("/missions/:id/submit-proof", async (request, reply) => {
  const { id } = request.params as { id: string };
  const parsed = ProofSubmissionRequestSchema.safeParse(request.body);
  if (!parsed.success) return httpError(reply, 400, parsed.error.issues.map((i) => i.message).join("; "));

  const mission = await findMissionOrThrow(id, reply);
  if (!mission) return;

  // Allow proof for active missions (if claimed) and rejected missions (retry)
  if (!expectStatus(mission, [MissionStatus.active, MissionStatus.rejected], reply)) return;

  const { submitter, proofUri, note } = parsed.data;

  // Must be the claimer to submit proof (if someone else claimed it)
  if (mission.claimedBy && mission.claimedBy.toLowerCase() !== submitter.toLowerCase()) {
    return httpError(reply, 403, "Only the mission claimer can submit proof");
  }

  const proof = await prisma.proof.create({
    data: {
      missionId: id,
      submitter,
      proofUri,
      note: note ?? null,
    },
  });

  // Auto-claim for the submitter if not already claimed
  const claimFields: Record<string, unknown> = {};
  if (!mission.claimedBy) {
    claimFields.claimedBy = submitter;
    claimFields.claimedAt = new Date();
  }

  const updated = await prisma.mission.update({
    where: { id },
    data: {
      status: MissionStatus.proof_submitted,
      proofUri,
      proofNote: note ?? null,
      proofSubmittedBy: submitter,
      ...claimFields,
    } as any,
  });

  return reply.code(201).send({ mission: serializeMission(updated), proof });
});

// ─── Routes: Verification ───────────────────────────────────

app.post("/missions/:id/verify", async (request, reply) => {
  const { id } = request.params as { id: string };
  const parsed = ProofVerificationSchema.safeParse(request.body);
  if (!parsed.success) return httpError(reply, 400, parsed.error.issues.map((i) => i.message).join("; "));

  const mission = await findMissionOrThrow(id, reply);
  if (!mission) return;
  if (!expectStatus(mission, [MissionStatus.proof_submitted, MissionStatus.rejected], reply)) return;

  const { verdict, confidence, evidence } = parsed.data;
  const resolvedStatus =
    verdict === "approved"
      ? MissionStatus.verified
      : verdict === "rejected"
        ? MissionStatus.rejected
        : mission.status;

  await prisma.proof.updateMany({
    where: { missionId: id },
    data: { verdict, confidence, evidence },
  });

  const updated = await prisma.mission.update({
    where: { id },
    data: { status: resolvedStatus },
  });

  return { mission: serializeMission(updated) };
});

app.post("/missions/:id/auto-verify", async (request, reply) => {
  const { id } = request.params as { id: string };
  const mission = await findMissionOrThrow(id, reply);
  if (!mission) return;
  if (!expectStatus(mission, MissionStatus.proof_submitted, reply)) return;
  if (!mission.proofUri) return httpError(reply, 400, "Mission has no proof URI");

  try {
    let verification: { verdict: string; confidence: number; evidence: string[] };
    let aiWasUsed = false;

    // ── Test mission bypass: always verify as confirmed ──
    if (mission.title.toLowerCase() === "test") {
      app.log.info("Test mission detected — auto-approving (always confirms)");
      verification = {
        verdict: "approved",
        confidence: 1.0,
        evidence: ["Test mission: always verified as confirmed", "This is a debug mission for testing the flow"],
      };
    } else if (!isAiAvailable()) {
      // ── AI not available: Return error so the user knows ──
      app.log.warn("AI verification unavailable — OPENROUTER_API_KEY is not set");
      return httpError(
        reply,
        503,
        "AI verification is currently unavailable. Set OPENROUTER_API_KEY in environment to enable AI-powered proof verification.",
      );
    } else {
    // ── Step 1: AI-generated content discriminator ──
    try {
      const proofUrl = mission.proofUri.startsWith("/uploads/")
        ? `http://localhost:${Number(process.env.PORT ?? 4000)}${mission.proofUri}`
        : mission.proofUri;

      app.log.info({ proofUrl }, "Running AI-generated content discriminator…");
      const discriminator = await detectAiGenerated(proofUrl);
      app.log.info({ discriminator }, "Discriminator result");

      if (discriminator.isAiGenerated && discriminator.confidence >= 0.75) {
        app.log.warn({ discriminator }, "Proof flagged as AI-generated — rejecting");
        verification = {
          verdict: "rejected",
          confidence: discriminator.confidence,
          evidence: [
            "⚠️ REJECTED: Proof appears to be AI-generated content",
            ...discriminator.reasons,
            "Please submit genuine real-world evidence (photos, videos, documents)",
          ],
        };
        aiWasUsed = true;

        // Skip the main verifier — go straight to saving result
        const resolvedStatus = MissionStatus.rejected;
        await prisma.proof.updateMany({
          where: { missionId: id },
          data: {
            verdict: verification.verdict,
            confidence: verification.confidence,
            evidence: verification.evidence,
          },
        });
        const updated = await prisma.mission.update({
          where: { id },
          data: { status: resolvedStatus },
        });
        return {
          mission: serializeMission(updated),
          verification,
          aiDiscriminator: discriminator,
          aiWasUsed: true,
          autoDecision: "rejected — AI-generated content detected",
        };
      }
    } catch (discError) {
      app.log.warn(discError, "AI discriminator failed — proceeding to main verification");
    }

    // ── Step 2: Main AI proof verification ──
    const summary = [
      `Mission: ${mission.title}`,
      `Description: ${mission.description}`,
      `Category: ${mission.category}`,
      `Location: ${mission.location ?? "Not specified"}`,
    ].join("\n");

    const proofUrl = mission.proofUri.startsWith("/uploads/")
      ? `http://localhost:${Number(process.env.PORT ?? 4000)}${mission.proofUri}`
      : mission.proofUri;

    verification = await verifyProof({ missionSummary: summary, proofUrl });
    aiWasUsed = true;
    } // end else (non-test mission with AI available)

    const resolvedStatus =
      verification.verdict === "approved"
        ? MissionStatus.verified
        : verification.verdict === "rejected"
          ? MissionStatus.rejected
          : mission.status;

    await prisma.proof.updateMany({
      where: { missionId: id },
      data: {
        verdict: verification.verdict,
        confidence: verification.confidence,
        evidence: verification.evidence,
      },
    });

    const updated = await prisma.mission.update({
      where: { id },
      data: { status: resolvedStatus },
    });

    return {
      mission: serializeMission(updated),
      verification,
      aiWasUsed,
      autoDecision:
        verification.verdict === "approved"
          ? "auto-approved (confidence ≥ " + CONFIDENCE.AUTO_APPROVE + ")"
          : verification.verdict === "rejected"
            ? "auto-rejected"
            : "needs manual review",
    };
  } catch (error) {
    app.log.error(error, "Auto-verification failed");
    return httpError(reply, 502, `AI verification failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
});

// ─── Routes: Reward ─────────────────────────────────────────

app.post("/missions/:id/reward", async (request, reply) => {
  const { id } = request.params as { id: string };
  const parsed = RewardRequestSchema.safeParse(request.body);
  if (!parsed.success) return httpError(reply, 400, parsed.error.issues.map((i) => i.message).join("; "));

  const mission = await findMissionOrThrow(id, reply);
  if (!mission) return;
  if (!expectStatus(mission, MissionStatus.verified, reply)) return;

  let txHash = parsed.data.txHash ?? null;
  const recipient = parsed.data.recipient ?? mission.claimedBy ?? mission.proofSubmittedBy;

  if (!recipient) return httpError(reply, 400, "No reward recipient (no claimer or explicit recipient)");

  let rewardMode: "onchain" | "mock" = "mock";
  let onchainError: string | null = null;

  // On-chain payout when on-chain is enabled
  if (isOnChainEnabled()) {
    if (!mission.rewardAmount) return httpError(reply, 400, "Mission has no reward amount set");

    try {
      txHash = await releaseReward(recipient as `0x${string}`, mission.rewardAmount);
      rewardMode = "onchain";
      app.log.info({ txHash, recipient, amount: mission.rewardAmount.toString() }, "On-chain reward sent");
    } catch (error) {
      onchainError = error instanceof Error ? error.message : "Unknown error";
      app.log.error(error, "On-chain reward failed");
      // Surface the error so the user knows something went wrong
      return httpError(reply, 502, `On-chain reward failed: ${onchainError}. Check that the Treasury contract has sufficient FORGOOD balance and that AGENT_PRIVATE_KEY is the authorized rewarder.`);
    }
  }

  // Mock mode: generate a clearly prefixed mock tx hash for UI continuity
  if (rewardMode === "mock" && !txHash) {
    txHash = "0xMOCK" + Array.from({ length: 58 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    app.log.info({ txHash, recipient }, "Mock reward issued (no on-chain tx — deploy contracts to enable real payouts)");
  }

  const updated = await prisma.mission.update({
    where: { id },
    data: {
      status: MissionStatus.rewarded,
      onchainTxHash: txHash,
    },
  });

  return {
    mission: serializeMission(updated),
    txHash,
    recipient,
    rewardFormatted: formatReward(mission.rewardAmount),
    rewardMode,
    note: rewardMode === "mock"
      ? "⚠️ Mock reward — deploy contracts and set AGENT_PRIVATE_KEY, TREASURY_ADDRESS, FORGOOD_TOKEN_ADDRESS for real on-chain payouts"
      : "✅ Real on-chain reward sent via Treasury contract",
  };
});

// ─── Routes: File Upload ────────────────────────────────────

const ALLOWED_MIMES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "video/mp4", "video/webm", "video/quicktime",
  "application/pdf",
]);

app.post("/upload", async (request, reply) => {
  const file = await request.file();
  if (!file) return httpError(reply, 400, "No file uploaded");

  if (!ALLOWED_MIMES.has(file.mimetype)) {
    return httpError(reply, 400, `Unsupported file type: ${file.mimetype}. Allowed: images, videos, PDFs.`);
  }

  const ext = extname(file.filename) || ".bin";
  const storedName = `${randomUUID()}${ext}`;
  const destPath = join(UPLOADS_DIR, storedName);

  await pipeline(file.file, createWriteStream(destPath));

  if (file.file.truncated) {
    return httpError(reply, 413, "File too large (max 50 MB)");
  }

  const url = `/uploads/${storedName}`;
  app.log.info({ storedName, mime: file.mimetype, originalName: file.filename }, "File uploaded");

  return reply.code(201).send({ url, filename: storedName, originalName: file.filename, mimetype: file.mimetype });
});

// Serve uploaded files
app.get("/uploads/:filename", async (request, reply) => {
  const { filename } = request.params as { filename: string };

  // Sanitize: no path traversal
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return httpError(reply, 400, "Invalid filename");
  }

  const filePath = join(UPLOADS_DIR, filename);

  try {
    await stat(filePath);
  } catch {
    return httpError(reply, 404, "File not found");
  }

  const ext = extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".pdf": "application/pdf",
  };
  const contentType = mimeMap[ext] ?? "application/octet-stream";

  const { createReadStream } = await import("node:fs");
  const stream = createReadStream(filePath);
  return reply.type(contentType).send(stream);
});

// ─── Routes: Seed (Test Mode Only) ──────────────────────────

const DEMO_PROPOSER = "0x000000000000000000000000000000000000dEaD";
const DEMO_CLAIMER  = "0x0000000000000000000000000000000000C1A1ED";

// ─── Seed Data: focused on testable statuses ────────────────
// active   → user can claim, submit proof, and test the full verify flow
// verified → user can test "Claim Reward" button
// rewarded → shows completed missions as examples

interface SeedMission {
  title: string;
  description: string;
  category: string;
  location: string;
  targetStatus: MissionStatus;
  difficulty: number;
  impact: number;
}

const SEED_MISSIONS: SeedMission[] = [
  // ── TEST (1) — always verifies as confirmed for debugging ──
  {
    title: "test",
    description: "always verify as confirmed (this is a test mission for debugging)",
    category: "other",
    location: "Test",
    targetStatus: MissionStatus.active,
    difficulty: 1,
    impact: 1,
  },

  // ── ACTIVE (4) — ready for users to claim & test proof flow ──
  {
    title: "Community Park Cleanup at Riverside",
    description: "Organize a team of 10+ volunteers to clean up Riverside Park. Remove trash, pull invasive weeds, and plant 5 native trees. Document with before/after photos.",
    category: "environment",
    location: "Riverside Park, Downtown",
    targetStatus: MissionStatus.active,
    difficulty: 5,
    impact: 6,
  },
  {
    title: "Open-Source Monad Block Explorer Widget",
    description: "Build and deploy an embeddable block explorer widget that shows real-time Monad transaction data. Must be MIT-licensed, well-documented, and published to npm.",
    category: "open-source",
    location: "Remote",
    targetStatus: MissionStatus.active,
    difficulty: 7,
    impact: 7,
  },
  {
    title: "Free Coding Workshop for Underserved Youth",
    description: "Host a 3-hour coding workshop teaching basic web development to 15+ students from underserved communities. Provide all equipment and materials.",
    category: "education",
    location: "Community Center",
    targetStatus: MissionStatus.active,
    difficulty: 6,
    impact: 8,
  },
  {
    title: "Blood Donation Drive Organization",
    description: "Coordinate with local hospitals to organize a blood donation drive. Target: 50+ donors. Arrange venue, promotion, refreshments, and medical staff.",
    category: "health",
    location: "Local Hospital",
    targetStatus: MissionStatus.active,
    difficulty: 5,
    impact: 9,
  },

  // ── VERIFIED (2) — proof approved, user can test "Claim Reward" ──
  {
    title: "Beach Microplastics Research & Cleanup",
    description: "Conduct a scientific microplastics survey at a local beach, then organize a cleanup event. Publish findings as open data. Minimum 20 volunteers.",
    category: "environment",
    location: "Coastal Beach",
    targetStatus: MissionStatus.verified,
    difficulty: 7,
    impact: 8,
  },
  {
    title: "Senior Citizen Tech Literacy Workshop",
    description: "Teach 20+ senior citizens how to use smartphones, video calls, and basic internet safety over a 2-day workshop. Provide printed guides they can take home.",
    category: "education",
    location: "Senior Center",
    targetStatus: MissionStatus.verified,
    difficulty: 4,
    impact: 7,
  },

  // ── REWARDED (2) — completed examples showing full lifecycle ──
  {
    title: "Solidity Security Audit Tutorial Series",
    description: "Create a 5-part video tutorial series teaching smart contract security auditing. Cover reentrancy, overflow, access control, flash loans, and oracle manipulation.",
    category: "education",
    location: "Remote",
    targetStatus: MissionStatus.rewarded,
    difficulty: 6,
    impact: 8,
  },
  {
    title: "Emergency Shelter Supply Kit Distribution",
    description: "Assemble and distribute 100 emergency supply kits (blankets, first-aid, water, flashlight) to homeless shelters. Partner with local businesses for donations.",
    category: "health",
    location: "Downtown Shelters",
    targetStatus: MissionStatus.rewarded,
    difficulty: 5,
    impact: 9,
  },
];

/** Core seed logic — called by both POST /seed and auto-seed on boot */
async function autoSeedMissions() {
  const created = [];

  for (const seed of SEED_MISSIONS) {
    const reward = computeReward(seed.difficulty, seed.impact);
    const confidence = 0.8 + Math.random() * 0.15;

    const baseData = {
      title: seed.title,
      description: seed.description,
      category: seed.category,
      location: seed.location,
      proposer: DEMO_PROPOSER,
      aiDifficulty: seed.difficulty,
      aiImpact: seed.impact,
      aiConfidence: Math.round(confidence * 100) / 100,
      aiRationale: `AI evaluation: difficulty ${seed.difficulty}/10, impact ${seed.impact}/10. Clear deliverables and verifiable outcomes.`,
      rewardAmount: reward,
    };

    let extra: Record<string, unknown> = {};

    if (seed.targetStatus === MissionStatus.verified) {
      extra = {
        claimedBy: DEMO_CLAIMER,
        claimedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        proofUri: "https://picsum.photos/800/600",
        proofNote: "Mission completed with full documentation.",
        proofSubmittedBy: DEMO_CLAIMER,
      };
    } else if (seed.targetStatus === MissionStatus.rewarded) {
      extra = {
        claimedBy: DEMO_CLAIMER,
        claimedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        proofUri: "https://picsum.photos/800/600",
        proofNote: "All deliverables completed and verified.",
        proofSubmittedBy: DEMO_CLAIMER,
        onchainTxHash: "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""),
      };
    }

    const mission = await prisma.mission.create({
      data: { ...baseData, ...extra, status: seed.targetStatus } as any,
    });

    // Create proof records for verified / rewarded
    if (seed.targetStatus === MissionStatus.verified || seed.targetStatus === MissionStatus.rewarded) {
      await prisma.proof.create({
        data: {
          missionId: mission.id,
          submitter: DEMO_CLAIMER,
          proofUri: (extra.proofUri as string) ?? "https://picsum.photos/800/600",
          note: (extra.proofNote as string) ?? null,
          verdict: "approved",
          confidence: 0.9,
          evidence: ["Photo evidence matches mission requirements", "Deliverables confirmed"],
        } as any,
      });
    }

    created.push(mission);
  }

  return created;
}

app.post("/seed", async (request, reply) => {
  const mode = getForGoodMode();
  if (mode !== "test") {
    return httpError(reply, 403, "Seed endpoint only available in test mode");
  }

  const body = request.body as { reset?: boolean } | undefined;
  const reset = body?.reset ?? false;

  if (reset) {
    await prisma.proof.deleteMany({});
    await prisma.mission.deleteMany({});
  }

  const existingCount = await prisma.mission.count();
  if (existingCount > 0 && !reset) {
    return { message: "Database already has missions. Pass { reset: true } to reset.", count: existingCount };
  }

  const created = await autoSeedMissions();

  return {
    message: `Seeded ${created.length} example missions`,
    missions: created.map(serializeMission),
    summary: {
      active: created.filter((m) => m.status === MissionStatus.active).length,
      verified: created.filter((m) => m.status === MissionStatus.verified).length,
      rewarded: created.filter((m) => m.status === MissionStatus.rewarded).length,
    },
  };
});

// ─── Routes: AI Auto-Post Mission (agent fills gap) ─────────

app.post("/agent/auto-post", async (_request, reply) => {
  // Check how many active unclaimed missions exist
  const activeCount = await prisma.mission.count({
    where: {
      status: MissionStatus.active,
      claimedBy: null,
    } as any,
  });

  const threshold = Number(process.env.AUTO_POST_THRESHOLD ?? 3);
  if (activeCount >= threshold) {
    return {
      posted: false,
      reason: `Enough active unclaimed missions (${activeCount} ≥ ${threshold})`,
      activeCount,
    };
  }

  try {
    const missionIdea = await generateMissionIdea();

    const mission = await prisma.mission.create({
      data: {
        title: missionIdea.title,
        description: missionIdea.description,
        category: missionIdea.category,
        location: missionIdea.location ?? null,
        proposer: "0x0000000000000000000000000000000000000000",
        status: MissionStatus.proposed,
      },
    });

    // Auto-evaluate
    try {
      const evaluation = await evaluateMission({
        title: mission.title,
        description: mission.description,
        category: mission.category,
        location: mission.location ?? undefined,
        proposer: mission.proposer,
      });

      const rewardWei =
        typeof evaluation.reward === "string"
          ? BigInt(evaluation.reward)
          : BigInt(Math.floor(evaluation.reward));

      await prisma.mission.update({
        where: { id: mission.id },
        data: {
          status: MissionStatus.evaluated,
          aiDifficulty: Math.round(evaluation.difficulty),
          aiImpact: Math.round(evaluation.impact),
          aiConfidence: evaluation.confidence,
          aiRationale: evaluation.rationale,
          rewardAmount: rewardWei,
        },
      });

      // Auto-activate
      const activated = await prisma.mission.update({
        where: { id: mission.id },
        data: { status: MissionStatus.active },
      });

      return {
        posted: true,
        mission: serializeMission(activated),
        reason: `Auto-posted: only ${activeCount} unclaimed missions (threshold: ${threshold})`,
      };
    } catch {
      return {
        posted: true,
        mission: serializeMission(mission),
        reason: "Auto-posted but evaluation failed — needs manual evaluation",
      };
    }
  } catch (error) {
    app.log.error(error, "Agent auto-post failed");
    return httpError(reply, 502, `AI mission generation failed: ${error instanceof Error ? error.message : "Unknown"}`);
  }
});

// ─── AI Mission Generation Helper ───────────────────────────

async function generateMissionIdea(): Promise<{
  title: string;
  description: string;
  category: string;
  location?: string;
}> {
  const systemPrompt = `You are FORGOOD — an autonomous agent that creates public-good missions.

Generate a NEW, creative, actionable public-good mission. Requirements:
1. Clearly defined with measurable deliverables
2. Achievable by a single person or small team in 1-14 days
3. Genuinely beneficial to a community or ecosystem
4. Verifiable with photo/video evidence

Categories: ${CATEGORIES.join(", ")}

Return ONLY a JSON object:
{
  "title": "<concise title, 5-15 words>",
  "description": "<detailed description, 50-300 words>",
  "category": "<one of the categories>",
  "location": "<suggested location or Remote or Global>"
}`;

  const result = await callOpenRouterRaw([
    { role: "system", content: systemPrompt },
    { role: "user", content: "Generate a unique public-good mission. Be creative. Return JSON only." },
  ]);

  const start = result.content.indexOf("{");
  const end = result.content.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI did not return valid JSON");

  return JSON.parse(result.content.slice(start, end + 1));
}

// ─── Boot ───────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  const models = getActiveModels();
  app.log.info(`FORGOOD API listening on http://${host}:${port}`);
  app.log.info(`Mode: ${models.mode.toUpperCase()} | text=${models.text} | vision=${models.vision}`);
  app.log.info(`AI features: ${isAiAvailable() ? "ENABLED" : "DISABLED (set OPENROUTER_API_KEY)"}`);
  app.log.info(`On-chain features: ${isOnChainEnabled() ? "ENABLED" : "DISABLED (set AGENT_PRIVATE_KEY, TREASURY_ADDRESS, FORGOOD_TOKEN_ADDRESS)"}`);

  // Auto-seed in test mode when DB is empty
  if (getForGoodMode() === "test") {
    const count = await prisma.mission.count();
    if (count === 0) {
      app.log.info("Test mode: database is empty — auto-seeding example missions…");
      await autoSeedMissions();
      const seeded = await prisma.mission.count();
      app.log.info(`Test mode: seeded ${seeded} example missions ✓`);
    }
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
