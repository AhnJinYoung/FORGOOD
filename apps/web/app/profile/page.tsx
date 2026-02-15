"use client";

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  getProfile,
  updateProfile,
  getAllRanks as fetchAllRanks,
  getMyMissions,
  type UserProfile,
  type RankTier,
  type ProfileStats,
  type Mission,
} from "../../lib/api";

// ─── Rank Badge ─────────────────────────────────────────────

function RankBadge({ rank, size = "md" }: { rank: RankTier; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "h-8 w-8 text-sm",
    md: "h-14 w-14 text-2xl",
    lg: "h-20 w-20 text-4xl",
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex items-center justify-center rounded-full ${sizeClasses[size]}`}
        style={{ backgroundColor: rank.color + "20", border: `2px solid ${rank.color}` }}
      >
        {rank.emoji}
      </div>
      <div className="text-center">
        <p className="font-display text-sm font-semibold" style={{ color: rank.color }}>
          R{rank.rank} — {rank.title}
        </p>
        <p className="text-xs capitalize text-black/40">
          {rank.path.replace("_", " ")} path
        </p>
      </div>
    </div>
  );
}

// ─── Stats Grid ─────────────────────────────────────────────

function StatsGrid({ stats }: { stats: ProfileStats }) {
  const items = [
    { label: "Missions Completed", value: stats.missionsCompleted, color: "text-purple-700" },
    { label: "Missions Proposed", value: stats.missionsProposed, color: "text-fg-olive" },
    { label: "Missions Claimed", value: stats.missionsClaimed, color: "text-fg-sky" },
    { label: "Verified Proofs", value: stats.missionsVerified, color: "text-emerald-700" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-black/5 bg-white/60 p-4 text-center">
          <p className={`font-display text-2xl ${item.color}`}>{item.value}</p>
          <p className="mt-1 text-xs text-black/40">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Profile Editor ─────────────────────────────────────────

function ProfileEditor({
  profile,
  onSaved,
}: {
  profile: UserProfile;
  onSaved: (p: UserProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.displayName ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const { profile: updated } = await updateProfile(profile.address, {
        displayName: name || undefined,
        bio: bio || undefined,
      });
      onSaved(updated);
      setEditing(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-fg-ink">
            {profile.displayName || shortenAddress(profile.address)}
          </h2>
          <button
            onClick={() => setEditing(true)}
            className="rounded-full border border-black/10 px-3 py-1 text-xs uppercase tracking-wider text-black/50 hover:border-black/20 hover:text-fg-ink"
          >
            Edit
          </button>
        </div>
        {profile.bio && <p className="text-sm text-black/60">{profile.bio}</p>}
        <p className="font-mono text-xs text-black/30">{profile.address}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-fg-olive">Display Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          placeholder="Anonymous Hero"
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-fg-olive"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-fg-olive">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="What drives your social impact?"
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-fg-olive"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-fg-ink px-5 py-2 text-xs uppercase tracking-wider text-fg-sand transition hover:bg-fg-ink/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="rounded-full border border-black/10 px-5 py-2 text-xs uppercase tracking-wider text-black/50 hover:bg-black/5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Rank Ladder ────────────────────────────────────────────

function RankLadder({ currentRank }: { currentRank: number }) {
  const [allRanks, setAllRanks] = useState<Array<{ rank: number; title: string; emoji: string; color: string }>>([]);

  useEffect(() => {
    fetchAllRanks().then((d) => setAllRanks(d.ranks)).catch(() => {});
  }, []);

  if (allRanks.length === 0) return null;

  return (
    <div className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-soft">
      <h3 className="font-display text-lg text-fg-ink">Rank Ladder</h3>
      <p className="mb-4 text-xs text-black/40">Complete missions and boost others to climb the ranks.</p>
      <div className="space-y-1.5">
        {allRanks.map((r) => {
          const isCurrent = r.rank === currentRank;
          const isAbove = r.rank < currentRank;
          return (
            <div
              key={r.rank}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${
                isCurrent ? "border border-black/10 bg-fg-sand shadow-sm" : isAbove ? "opacity-40" : ""
              }`}
            >
              <span className="text-lg">{r.emoji}</span>
              <span className="flex-1 text-sm font-medium" style={{ color: isCurrent ? r.color : undefined }}>
                R{r.rank} — {r.title}
              </span>
              {isCurrent && (
                <span className="rounded-full bg-fg-ink px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-sand">
                  You
                </span>
              )}
              {isAbove && (
                <span className="text-xs text-black/30">🔒</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 space-y-1 border-t border-black/5 pt-3 text-xs text-black/30">
        <p><strong>Three Paths:</strong></p>
        <p>🎯 <strong>Direct Action</strong> — Complete missions to rank up</p>
        <p>💰 <strong>Financial Support</strong> — Boost missions with tokens</p>
        <p>⚖️ <strong>Balance</strong> — Combine both paths equally</p>
      </div>
    </div>
  );
}

// ─── Mission History ────────────────────────────────────────

function MissionHistory({ address }: { address: string }) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyMissions(address)
      .then((d) => setMissions([...d.claimed, ...d.proposed]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs uppercase tracking-[0.2em] text-fg-olive">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-fg-olive/30 border-t-fg-olive" />
        Loading history…
      </div>
    );
  }

  if (missions.length === 0) {
    return (
      <div className="rounded-2xl border border-black/5 bg-white/60 p-6 text-center">
        <p className="text-sm text-black/50">No mission history yet. Start by claiming or proposing a mission!</p>
      </div>
    );
  }

  const STATUS_DOT: Record<string, string> = {
    proposed: "bg-gray-400",
    evaluated: "bg-blue-400",
    active: "bg-emerald-400",
    proof_submitted: "bg-amber-400",
    verified: "bg-green-500",
    rejected: "bg-red-400",
    rewarded: "bg-purple-500",
  };

  return (
    <div className="space-y-2">
      {missions.slice(0, 20).map((m) => (
        <div key={m.id} className="flex items-center gap-3 rounded-xl border border-black/5 bg-white/50 px-4 py-3">
          <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[m.status] ?? "bg-gray-300"}`} />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-fg-ink">{m.title}</p>
            <p className="text-xs text-black/40">{m.category} · {m.status.replace("_", " ")}</p>
          </div>
          {m.rewardFormatted && m.rewardFormatted !== "TBD" && (
            <span className="text-sm font-semibold text-fg-rust">{m.rewardFormatted}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Helper ─────────────────────────────────────────────────

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── Main Page ──────────────────────────────────────────────

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [rank, setRank] = useState<RankTier | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const data = await getProfile(address);
      setProfile(data.profile);
      setStats(data.stats);
      setRank(data.rank);
    } catch {
      // Create default
      setProfile({ address: address.toLowerCase(), displayName: null, bio: null, avatarUrl: null });
      setStats({ missionsCompleted: 0, missionsProposed: 0, missionsClaimed: 0, missionsVerified: 0, totalBoostWei: "0" });
      setRank({ rank: 10, title: "Pilgrim", path: "direct_action", color: "#A0A0A0", emoji: "👋" });
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (address) load();
  }, [address, load]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-fg-olive">FORGOOD / Profile</p>
            <h1 className="font-display mt-2 text-4xl text-fg-ink">Your Profile</h1>
          </div>
          <ConnectButton />
        </div>

        {!isConnected ? (
          <div className="rounded-3xl border border-black/10 bg-white/60 p-12 text-center shadow-soft">
            <p className="font-display text-2xl text-fg-ink">Connect Your Wallet</p>
            <p className="mt-2 text-sm text-black/60">
              Connect your wallet to view your profile, rank, and mission history.
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 py-12 text-sm uppercase tracking-[0.2em] text-fg-olive">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-fg-olive/30 border-t-fg-olive" />
            Loading profile…
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            {/* Left column */}
            <div className="space-y-6">
              {/* Profile card */}
              <div className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-soft">
                <div className="flex items-start gap-5">
                  {rank && <RankBadge rank={rank} size="lg" />}
                  <div className="flex-1">
                    {profile && (
                      <ProfileEditor
                        profile={profile}
                        onSaved={(p) => setProfile(p)}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              {stats && <StatsGrid stats={stats} />}

              {/* Mission History */}
              <div className="space-y-3">
                <h3 className="font-display text-lg text-fg-ink">Mission History</h3>
                <MissionHistory address={address!} />
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {rank && <RankLadder currentRank={rank.rank} />}

              {/* How Ranks Work */}
              <div className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-soft">
                <h3 className="font-display text-lg text-fg-ink">How Ranks Work</h3>
                <div className="mt-3 space-y-3 text-xs text-black/60">
                  <div className="rounded-xl bg-fg-sand/50 p-3">
                    <p className="font-medium text-fg-ink">🏔️ R1-R2 — Legendary (0.01%)</p>
                    <p>200+ missions or 1000+ FORGOOD boosted. The true champions of social good.</p>
                  </div>
                  <div className="rounded-xl bg-fg-sand/50 p-3">
                    <p className="font-medium text-fg-ink">⭐ R3-R5 — Expert (2.6%)</p>
                    <p>20-50+ missions or significant financial support. Dedicated contributors.</p>
                  </div>
                  <div className="rounded-xl bg-fg-sand/50 p-3">
                    <p className="font-medium text-fg-ink">🌿 R6-R8 — Active (30%)</p>
                    <p>3-10+ missions completed. Building a track record of impact.</p>
                  </div>
                  <div className="rounded-xl bg-fg-sand/50 p-3">
                    <p className="font-medium text-fg-ink">🌱 R9-R10 — Starting Out (67.4%)</p>
                    <p>Just getting started. Complete your first mission to begin climbing!</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
