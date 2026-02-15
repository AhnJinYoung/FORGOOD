import { z } from "zod";

// ─── Constants ───────────────────────────────────────────────
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_MAINNET_CHAIN_ID = 143;
export const MONAD_TESTNET_RPC = "https://testnet-rpc.monad.xyz";
export const MONAD_MAINNET_RPC = "https://rpc.monad.xyz";
export const MONAD_EXPLORER_TESTNET = "https://testnet.monadvision.com";

/** Confidence thresholds for AI verification auto-decisions */
export const CONFIDENCE = {
  AUTO_APPROVE: 0.7,
  MANUAL_REVIEW: 0.5,
  AUTO_REJECT: 0.5, // below this → auto-reject
} as const;

/** Reward formula constraints (in wei) */
export const REWARD = {
  MIN_WEI: BigInt("10000000000000000"),      // 0.01 FORGOOD
  MAX_WEI: BigInt("10000000000000000000"),    // 10 FORGOOD
  BASE_MULTIPLIER: BigInt("10000000000000000"), // 1e16
  DECIMALS: 18,
} as const;

/** Mission categories recognised by the AI evaluator */
export const CATEGORIES = [
  "environment",
  "education",
  "community",
  "open-source",
  "health",
  "infrastructure",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

// ─── Zod Schemas ─────────────────────────────────────────────

export const MissionStatus = z.enum([
  "proposed",
  "evaluated",
  "active",
  "proof_submitted",
  "verified",
  "rejected",
  "rewarded",
]);
export type MissionStatus = z.infer<typeof MissionStatus>;

const ethAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");

export const MissionProposalSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(4000),
  category: z.string().min(2).max(64),
  location: z.string().min(2).max(128).optional(),
  proposer: ethAddress,
});
export type MissionProposal = z.infer<typeof MissionProposalSchema>;

export const MissionEvaluationSchema = z.object({
  difficulty: z.number().min(1).max(10),
  impact: z.number().min(1).max(10),
  confidence: z.number().min(0).max(1),
  reward: z.union([z.number().min(1), z.string().regex(/^\d+$/)]),
  rationale: z.string().min(10).max(2000),
});
export type MissionEvaluation = z.infer<typeof MissionEvaluationSchema>;

export const ProofSubmissionSchema = z.object({
  missionId: z.string().uuid(),
  submitter: ethAddress,
  proofUri: z.string().refine(
    (v) => v.startsWith("/uploads/") || /^https?:\/\//i.test(v),
    { message: "Must be a URL or an /uploads/ path" },
  ),
  note: z.string().max(2000).optional(),
});
export type ProofSubmission = z.infer<typeof ProofSubmissionSchema>;

export const ProofVerificationSchema = z.object({
  verdict: z.enum(["approved", "rejected", "needs_review"]),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().max(300)).min(1),
});
export type ProofVerification = z.infer<typeof ProofVerificationSchema>;

export const MissionResponseSchema = z.object({
  id: z.string().uuid(),
  status: MissionStatus,
  title: z.string(),
  description: z.string(),
  category: z.string(),
  location: z.string().nullable(),
  proposer: z.string(),
  rewardAmount: z.union([z.number(), z.string()]).nullable(),
  proofUri: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MissionResponse = z.infer<typeof MissionResponseSchema>;

// ─── Utility Helpers ─────────────────────────────────────────

/** Convert wei string to human-readable FORGOOD amount (e.g. "500000000000000000" → "0.5") */
export function formatReward(weiStr: string | bigint | null | undefined): string {
  if (weiStr == null) return "TBD";
  const wei = typeof weiStr === "bigint" ? weiStr : BigInt(weiStr);
  const whole = wei / BigInt(10 ** REWARD.DECIMALS);
  const remainder = wei % BigInt(10 ** REWARD.DECIMALS);
  if (remainder === 0n) return `${whole}`;
  const decimals = remainder.toString().padStart(REWARD.DECIMALS, "0").replace(/0+$/, "");
  return `${whole}.${decimals}`;
}

/** Compute reward from difficulty × impact. Returns bigint in wei. */
export function computeReward(difficulty: number, impact: number): bigint {
  const raw = BigInt(Math.round(difficulty * impact)) * REWARD.BASE_MULTIPLIER;
  if (raw < REWARD.MIN_WEI) return REWARD.MIN_WEI;
  if (raw > REWARD.MAX_WEI) return REWARD.MAX_WEI;
  return raw;
}

/** Determine auto-action from AI verification result */
export function resolveVerdict(verdict: string, confidence: number): "approved" | "rejected" | "needs_review" {
  if (verdict === "approved" && confidence >= CONFIDENCE.AUTO_APPROVE) return "approved";
  if (verdict === "rejected" || confidence < CONFIDENCE.AUTO_REJECT) return "rejected";
  return "needs_review";
}

/** Safely serialize bigints for JSON responses */
export function serializeBigInts<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = typeof value === "bigint" ? value.toString() : value;
  }
  return result;
}

