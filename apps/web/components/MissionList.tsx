"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, type Address } from "viem";
import {
  listMissions,
  claimMission,
  boostMission,
  autoVerify,
  rewardMission,
  resolveUploadUrl,
  type Mission,
  type MissionStatus,
} from "../lib/api";

// ─── On-chain constants (env vars injected at build time) ───
const TREASURY_ADDRESS = (process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "") as Address;
const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? "") as Address;

const erc20TransferAbi = [
  {
    type: "function" as const,
    name: "transfer",
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ─── Status Badge Config ────────────────────────────────────

const STATUS_STYLES: Record<MissionStatus, { bg: string; text: string; label: string }> = {
  proposed: { bg: "bg-gray-100", text: "text-gray-600", label: "Proposed" },
  evaluated: { bg: "bg-blue-50", text: "text-blue-600", label: "Evaluated" },
  active: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Active" },
  proof_submitted: { bg: "bg-amber-50", text: "text-amber-700", label: "Proof Submitted" },
  verified: { bg: "bg-green-50", text: "text-green-700", label: "Verified ✓" },
  rejected: { bg: "bg-red-50", text: "text-red-600", label: "Rejected" },
  rewarded: { bg: "bg-purple-50", text: "text-purple-700", label: "Rewarded ✓" },
};

function StatusBadge({ status }: { status: MissionStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.proposed;
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}

// ─── Filter Tabs ────────────────────────────────────────────

const FILTER_TABS: { label: string; value: MissionStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Verified", value: "verified" },
  { label: "Rewarded", value: "rewarded" },
];

// ─── Mission Card ───────────────────────────────────────────

function MissionCard({
  mission,
  address,
  onSelect,
  onClaim,
  claimLoading,
}: {
  mission: Mission;
  address?: string;
  onSelect: (m: Mission) => void;
  onClaim: (id: string) => void;
  claimLoading: string | null;
}) {
  const isActive = mission.status === "active";
  const isClaimed = !!mission.claimedBy;
  const isMyMission = address && mission.claimedBy?.toLowerCase() === address.toLowerCase();

  return (
    <article className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-soft transition hover:-translate-y-1 hover:shadow-lg">
      <div onClick={() => onSelect(mission)} className="cursor-pointer">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.2em] text-fg-olive">{mission.category}</span>
          <StatusBadge status={mission.status} />
        </div>
        <h3 className="font-display mt-4 text-2xl text-fg-ink">{mission.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-black/70">{mission.description}</p>
        <div className="mt-4 flex items-baseline justify-between border-t border-black/5 pt-3">
          <span className="text-xs text-black/50">Reward</span>
          <span className="text-lg font-semibold text-fg-rust">
            {mission.rewardFormatted && mission.rewardFormatted !== "TBD"
              ? `${mission.rewardFormatted} FORGOOD`
              : "TBD"}
          </span>
        </div>
        {mission.aiConfidence != null && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full rounded-full bg-fg-olive transition-all"
                style={{ width: `${Math.round(mission.aiConfidence * 100)}%` }}
              />
            </div>
            <span className="text-xs text-black/40">{Math.round(mission.aiConfidence * 100)}%</span>
          </div>
        )}
      </div>

      {/* Claim button for active unclaimed missions */}
      {isActive && !isClaimed && address && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClaim(mission.id);
          }}
          disabled={claimLoading === mission.id}
          className="mt-4 w-full rounded-full bg-fg-olive px-4 py-2.5 text-sm font-medium uppercase tracking-wider text-white transition hover:bg-fg-olive/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {claimLoading === mission.id ? "Claiming…" : "🎯 Claim This Mission"}
        </button>
      )}

      {isActive && !isClaimed && !address && (
        <p className="mt-4 text-center text-xs text-black/40">Connect wallet to claim</p>
      )}

      {isClaimed && isMyMission && (
        <p className="mt-4 text-center text-xs font-medium text-fg-olive">✓ You claimed this</p>
      )}

      {isClaimed && !isMyMission && (
        <p className="mt-4 text-center text-xs text-black/30">Claimed by {truncAddr(mission.claimedBy!)}</p>
      )}
    </article>
  );
}

// ─── Mission Detail Modal ───────────────────────────────────

