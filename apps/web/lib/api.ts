/** Typed API client for the FORGOOD backend */

// NEXT_PUBLIC_API_URL is baked at build time and available in both browser & SSR.
//   - Production (Vercel): "https://api.forgood.xyz" or "https://ec2-ip.compute.amazonaws.com"
//   - Docker:              set via docker-compose (browser still uses /api proxy)
//   - Local dev:           not set → falls back to "/api" (Next.js rewrites → localhost:4000)
//
// On the server side (SSR / API routes) we also check INTERNAL_API_URL which
// bypasses the public internet (Docker network or localhost).
const API_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL || "/api") // browser: direct CORS call (prod) or proxy (dev)
    : (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");

/**
 * Resolve an upload path (e.g. "/uploads/abc.jpg") to a full URL.
 * In production, uploads live on the EC2 API server, not Vercel.
 * Locally / Docker, /uploads/* is proxied by Next.js rewrites.
 */
export function resolveUploadUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  // Already an absolute URL
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  // Relative /uploads/* path — prefix with API base
  const base = typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL || "") // prod: "https://api.forgood.xyz", dev: "" (proxy)
    : (process.env.INTERNAL_API_URL ?? "");
  return `${base}${path}`;
}

// ─── Types ──────────────────────────────────────────────────

export type MissionStatus =
  | "proposed"
  | "evaluated"
  | "active"
  | "proof_submitted"
  | "verified"
  | "rejected"
  | "rewarded";

export interface Mission {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string | null;
  proposer: string;
  status: MissionStatus;
  rewardAmount: string | null;
  rewardFormatted?: string;
  aiDifficulty: number | null;
  aiImpact: number | null;
  aiConfidence: number | null;
  aiRationale: string | null;
  proofUri: string | null;
  proofNote: string | null;
  proofSubmittedBy: string | null;
  onchainTxHash: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Proof {
  id: string;
  missionId: string;
  submitter: string;
  proofUri: string;
  note: string | null;
  verdict: string | null;
  confidence: number | null;
  evidence: string[] | null;
  createdAt: string;
}

export interface TreasuryInfo {
  balance: string;
  formatted: string;
  onChainEnabled: boolean;
}

export interface HealthInfo {
  ok: boolean;
  mode: string;
  models: { text: string; vision: string };
  onChainEnabled: boolean;
  timestamp: string;
}

export interface MyMissionsResponse {
  proposed: Mission[];
  claimed: Mission[];
  proposedCount: number;
  claimedCount: number;
}

// ─── Fetch Wrapper ──────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed with status ${res.status}`);
  }

  return data as T;
}

// ─── Health ─────────────────────────────────────────────────

export function getHealth() {
  return apiFetch<HealthInfo>("/health");
}

// ─── Treasury ───────────────────────────────────────────────

export function getTreasury() {
  return apiFetch<TreasuryInfo>("/treasury");
}

// ─── Missions ───────────────────────────────────────────────

export function listMissions(opts?: { status?: MissionStatus; limit?: number; excludeClaimed?: boolean }) {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.excludeClaimed) params.set("excludeClaimed", "true");
  const qs = params.toString();
  return apiFetch<{ missions: Mission[]; count: number }>(`/missions${qs ? `?${qs}` : ""}`);
}

export function getMission(id: string) {
  return apiFetch<{ mission: Mission & { proofs?: Proof[] } }>(`/missions/${id}`);
}

