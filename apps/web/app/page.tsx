"use client";

import { useRef } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { MissionList } from "../components/MissionList";
import { TreasuryCard } from "../components/TreasuryCard";
import { CreateMissionForm } from "../components/CreateMissionForm";
import { AgentStatus } from "../components/AgentStatus";

export default function HomePage() {
  // We use a key to force MissionList to reload after creating a mission
  const refreshRef = useRef(0);

  function handleMissionCreated() {
    refreshRef.current += 1;
    // The MissionList has its own refresh button — but we can signal via state if needed
    window.dispatchEvent(new CustomEvent("forgood:refresh-missions"));
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-col gap-10">
        {/* ─── Hero Section ─────────────────────────── */}
        <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.4em] text-fg-olive">FORGOOD / Monad Testnet</p>
            <h1 className="font-display text-5xl leading-tight text-fg-ink md:text-6xl">
              The Autonomous Agent for Collective Social Impact.
            </h1>
            <p className="text-lg text-black/70">
              Propose missions, let the agent evaluate impact, and get rewarded when proof is verified.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <CreateMissionForm onCreated={handleMissionCreated} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[32px] border border-black/10 bg-white/80 p-6 shadow-soft">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-fg-olive">Wallet</p>
                <ConnectButton />
              </div>
              <div className="mt-6 space-y-4">
                <AgentStatus />
                <TreasuryCard />
              </div>
            </div>
          </div>
        </section>

        {/* ─── Mission Feed ─────────────────────────── */}
        <section className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-display text-3xl text-fg-ink">Missions</h2>
              <p className="text-sm text-black/60">Verified impact, instant rewards on Monad.</p>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-fg-olive">Live feed</span>
          </div>
          <MissionList />
        </section>
      </div>
    </main>
  );
}