function MissionDetail({
  mission,
  address,
  onClose,
  onBoost,
  onRefresh,
}: {
  mission: Mission;
  address?: string;
  onClose: () => void;
  onBoost: (id: string, amount: string, txHash?: string) => void;
  onRefresh: () => void;
}) {
  const [boostInput, setBoostInput] = useState("");
  const [boostLoading, setBoostLoading] = useState(false);
  const [boostStatus, setBoostStatus] = useState<string | null>(null);

  const onChainEnabled = Boolean(TREASURY_ADDRESS && TOKEN_ADDRESS);
  const canBoost = ["evaluated", "active", "proof_submitted"].includes(mission.status) && address;

  const { writeContract, data: txHash, isPending: isSending, error: sendError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // When on-chain tx confirms, call the API boost with the tx hash
  useEffect(() => {
    if (isConfirmed && txHash && boostInput && address) {
      setBoostStatus("Transaction confirmed! Recording boost…");
      // Convert input to wei again for the API call
      try {
        const wei = parseUnits(boostInput, 18);
        onBoost(mission.id, wei.toString(), txHash);
        setBoostInput("");
        setBoostLoading(false);
        setBoostStatus(null);
      } catch {
        setBoostStatus("Failed to record boost after tx");
        setBoostLoading(false);
      }
    }
  }, [isConfirmed, txHash, boostInput, address, mission.id, onBoost]);

  function handleBoost() {
    if (!boostInput || !address) return;
    setBoostLoading(true);
    setBoostStatus(null);

    try {
      const wei = parseUnits(boostInput, 18);

      if (onChainEnabled) {
        // On-chain: send FORGOOD tokens from user wallet → Treasury
        setBoostStatus("Sending FORGOOD tokens to Treasury…");
        writeContract({
          address: TOKEN_ADDRESS,
          abi: erc20TransferAbi,
          functionName: "transfer",
          args: [TREASURY_ADDRESS, wei],
        });
      } else {
        // Off-chain (test mode): just call the API directly
        onBoost(mission.id, wei.toString());
        setBoostInput("");
        setBoostLoading(false);
      }
    } catch {
      setBoostStatus("Invalid amount");
      setBoostLoading(false);
    }
  }

  // Handle send errors
  useEffect(() => {
    if (sendError) {
      const msg = sendError.message.includes("User rejected")
        ? "Transaction rejected by user"
        : sendError.message.slice(0, 100);
      setBoostStatus(`❌ ${msg}`);
      setBoostLoading(false);
    }
  }, [sendError]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-black/10 bg-white p-8 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-sm hover:bg-black/10"
        >
          ✕
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-[0.2em] text-fg-olive">{mission.category}</span>
          <StatusBadge status={mission.status} />
        </div>

        <h2 className="font-display mt-4 text-3xl text-fg-ink">{mission.title}</h2>
        <p className="mt-4 leading-relaxed text-black/70">{mission.description}</p>

        <div className="mt-6 grid gap-4 rounded-2xl bg-fg-sand/80 p-5 sm:grid-cols-2">
          <InfoRow label="Proposer" value={truncAddr(mission.proposer)} />
          <InfoRow label="Category" value={mission.category} />
          <InfoRow label="Location" value={mission.location ?? "Not specified"} />
          <InfoRow
            label="Reward"
            value={
              mission.rewardFormatted && mission.rewardFormatted !== "TBD"
                ? `${mission.rewardFormatted} FORGOOD`
                : "TBD"
            }
            highlight
          />
          {mission.claimedBy && (
            <InfoRow label="Claimed By" value={truncAddr(mission.claimedBy)} />
          )}
        </div>

        {mission.aiRationale && (
          <div className="mt-4 rounded-2xl border border-black/5 p-5">
            <p className="mb-1 text-xs uppercase tracking-wider text-fg-olive">AI Rationale</p>
            <p className="text-sm leading-relaxed text-black/70">{mission.aiRationale}</p>
            <div className="mt-3 flex gap-4 text-xs text-black/50">
              {mission.aiDifficulty != null && <span>Difficulty: {mission.aiDifficulty}/10</span>}
              {mission.aiImpact != null && <span>Impact: {mission.aiImpact}/10</span>}
              {mission.aiConfidence != null && <span>Confidence: {Math.round(mission.aiConfidence * 100)}%</span>}
            </div>
          </div>
        )}

        {mission.proofUri && (
          <div className="mt-4 rounded-2xl border border-black/5 p-5">
            <p className="mb-2 text-xs uppercase tracking-wider text-fg-olive">Proof</p>
            <a
              href={resolveUploadUrl(mission.proofUri) ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-fg-sky underline hover:text-fg-olive"
            >
              View proof →
            </a>
            {mission.proofSubmittedBy && (
              <p className="mt-1 text-xs text-black/50">by {truncAddr(mission.proofSubmittedBy)}</p>
            )}
            {mission.proofNote && <p className="mt-2 text-sm text-black/60">{mission.proofNote}</p>}
          </div>
        )}

        {mission.onchainTxHash && (
          <div className="mt-4 rounded-2xl border border-fg-olive/20 bg-fg-olive/5 p-4">
            <p className="text-xs uppercase tracking-wider text-fg-olive">On-Chain Transaction</p>
            <a
              href={`https://testnet.monadvision.com/tx/${mission.onchainTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block truncate text-sm text-fg-sky underline"
            >
              {mission.onchainTxHash}
            </a>
          </div>
        )}

        {/* Boost Reward Section */}
        {canBoost && (
          <div className="mt-4 rounded-2xl border border-fg-rust/20 bg-fg-rust/5 p-4">
            <p className="text-xs uppercase tracking-wider text-fg-rust">Boost Reward</p>
            <p className="mt-1 text-xs text-black/50">
              {onChainEnabled
                ? "Transfer FORGOOD tokens from your wallet → Treasury to increase the reward."
                : "Add FORGOOD tokens to increase the reward (test mode — no real transfer)."}
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={boostInput}
                onChange={(e) => setBoostInput(e.target.value)}
                placeholder="e.g. 0.5"
                className="flex-1 rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-fg-rust"
              />
              <button
                onClick={handleBoost}
                disabled={boostLoading || isSending || isConfirming || !boostInput}
                className="rounded-xl bg-fg-rust px-4 py-2 text-sm font-medium text-white transition hover:bg-fg-rust/90 disabled:opacity-50"
              >
                {isSending ? "Sign…" : isConfirming ? "Confirming…" : "Boost"}
              </button>
            </div>
            {boostStatus && (
              <p className={`mt-2 text-xs ${boostStatus.startsWith("❌") ? "text-red-600" : "text-fg-olive"}`}>
                {boostStatus}
              </p>
            )}
            {txHash && !isConfirmed && (
              <a
                href={`https://testnet.monadvision.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block truncate text-xs text-fg-sky underline"
              >
                View tx: {txHash.slice(0, 10)}…{txHash.slice(-6)}
              </a>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-black/40">
          Created {new Date(mission.createdAt).toLocaleDateString()} · Updated{" "}
          {new Date(mission.updatedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-fg-olive">{label}</p>
      <p className={`mt-1 text-sm ${highlight ? "font-semibold text-fg-rust" : "text-fg-ink"}`}>{value}</p>
    </div>
  );
}

function truncAddr(addr: string) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── Main Component ─────────────────────────────────────────

export function MissionList() {
  const { address } = useAccount();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MissionStatus | "all">("all");
  const [selected, setSelected] = useState<Mission | null>(null);
  const [claimLoading, setClaimLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const opts = filter === "all" ? { limit: 50 } : { status: filter, limit: 50 };
      const data = await listMissions(opts);
      setMissions(data.missions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load missions");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  // Listen for refresh events
  useEffect(() => {
    const handler = () => load();
    window.addEventListener("forgood:refresh-missions", handler);
    return () => window.removeEventListener("forgood:refresh-missions", handler);
  }, [load]);

  async function handleClaim(missionId: string) {
    if (!address) return;
    setClaimLoading(missionId);
    setActionMsg(null);
    try {
      await claimMission(missionId, address);
      setActionMsg("Mission claimed! Go to My Missions to submit proof.");
      await load();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Failed to claim");
    } finally {
      setClaimLoading(null);
    }
  }

  async function handleBoost(missionId: string, weiAmount: string, txHash?: string) {
    if (!address) return;
    setActionMsg(null);
    try {
      const res = await boostMission(missionId, address, weiAmount, txHash);
      const txInfo = res.boosted.txHash ? ` (tx: ${res.boosted.txHash.slice(0, 10)}…)` : "";
      setActionMsg(`Boosted! New reward: ${res.boosted.newTotalFormatted} FORGOOD${txInfo}`);
      await load();
      setSelected(null);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Failed to boost");
    }
  }

  return (
    <>
      {/* Action Message */}
      {actionMsg && (
        <div className="rounded-2xl border border-fg-olive/20 bg-fg-olive/5 p-3 text-sm text-fg-olive">
          {actionMsg}
          <button onClick={() => setActionMsg(null)} className="ml-2 text-xs underline">
            dismiss
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`rounded-full px-4 py-1.5 text-xs uppercase tracking-wider transition ${
              filter === tab.value
                ? "bg-fg-ink text-fg-sand"
                : "border border-black/10 text-black/60 hover:border-black/20 hover:text-fg-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={load}
          className="ml-auto rounded-full border border-black/10 px-4 py-1.5 text-xs uppercase tracking-wider text-black/60 hover:border-black/20"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm uppercase tracking-[0.2em] text-fg-olive">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-fg-olive/30 border-t-fg-olive" />
          Loading missions…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50/50 p-6">
          <p className="text-sm text-fg-rust">{error}</p>
          <button onClick={load} className="mt-2 text-xs text-fg-sky underline">
            Try again
          </button>
        </div>
      ) : missions.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white/60 p-8 text-center shadow-soft">
          <p className="text-lg text-fg-ink">
            {filter === "all" ? "No missions yet." : `No ${filter.replace("_", " ")} missions.`}
          </p>
          <p className="mt-1 text-sm text-black/50">Be the first to propose a public good.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {missions.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              address={address}
              onSelect={setSelected}
              onClaim={handleClaim}
              claimLoading={claimLoading}
            />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <MissionDetail
          mission={selected}
          address={address}
          onClose={() => setSelected(null)}
          onBoost={handleBoost}
          onRefresh={load}
        />
      )}
    </>
  );
}
