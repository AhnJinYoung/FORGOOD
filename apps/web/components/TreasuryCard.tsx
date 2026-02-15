"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { getTreasury, type TreasuryInfo } from "../lib/api";

export function TreasuryCard() {
  const { isConnected } = useAccount();
  const [treasury, setTreasury] = useState<TreasuryInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) {
      setTreasury(null);
      setError(null);
      return;
    }

    setLoading(true);
    getTreasury()
      .then(setTreasury)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load treasury"))
      .finally(() => setLoading(false));
  }, [isConnected]);

  return (
    <div className="rounded-2xl border border-black/10 p-4">
      <p className="text-sm uppercase tracking-[0.3em] text-fg-olive">Treasury</p>
      {!isConnected ? (
        <div className="mt-2">
          <p className="text-sm text-black/50">Connect your wallet to view the FORGOOD treasury balance.</p>
        </div>
      ) : loading ? (
        <p className="mt-2 text-sm text-black/50">Loading…</p>
      ) : error ? (
        <p className="mt-2 text-sm text-fg-rust">{error}</p>
      ) : treasury ? (
        <div className="mt-2">
          <p className="text-2xl font-semibold text-fg-ink">{treasury.formatted}</p>
          <p className="text-xs text-black/40">FORGOOD tokens available</p>
          {!treasury.onChainEnabled && (
            <p className="mt-1 text-xs text-amber-600">⚠ Off-chain test mode — no real treasury contract</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