export function createMission(body: {
  title: string;
  description: string;
  category: string;
  location?: string;
  proposer: string;
}) {
  return apiFetch<{ mission: Mission }>("/missions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Evaluation ─────────────────────────────────────────────

export function autoEvaluate(missionId: string) {
  return apiFetch<{ mission: Mission; evaluation: Record<string, unknown> }>(
    `/missions/${missionId}/auto-evaluate`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function manualEvaluate(
  missionId: string,
  body: { difficulty: number; impact: number; confidence: number; rewardAmount: string; rationale: string },
) {
  return apiFetch<{ mission: Mission }>(`/missions/${missionId}/evaluate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Activation ─────────────────────────────────────────────

export function activateMission(missionId: string) {
  return apiFetch<{ mission: Mission }>(`/missions/${missionId}/activate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ─── Claiming ───────────────────────────────────────────────

export function claimMission(missionId: string, claimer: string) {
  return apiFetch<{ mission: Mission }>(`/missions/${missionId}/claim`, {
    method: "POST",
    body: JSON.stringify({ claimer }),
  });
}

export function unclaimMission(missionId: string, claimer: string) {
  return apiFetch<{ mission: Mission }>(`/missions/${missionId}/unclaim`, {
    method: "POST",
    body: JSON.stringify({ claimer }),
  });
}

// ─── My Missions ────────────────────────────────────────────

export function getMyMissions(address: string) {
  return apiFetch<MyMissionsResponse>(`/my-missions/${address}`);
}

// ─── Boost ──────────────────────────────────────────────────

export function boostMission(missionId: string, booster: string, amount: string, txHash?: string) {
  return apiFetch<{ mission: Mission; boosted: { amountFormatted: string; newTotalFormatted: string; txHash: string | null } }>(
    `/missions/${missionId}/boost`,
    { method: "POST", body: JSON.stringify({ booster, amount, ...(txHash ? { txHash } : {}) }) },
  );
}

// ─── Proof ──────────────────────────────────────────────────

export interface UploadResult {
  url: string;
  filename: string;
  originalName: string;
  mimetype: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/upload`, {
    method: "POST",
    body: formData,
    // Note: do NOT set Content-Type header — browser sets it with boundary
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Upload failed with status ${res.status}`);
  }

  return data as UploadResult;
}

export function submitProof(
  missionId: string,
  body: { submitter: string; proofUri: string; note?: string },
) {
  return apiFetch<{ mission: Mission; proof: Proof }>(`/missions/${missionId}/submit-proof`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Verification ───────────────────────────────────────────

export function autoVerify(missionId: string) {
  return apiFetch<{ mission: Mission; verification: Record<string, unknown>; autoDecision: string }>(
    `/missions/${missionId}/auto-verify`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function manualVerify(
  missionId: string,
  body: { verdict: "approved" | "rejected" | "needs_review"; confidence: number; evidence: string[] },
) {
  return apiFetch<{ mission: Mission }>(`/missions/${missionId}/verify`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Reward ─────────────────────────────────────────────────

export function rewardMission(missionId: string, body?: { txHash?: string; recipient?: string }) {
  return apiFetch<{ mission: Mission; txHash: string | null; rewardFormatted: string; rewardMode: "onchain" | "mock"; note: string }>(
    `/missions/${missionId}/reward`,
    { method: "POST", body: JSON.stringify(body ?? {}) },
  );
}

// ─── Seed (Test Mode) ───────────────────────────────────────

export function seedMissions(reset = false) {
  return apiFetch<{ message: string; missions?: Mission[]; summary?: Record<string, number> }>(
    "/seed",
    { method: "POST", body: JSON.stringify({ reset }) },
  );
}

// ─── Agent Auto-Post ────────────────────────────────────────

export function agentAutoPost() {
  return apiFetch<{ posted: boolean; reason: string; mission?: Mission }>(
    "/agent/auto-post",
    { method: "POST", body: JSON.stringify({}) },
  );
}

// ─── Profile ────────────────────────────────────────────────

export interface UserProfile {
  address: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
}

export interface RankTier {
  rank: number;
  title: string;
  path: "direct_action" | "financial_support" | "balance";
  color: string;
  emoji: string;
}

export interface ProfileStats {
  missionsCompleted: number;
  missionsProposed: number;
  missionsClaimed: number;
  missionsVerified: number;
  totalBoostWei: string;
}

export interface ProfileResponse {
  profile: UserProfile;
  stats: ProfileStats;
  rank: RankTier;
}

export function getProfile(address: string) {
  return apiFetch<ProfileResponse>(`/profile/${address}`);
}

export function updateProfile(address: string, body: { displayName?: string; bio?: string; avatarUrl?: string }) {
  return apiFetch<{ profile: UserProfile }>(`/profile/${address}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function getRank(address: string) {
  return apiFetch<{ address: string; rank: RankTier; stats: { missionsCompleted: number; totalBoostWei: string } }>(
    `/rank/${address}`,
  );
}

export function getAllRanks() {
  return apiFetch<{ ranks: Array<{ rank: number; title: string; emoji: string; color: string }> }>("/ranks");
}
