"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  getMyMissions,
  submitProof,
  autoVerify,
  unclaimMission,
  rewardMission,
  uploadFile,
  resolveUploadUrl,
  type Mission,
  type MissionStatus,
} from "../../lib/api";

// ─── Status Badge ───────────────────────────────────────────

const STATUS_STYLES: Record<MissionStatus, { bg: string; text: string; label: string }> = {
  proposed: { bg: "bg-gray-100", text: "text-gray-600", label: "Proposed" },
  evaluated: { bg: "bg-blue-50", text: "text-blue-600", label: "Evaluated" },
  active: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Active" },
  proof_submitted: { bg: "bg-amber-50", text: "text-amber-700", label: "Proof Submitted" },
  verified: { bg: "bg-green-50", text: "text-green-700", label: "Verified ✓" },
  rejected: { bg: "bg-red-50", text: "text-red-600", label: "Rejected — Retry" },
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

// ─── Proof Submission Form ──────────────────────────────────

function ProofForm({
  mission,
  address,
  onSubmitted,
}: {
  mission: Mission;
  address: string;
  onSubmitted: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);

    // Generate preview for images
    if (selected && selected.type.startsWith("image/")) {
      const url = URL.createObjectURL(selected);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setVerifyResult(null);

    try {
      // Step 1: Upload file
      setUploadProgress("Uploading file…");
      const uploadResult = await uploadFile(file);
      const proofUri = uploadResult.url;

      // Step 2: Submit proof with the uploaded file URL
      setUploadProgress("Submitting proof…");
      await submitProof(mission.id, {
        submitter: address,
        proofUri,
        note: note || undefined,
      });

      // Step 3: Auto-verify immediately
      setVerifying(true);
      setUploadProgress(null);
      try {
        const verify = await autoVerify(mission.id);
        const verdict = verify.verification?.verdict as string;
        if (verdict === "approved") {
          setVerifyResult("✅ Proof approved! Your reward will be issued shortly.");
        } else if (verdict === "rejected") {
          setVerifyResult("❌ Proof rejected. You can retry with better evidence.");
        } else {
          setVerifyResult("⏳ Proof submitted for review. Please wait for agent evaluation.");
        }
      } catch (verifyErr) {
        const msg = verifyErr instanceof Error ? verifyErr.message : "";
        if (msg.includes("unavailable") || msg.includes("API key") || msg.includes("503")) {
          setVerifyResult("⏳ Proof submitted! AI verification is not configured yet. Set OPENROUTER_API_KEY to enable automatic verification.");
        } else {
          setVerifyResult("⏳ Proof submitted! Auto-verification unavailable. Agent will review manually.");
        }
      }

      setFile(null);
      setPreview(null);
      setNote("");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit proof");
    } finally {
      setLoading(false);
      setVerifying(false);
      setUploadProgress(null);
    }
  }

  const fileLabel = file
    ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`
    : null;

  return (
    <div className="mt-4 rounded-2xl border border-fg-olive/20 bg-white p-5">
      <h4 className="text-sm font-semibold uppercase tracking-wider text-fg-olive">
        {mission.status === "rejected" ? "🔄 Retry — Submit Better Proof" : "📸 Submit Proof of Completion"}
      </h4>
      {mission.status === "rejected" && (
        <p className="mt-1 text-xs text-fg-rust">Your previous proof was rejected. Try again with clearer evidence.</p>
      )}

      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-xs text-black/50">Upload Evidence (image, video, or PDF)</label>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/10 px-4 py-6 transition hover:border-fg-olive/40 hover:bg-fg-olive/5">
            <input
              type="file"
              accept="image/*,video/*,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            {fileLabel ? (
              <span className="text-sm text-fg-olive font-medium">{fileLabel}</span>
            ) : (
              <span className="text-sm text-black/40">📎 Click to select a file — max 50 MB</span>
            )}
          </label>
          {preview && (
            <div className="mt-2 overflow-hidden rounded-lg border border-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Preview" className="max-h-48 w-full object-contain" />
            </div>
          )}
          {file && file.type === "application/pdf" && (
            <p className="mt-1 text-xs text-fg-olive">📄 PDF selected: {file.name}</p>
          )}
          {file && file.type.startsWith("video/") && (
            <p className="mt-1 text-xs text-fg-olive">🎥 Video selected: {file.name}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs text-black/50">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Describe what you did and how the proof shows completion…"
            className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-fg-olive"
          />
        </div>

        {error && <p className="text-sm text-fg-rust">{error}</p>}
        {uploadProgress && <p className="text-sm text-fg-olive animate-pulse">{uploadProgress}</p>}
        {verifyResult && (
          <p className={`text-sm ${verifyResult.startsWith("✅") ? "text-emerald-700" : verifyResult.startsWith("❌") ? "text-fg-rust" : "text-amber-700"}`}>
            {verifyResult}
          </p>
        )}

        <button
          type="submit"
          disabled={!file || loading || verifying}
          className="w-full rounded-full bg-fg-olive px-4 py-2.5 text-sm font-medium uppercase tracking-wider text-white transition hover:bg-fg-olive/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {verifying ? "🤖 AI Verifying…" : loading ? "Uploading & Submitting…" : "Upload Proof & Verify"}
        </button>
      </form>
    </div>
  );
}

// ─── Claimed Mission Card ───────────────────────────────────

function ClaimedMissionCard({
  mission,
  address,
  onRefresh,
}: {
  mission: Mission;
  address: string;
  onRefresh: () => void;
}) {
  const [unclaiming, setUnclaiming] = useState(false);
  const [showProofForm, setShowProofForm] = useState(false);
  const [rewardLoading, setRewardLoading] = useState(false);
  const [rewardResult, setRewardResult] = useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  const canSubmitProof = mission.status === "active" || mission.status === "rejected";
  const isPending = mission.status === "proof_submitted";
  const isVerified = mission.status === "verified";
  const isRewarded = mission.status === "rewarded";

  async function handleUnclaim() {
    setUnclaiming(true);
    try {
      await unclaimMission(mission.id, address);
      onRefresh();
    } catch {
      // ignore
    } finally {
      setUnclaiming(false);
    }
  }

  async function handleClaimReward() {
    setRewardLoading(true);
    setRewardResult(null);
    try {
      const result = await rewardMission(mission.id, { recipient: address });
      const isMock = result.txHash?.startsWith("0xMOCK");
      if (result.rewardMode === "onchain") {
        setRewardResult(`🎉 On-chain reward sent! ${result.rewardFormatted} FORGOOD — Tx: ${result.txHash?.slice(0, 16)}…`);
      } else if (isMock) {
        setRewardResult(`🎉 Demo reward recorded! ${result.rewardFormatted} FORGOOD (simulated — deploy contracts to enable real on-chain payouts)`);
      } else {
        setRewardResult(`🎉 Reward issued! ${result.rewardFormatted} FORGOOD`);
      }
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to claim reward";
      if (msg.includes("502") || msg.includes("On-chain reward failed")) {
        setRewardResult(`❌ On-chain reward failed. Check that contracts are deployed and treasury has funds.`);
      } else {
        setRewardResult(`❌ ${msg}`);
      }
    } finally {
      setRewardLoading(false);
    }
  }

  async function handleVerifyNow() {
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const result = await autoVerify(mission.id);
      const verdict = result.verification?.verdict as string;
      if (verdict === "approved") {
        setVerifyResult("✅ Proof approved! You can now claim your reward.");
      } else if (verdict === "rejected") {
        setVerifyResult("❌ Proof rejected. You can retry with better evidence.");
      } else {
        setVerifyResult("⏳ Needs manual review.");
      }
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("unavailable") || msg.includes("API key") || msg.includes("503")) {
        setVerifyResult("⚠️ AI verification is not configured. Set OPENROUTER_API_KEY in your environment to enable AI-powered verification.");
      } else {
        setVerifyResult(err instanceof Error ? `❌ ${err.message}` : "❌ Verification failed");
      }
    } finally {
      setVerifyLoading(false);
    }
  }

  return (
    <article className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.2em] text-fg-olive">{mission.category}</span>
        <StatusBadge status={mission.status} />
      </div>

      <h3 className="font-display mt-3 text-2xl text-fg-ink">{mission.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-black/70">{mission.description}</p>

      <div className="mt-4 flex items-baseline justify-between border-t border-black/5 pt-3">
        <span className="text-xs text-black/50">Reward</span>
        <span className="text-lg font-semibold text-fg-rust">
          {mission.rewardFormatted && mission.rewardFormatted !== "TBD"
            ? `${mission.rewardFormatted} FORGOOD`
            : "TBD"}
        </span>
      </div>

      {/* Action area based on mission state */}
      {canSubmitProof && !showProofForm && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setShowProofForm(true)}
            className="flex-1 rounded-full bg-fg-olive px-4 py-2.5 text-sm font-medium uppercase tracking-wider text-white transition hover:bg-fg-olive/90"
          >
            {mission.status === "rejected" ? "🔄 Retry Proof" : "📸 Submit Proof"}
          </button>
          {mission.status === "active" && (
            <button
              onClick={handleUnclaim}
              disabled={unclaiming}
              className="rounded-full border border-black/20 px-4 py-2.5 text-xs uppercase tracking-wider text-black/50 transition hover:bg-black/5 disabled:opacity-50"
            >
              {unclaiming ? "…" : "Unclaim"}
            </button>
          )}
        </div>
      )}

      {canSubmitProof && showProofForm && (
        <ProofForm
          mission={mission}
          address={address}
          onSubmitted={() => {
            setShowProofForm(false);
            onRefresh();
          }}
        />
      )}

      {isPending && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-amber-50 p-4 text-center">
            <p className="text-sm font-medium text-amber-700">⏳ Proof submitted — awaiting verification</p>
            <p className="mt-1 text-xs text-amber-600">Click below to trigger AI verification now.</p>
          </div>
          {verifyResult && (
            <p className={`text-center text-sm ${verifyResult.startsWith("✅") ? "text-emerald-700" : verifyResult.startsWith("❌") ? "text-fg-rust" : "text-amber-700"}`}>
              {verifyResult}
            </p>
          )}
          <button
            onClick={handleVerifyNow}
            disabled={verifyLoading}
            className="w-full rounded-full bg-amber-600 px-4 py-2.5 text-sm font-medium uppercase tracking-wider text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifyLoading ? "🤖 Verifying…" : "🤖 Verify Now"}
          </button>
        </div>
      )}

      {isVerified && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-green-50 p-4 text-center">
            <p className="text-sm font-medium text-green-700">✅ Proof verified!</p>
            <p className="mt-1 text-xs text-green-600">
              Your reward of{" "}
              <span className="font-semibold">
                {mission.rewardFormatted && mission.rewardFormatted !== "TBD"
                  ? `${mission.rewardFormatted} FORGOOD`
                  : "FORGOOD tokens"}
              </span>{" "}
              is ready to claim.
            </p>
          </div>
          {rewardResult && (
            <p className={`text-center text-sm ${rewardResult.startsWith("🎉") ? "text-purple-700" : "text-fg-rust"}`}>
              {rewardResult}
            </p>
          )}
          <button
            onClick={handleClaimReward}
            disabled={rewardLoading}
            className="w-full rounded-full bg-purple-600 px-4 py-2.5 text-sm font-medium uppercase tracking-wider text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rewardLoading ? "Claiming…" : "🎁 Claim Reward"}
          </button>
        </div>
      )}

      {isRewarded && (
        <div className="mt-4 rounded-2xl bg-purple-50 p-4 text-center">
          <p className="text-sm font-medium text-purple-700">🎉 Reward issued!</p>
          <p className="mt-1 text-xs text-purple-600">
            {mission.rewardFormatted && mission.rewardFormatted !== "TBD"
              ? `${mission.rewardFormatted} FORGOOD`
              : "FORGOOD tokens"}{" "}
            sent to your wallet.
          </p>
          {mission.onchainTxHash && !mission.onchainTxHash.startsWith("0xMOCK") && (
            <a
              href={`https://testnet.monadvision.com/tx/${mission.onchainTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block text-xs text-fg-sky underline"
            >
              View on-chain transaction →
            </a>
          )}
          {mission.onchainTxHash?.startsWith("0xMOCK") && (
            <p className="mt-1 text-xs text-black/40">
              ⚠️ Demo mode — simulated transaction. Deploy contracts for real on-chain payouts.
            </p>
          )}
        </div>
      )}

      {mission.proofUri && (
        <div className="mt-3 text-xs text-black/40">
          Last proof:{" "}
          <a href={resolveUploadUrl(mission.proofUri) ?? "#"} target="_blank" rel="noopener noreferrer" className="text-fg-sky underline">
            view
          </a>
          {mission.proofNote && <span className="ml-1">— {mission.proofNote}</span>}
        </div>
      )}
    </article>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function MyMissionsPage() {
  const { address, isConnected } = useAccount();
  const [proposed, setProposed] = useState<Mission[]>([]);
  const [claimed, setClaimed] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"claimed" | "proposed">("claimed");

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getMyMissions(address);
      setProposed(data.proposed);
      setClaimed(data.claimed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (address) load();
  }, [address, load]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="flex flex-col gap-8">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-fg-olive">FORGOOD / My Missions</p>
            <h1 className="font-display mt-2 text-4xl text-fg-ink">My Missions</h1>
          </div>
          <ConnectButton />
        </div>

        {!isConnected ? (
          <div className="rounded-3xl border border-black/10 bg-white/60 p-12 text-center shadow-soft">
            <p className="font-display text-2xl text-fg-ink">Connect Your Wallet</p>
            <p className="mt-2 text-sm text-black/60">
              Connect your wallet to view your claimed and proposed missions.
            </p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setTab("claimed")}
                className={`rounded-full px-5 py-2 text-xs uppercase tracking-wider transition ${
                  tab === "claimed"
                    ? "bg-fg-ink text-fg-sand"
                    : "border border-black/10 text-black/60 hover:text-fg-ink"
                }`}
              >
                Claimed ({claimed.length})
              </button>
              <button
                onClick={() => setTab("proposed")}
                className={`rounded-full px-5 py-2 text-xs uppercase tracking-wider transition ${
                  tab === "proposed"
                    ? "bg-fg-ink text-fg-sand"
                    : "border border-black/10 text-black/60 hover:text-fg-ink"
                }`}
              >
                Proposed ({proposed.length})
              </button>
              <button
                onClick={load}
                className="ml-auto rounded-full border border-black/10 px-4 py-2 text-xs uppercase tracking-wider text-black/60 hover:border-black/20"
              >
                ↻ Refresh
              </button>
            </div>

            {/* Content */}
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm uppercase tracking-[0.2em] text-fg-olive">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-fg-olive/30 border-t-fg-olive" />
                Loading…
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-100 bg-red-50/50 p-6">
                <p className="text-sm text-fg-rust">{error}</p>
                <button onClick={load} className="mt-2 text-xs text-fg-sky underline">
                  Try again
                </button>
              </div>
            ) : tab === "claimed" ? (
              claimed.length === 0 ? (
                <div className="rounded-3xl border border-black/10 bg-white/60 p-8 text-center shadow-soft">
                  <p className="text-lg text-fg-ink">No claimed missions yet.</p>
                  <p className="mt-1 text-sm text-black/50">
                    Browse the mission feed and claim one to get started!
                  </p>
                </div>
              ) : (
                <div className="grid gap-6">
                  {claimed.map((m) => (
                    <ClaimedMissionCard key={m.id} mission={m} address={address!} onRefresh={load} />
                  ))}
                </div>
              )
            ) : proposed.length === 0 ? (
              <div className="rounded-3xl border border-black/10 bg-white/60 p-8 text-center shadow-soft">
                <p className="text-lg text-fg-ink">You haven&apos;t proposed any missions yet.</p>
                <p className="mt-1 text-sm text-black/50">Go to the home page to propose a new mission.</p>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {proposed.map((m) => (
                  <article key={m.id} className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-soft">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.2em] text-fg-olive">{m.category}</span>
                      <StatusBadge status={m.status} />
                    </div>
                    <h3 className="font-display mt-3 text-xl text-fg-ink">{m.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-black/70">{m.description}</p>
                    <div className="mt-3 flex items-baseline justify-between border-t border-black/5 pt-2">
                      <span className="text-xs text-black/50">Reward</span>
                      <span className="text-base font-semibold text-fg-rust">
                        {m.rewardFormatted && m.rewardFormatted !== "TBD"
                          ? `${m.rewardFormatted} FORGOOD`
                          : "TBD"}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
