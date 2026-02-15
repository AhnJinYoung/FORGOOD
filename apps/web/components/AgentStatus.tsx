"use client";

import { useEffect, useState } from "react";
import { getHealth, type HealthInfo } from "../lib/api";

export function AgentStatus() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const check = () =>
      getHealth()
        .then((h) => {
          setHealth(h);
          setError(false);
        })
        .catch(() => setError(true));

    check();
    const interval = setInterval(check, 30_000); // poll every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-2xl bg-fg-sand/80 p-4">
      <p className="text-sm uppercase tracking-[0.3em] text-fg-olive">Agent Status</p>
      {error ? (
        <div className="mt-2">
          <p className="text-lg font-semibold text-fg-rust">Offline</p>
          <p className="text-xs text-black/40">API server unreachable</p>
        </div>
      ) : health ? (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <p className="text-lg font-semibold text-fg-ink">Online</p>
          </div>
          <p className="text-xs text-black/40">
            {health.onChainEnabled ? "On-chain features enabled" : "Off-chain mode"}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-black/50">Checking…</p>
      )}
    </div>
  );
}
