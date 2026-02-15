"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { createMission, autoEvaluate } from "../lib/api";

const CATEGORIES = [
  "environment",
  "education",
  "community",
  "open-source",
  "health",
  "infrastructure",
  "other",
];

interface Props {
  onCreated?: () => void;
}

export function CreateMissionForm({ onCreated }: Props) {
  const { address, isConnected } = useAccount();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [screeningInfo, setScreeningInfo] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [location, setLocation] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setScreeningInfo(null);

    try {
      const { mission } = await createMission({
        title,
        description,
        category,
        location: location || undefined,
        proposer: address,
      });

      // Auto-evaluate immediately
      try {
        await autoEvaluate(mission.id);
        setSuccess(`Mission "${mission.title}" created and evaluated by AI! 🎉`);
      } catch {
        setSuccess(`Mission "${mission.title}" created! AI evaluation pending.`);
      }

      // Reset form
      setTitle("");
      setDescription("");
      setLocation("");
      onCreated?.();
    } catch (err: unknown) {
      // Check if this is a screening rejection (422)
      const errMsg = err instanceof Error ? err.message : "Failed to create mission";
      if (errMsg.includes("not approved by the AI screening")) {
        setScreeningInfo(errMsg);
        setError("🛡️ Your mission proposal didn't pass the social-good screening. Please revise and try again.");
      } else {
        setError(errMsg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-fg-ink px-6 py-3 text-sm uppercase tracking-[0.2em] text-fg-sand transition hover:bg-fg-ink/90"
      >
        Propose a Mission
      </button>
    );
  }

  return (
    <div className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-2xl text-fg-ink">Propose a Mission</h3>
        <button
          onClick={() => setOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-sm hover:bg-black/10"
        >
          ✕
        </button>
      </div>

      {!isConnected ? (
        <p className="mt-4 text-sm text-fg-rust">Connect your wallet to propose a mission.</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-fg-olive">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={120}
              placeholder="e.g., Community park cleanup in downtown"
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-fg-olive"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-fg-olive">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              minLength={10}
              maxLength={4000}
              rows={4}
              placeholder="Describe what you'll do, who benefits, and how you'll prove completion…"
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-fg-olive"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-fg-olive">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-fg-olive"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1).replace("-", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-fg-olive">
                Location <span className="text-black/30">(optional)</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={128}
                placeholder="e.g., New York, Remote, Global"
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-fg-olive"
              />
            </div>
          </div>

          {error && <p className="text-sm text-fg-rust">{error}</p>}
          {screeningInfo && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <p className="font-medium">🛡️ AI Screening Feedback</p>
              <p className="mt-1">{screeningInfo}</p>
              <p className="mt-1 text-amber-600">Tip: Revise your mission to clearly describe how it benefits a community, ecosystem, or social cause.</p>
            </div>
          )}
          {success && <p className="text-sm text-emerald-700">{success}</p>}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-fg-ink px-6 py-3 text-sm uppercase tracking-[0.2em] text-fg-sand transition hover:bg-fg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "🛡️ Screening & Submitting…" : "Submit Mission"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-black/20 px-6 py-3 text-sm uppercase tracking-[0.2em] transition hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