// ─── Rank System ─────────────────────────────────────────────
//
// 10-tier system (R10 lowest → R1 highest), three progression paths:
//   • Direct Action  — missions completed
//   • Financial Support — total boost amount (in wei)
//   • Balance — combination of both
//
// Population ratios:
//   R9-R10 (67.38%) → newcomers
//   R6-R8  (30%)    → active contributors
//   R3-R5  (2.6%)   → serious contributors
//   R1-R2  (0.011%) → legendary

export type RankPath = "direct_action" | "financial_support" | "balance";

export interface RankTier {
  rank: number;       // 1–10 (1 = highest)
  title: string;
  path: RankPath;
  color: string;      // CSS color
  emoji: string;
}

const RANK_TITLES: Record<number, { title: string; emoji: string; color: string }> = {
  1:  { title: "The Ethos",      emoji: "🌟", color: "#FFD700" },
  2:  { title: "Guardian",       emoji: "🛡️", color: "#C0C0C0" },
  3:  { title: "Luminary",       emoji: "✨", color: "#B87333" },
  4:  { title: "Catalyst",       emoji: "⚡", color: "#7B68EE" },
  5:  { title: "Pathfinder",     emoji: "🧭", color: "#20B2AA" },
  6:  { title: "Advocate",       emoji: "📣", color: "#3CB371" },
  7:  { title: "Contributor",    emoji: "🤝", color: "#4682B4" },
  8:  { title: "Supporter",      emoji: "💪", color: "#6B8E23" },
  9:  { title: "Newcomer",       emoji: "🌱", color: "#808080" },
  10: { title: "Pilgrim",        emoji: "👋", color: "#A0A0A0" },
};

// Thresholds: { missionsCompleted, boostWeiTotal } for each rank
// These are designed so population distribution roughly matches the target ratios
interface RankThreshold {
  missions: number;    // missions completed (rewarded status)
  boostWei: bigint;    // total wei boosted
}

const ACTION_THRESHOLDS: Record<number, RankThreshold> = {
  10: { missions: 0,   boostWei: 0n },
  9:  { missions: 1,   boostWei: 0n },
  8:  { missions: 3,   boostWei: 0n },
  7:  { missions: 6,   boostWei: 0n },
  6:  { missions: 10,  boostWei: 0n },
  5:  { missions: 20,  boostWei: 0n },
  4:  { missions: 35,  boostWei: 0n },
  3:  { missions: 50,  boostWei: 0n },
  2:  { missions: 100, boostWei: 0n },
  1:  { missions: 200, boostWei: 0n },
};

const FINANCIAL_THRESHOLDS: Record<number, RankThreshold> = {
  10: { missions: 0, boostWei: 0n },
  9:  { missions: 0, boostWei: BigInt("100000000000000000") },     // 0.1 FORGOOD
  8:  { missions: 0, boostWei: BigInt("500000000000000000") },     // 0.5
  7:  { missions: 0, boostWei: BigInt("2000000000000000000") },    // 2
  6:  { missions: 0, boostWei: BigInt("5000000000000000000") },    // 5
  5:  { missions: 0, boostWei: BigInt("15000000000000000000") },   // 15
  4:  { missions: 0, boostWei: BigInt("50000000000000000000") },   // 50
  3:  { missions: 0, boostWei: BigInt("150000000000000000000") },  // 150
  2:  { missions: 0, boostWei: BigInt("500000000000000000000") },  // 500
  1:  { missions: 0, boostWei: BigInt("1000000000000000000000") }, // 1000
};

/** Compute rank for a user based on their stats */
export function computeRank(stats: {
  missionsCompleted: number;
  totalBoostWei: bigint;
}): RankTier {
  const { missionsCompleted, totalBoostWei } = stats;

  // Compute best rank from each path
  let actionRank = 10;
  for (let r = 1; r <= 10; r++) {
    if (missionsCompleted >= ACTION_THRESHOLDS[r].missions) {
      actionRank = r;
      break;
    }
  }

  let financialRank = 10;
  for (let r = 1; r <= 10; r++) {
    if (totalBoostWei >= FINANCIAL_THRESHOLDS[r].boostWei) {
      financialRank = r;
      break;
    }
  }

  // Balance path: average of the two, rounded up (worse)
  const balanceRank = Math.ceil((actionRank + financialRank) / 2);

  // Best (lowest number) among the three paths
  const bestRank = Math.min(actionRank, financialRank, balanceRank);
  const bestPath: RankPath =
    bestRank === actionRank ? "direct_action" :
    bestRank === financialRank ? "financial_support" : "balance";

  const tier = RANK_TITLES[bestRank];
  return {
    rank: bestRank,
    title: tier.title,
    path: bestPath,
    color: tier.color,
    emoji: tier.emoji,
  };
}

/** Get rank title info for display */
export function getRankInfo(rank: number) {
  return RANK_TITLES[Math.max(1, Math.min(10, rank))] ?? RANK_TITLES[10];
}

/** Get all rank tiers for display */
export function getAllRanks() {
  return Object.entries(RANK_TITLES)
    .map(([r, info]) => ({ rank: Number(r), ...info }))
    .sort((a, b) => a.rank - b.rank);
}
