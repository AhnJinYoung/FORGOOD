"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// ─── Mock exchange rates (demo) ─────────────────────────────
const MOCK_RATE = 0.042; // 1 FORGOOD = $0.042 USDT (demo)
const FORGOOD_SYMBOL = "FORGOOD";
const USDT_SYMBOL = "USDT";

type Direction = "buy" | "sell";

export default function ExchangePage() {
  const { isConnected } = useAccount();
  const [direction, setDirection] = useState<Direction>("buy");
  const [amount, setAmount] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const rate = direction === "buy" ? MOCK_RATE : 1 / MOCK_RATE;
  const outputAmount = numAmount * (direction === "buy" ? 1 / MOCK_RATE : MOCK_RATE);
  const fromSymbol = direction === "buy" ? USDT_SYMBOL : FORGOOD_SYMBOL;
  const toSymbol = direction === "buy" ? FORGOOD_SYMBOL : USDT_SYMBOL;

  function handleSwapDirection() {
    setDirection((d) => (d === "buy" ? "sell" : "buy"));
    setAmount("");
    setShowConfirm(false);
  }

  function handleConfirm() {
    setShowConfirm(true);
    // Demo — no real swap happens
    setTimeout(() => setShowConfirm(false), 3000);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-fg-olive">FORGOOD / Exchange</p>
            <h1 className="font-display mt-2 text-4xl text-fg-ink">Token Exchange</h1>
            <p className="mt-1 text-sm text-black/60">
              Swap USDT and FORGOOD tokens at market price.
            </p>
          </div>
          <ConnectButton />
        </div>

        {/* Rate Banner */}
        <div className="rounded-2xl border border-black/5 bg-white/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-fg-olive">Current Rate</span>
            <span className="text-xs text-black/40">Demo — Monad Testnet</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl text-fg-ink">1 {FORGOOD_SYMBOL}</span>
            <span className="text-lg text-black/50">=</span>
            <span className="font-display text-3xl text-fg-rust">${MOCK_RATE.toFixed(3)} {USDT_SYMBOL}</span>
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-black/40">
            <span>24h Change: <span className="text-emerald-600">+2.4%</span></span>
            <span>Volume: $128.5K</span>
            <span>Liquidity: $42.0K</span>
          </div>
        </div>

        {/* Swap Card */}
        <div className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-soft">
          {!isConnected ? (
            <div className="py-8 text-center">
              <p className="font-display text-xl text-fg-ink">Connect Your Wallet</p>
              <p className="mt-2 text-sm text-black/60">
                Connect your wallet to swap tokens.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Direction tabs */}
              <div className="flex rounded-full bg-black/5 p-1">
                <button
                  onClick={() => { setDirection("buy"); setAmount(""); setShowConfirm(false); }}
                  className={`flex-1 rounded-full px-4 py-2 text-xs uppercase tracking-wider transition ${
                    direction === "buy"
                      ? "bg-fg-ink text-fg-sand shadow-sm"
                      : "text-black/50 hover:text-fg-ink"
                  }`}
                >
                  Buy {FORGOOD_SYMBOL}
                </button>
                <button
                  onClick={() => { setDirection("sell"); setAmount(""); setShowConfirm(false); }}
                  className={`flex-1 rounded-full px-4 py-2 text-xs uppercase tracking-wider transition ${
                    direction === "sell"
                      ? "bg-fg-ink text-fg-sand shadow-sm"
                      : "text-black/50 hover:text-fg-ink"
                  }`}
                >
                  Sell {FORGOOD_SYMBOL}
                </button>
              </div>

              {/* From */}
              <div className="rounded-2xl border border-black/10 bg-fg-sand/50 p-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs uppercase tracking-wider text-fg-olive">You Pay</label>
                  <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-fg-ink">
                    {fromSymbol}
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setShowConfirm(false); }}
                  placeholder="0.00"
                  className="mt-2 w-full bg-transparent font-display text-3xl text-fg-ink outline-none placeholder:text-black/20"
                />
                {numAmount > 0 && (
                  <p className="mt-1 text-xs text-black/40">
                    ≈ ${direction === "buy" ? numAmount.toFixed(2) : (numAmount * MOCK_RATE).toFixed(2)} USD
                  </p>
                )}
              </div>

              {/* Swap arrow */}
              <div className="flex justify-center">
                <button
                  onClick={handleSwapDirection}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-lg transition hover:bg-black/5 hover:shadow-sm"
                >
                  ↕
                </button>
              </div>

              {/* To */}
              <div className="rounded-2xl border border-black/10 bg-fg-sand/50 p-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs uppercase tracking-wider text-fg-olive">You Receive</label>
                  <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-fg-ink">
                    {toSymbol}
                  </span>
                </div>
                <p className="mt-2 font-display text-3xl text-fg-ink">
                  {numAmount > 0 ? outputAmount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0.00"}
                </p>
                {numAmount > 0 && (
                  <p className="mt-1 text-xs text-black/40">
                    Rate: 1 {fromSymbol} = {rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {toSymbol}
                  </p>
                )}
              </div>

              {/* Swap details */}
              {numAmount > 0 && (
                <div className="space-y-1 rounded-xl bg-black/[0.02] p-3 text-xs text-black/50">
                  <div className="flex justify-between">
                    <span>Price Impact</span>
                    <span className="text-emerald-600">&lt; 0.01%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Estimated Fee</span>
                    <span>~0.001 MON</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Minimum Received</span>
                    <span>{(outputAmount * 0.995).toLocaleString(undefined, { maximumFractionDigits: 2 })} {toSymbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Slippage Tolerance</span>
                    <span>0.5%</span>
                  </div>
                </div>
              )}

              {/* Confirm button */}
              {showConfirm ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
                  <p className="text-sm font-medium text-amber-700">🚧 Exchange Coming Soon</p>
                  <p className="mt-1 text-xs text-amber-600">
                    The DEX integration is under development. Swap functionality will be available once the FORGOOD/USDT liquidity pool is deployed on Monad.
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleConfirm}
                  disabled={numAmount <= 0}
                  className="w-full rounded-full bg-fg-ink px-4 py-3 text-sm font-medium uppercase tracking-wider text-fg-sand transition hover:bg-fg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {numAmount <= 0
                    ? "Enter an amount"
                    : `Swap ${numAmount.toLocaleString()} ${fromSymbol} → ${outputAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${toSymbol}`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Info section */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-black/5 bg-white/60 p-4">
            <p className="text-xs uppercase tracking-wider text-fg-olive">Total Supply</p>
            <p className="font-display mt-1 text-xl text-fg-ink">1,000,000</p>
            <p className="text-xs text-black/40">FORGOOD tokens</p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white/60 p-4">
            <p className="text-xs uppercase tracking-wider text-fg-olive">Market Cap</p>
            <p className="font-display mt-1 text-xl text-fg-ink">$42,000</p>
            <p className="text-xs text-black/40">Demo estimate</p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white/60 p-4">
            <p className="text-xs uppercase tracking-wider text-fg-olive">Network</p>
            <p className="font-display mt-1 text-xl text-fg-ink">Monad</p>
            <p className="text-xs text-black/40">Testnet (chain 10143)</p>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-center text-xs text-black/30">
          This is a demo exchange interface on Monad Testnet. No real value is transferred.
          Actual DEX trading will be available after mainnet launch.
        </p>
      </div>
    </main>
  );
}
