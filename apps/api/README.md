# @forgood/api

The Fastify REST API that orchestrates the entire FORGOOD mission lifecycle. This is the **central runtime** — it connects AI evaluation, Postgres persistence, and Monad blockchain payouts.

## Quick Start

```bash
# from monorepo root
pnpm install
pnpm test:stack:up                          # start Postgres
pnpm --filter @forgood/api prisma:generate  # generate Prisma client
pnpm --filter @forgood/api prisma:migrate   # run migrations
pnpm --filter @forgood/api dev              # test mode (free models)
pnpm --filter @forgood/api dev:serving      # serving mode (Kimi K2.5)
```

## Directory Structure

```
apps/api/
├── src/
│   ├── index.ts              ← all HTTP routes + mission state machine
│   ├── ai/
│   │   └── openrouter.ts     ← OpenRouter SDK client (streaming, dual-mode)
│   ├── chain/
│   │   └── monad.ts          ← viem clients, treasury reads/writes, registry writes
│   └── config/
│       └── chain.ts          ← Monad testnet chain definition (id: 10143)
├── prisma/
│   ├── schema.prisma         ← data model (Mission, Proof, MissionStatus enum)
│   └── migrations/           ← SQL migration history
├── scripts/
│   └── smoke-test.mjs        ← end-to-end API lifecycle test
├── .env.example              ← env template (copy to .env)
└── package.json
```

## Key Implementation Files

### `src/index.ts` — API Routes & State Machine (433 lines)

The **most important file** for understanding the runtime. Contains:

- **13 routes** covering the full mission lifecycle
- Zod-validated request schemas
- Helper functions for consistent error handling and status transitions
- BigInt JSON serialization for blockchain amounts

Route map:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Mode, models, on-chain status |
| GET | `/treasury` | On-chain FORGOOD token balance |
| GET | `/missions` | List missions (filterable by status) |
| GET | `/missions/:id` | Single mission with proofs |
| POST | `/missions` | Create mission proposal |
| POST | `/missions/:id/evaluate` | Manual evaluation (human scores) |
| POST | `/missions/:id/auto-evaluate` | **AI evaluation** via OpenRouter |
| POST | `/missions/:id/activate` | Move evaluated → active |
| POST | `/missions/:id/submit-proof` | Submit proof URI + note |
| POST | `/missions/:id/verify` | Manual verification override |
| POST | `/missions/:id/auto-verify` | **AI proof verification** (text+vision) |
| POST | `/missions/:id/reward` | Release reward (off-chain or on-chain) |

### `src/ai/openrouter.ts` — AI Integration (203 lines)

The **AI brain**. Uses `@openrouter/sdk` with streaming (`for await` chunks).

- **Dual-mode model selection**: `FORGOOD_MODE=test` → free models, `FORGOOD_MODE=serving` → Kimi K2.5
- `evaluateMission()` — sends mission proposal to AI evaluator, returns `{ difficulty, impact, confidence, reward, rationale }`
- `verifyProof()` — sends text + image to AI verifier, returns `{ verdict, confidence, evidence[] }`
- Built-in retry with exponential backoff via SDK `retryConfig`
- JSON extraction with fallback (direct parse → code fence → raw braces)

### `src/chain/monad.ts` — Blockchain Integration (318 lines)

The **on-chain layer**. Uses `viem` to talk to Monad testnet contracts.

- `publicClient` — read-only client for balance queries and contract reads
- `getWalletClient()` — lazy wallet client from `AGENT_PRIVATE_KEY`
- **Treasury operations**: `getTreasuryBalance()`, `releaseReward(recipient, amount)`
- **Registry operations**: `proposeMissionOnChain()`, `evaluateMissionOnChain()`, `activateMissionOnChain()`, `verifyMissionOnChain()`, `rewardMissionOnChain()`, `getMissionOnChain()`
- Gas estimation with buffers (+10% for simple calls, +20% for cross-contract)
- `isOnChainEnabled()` — guard for optional on-chain features

### `src/config/chain.ts` — Monad Chain Config (23 lines)

Custom viem chain definition for Monad testnet (chain ID 10143).

### `prisma/schema.prisma` — Data Model

Two models:
- **Mission** — full lifecycle state + AI evaluation results + on-chain hash
- **Proof** — submitted evidence with AI verdict/confidence

Status enum mirrors the contract state machine:
`proposed → evaluated → active → proof_submitted → verified|rejected → rewarded`

## State Machine

```
proposed ──AI──→ evaluated ──→ active ──proof──→ proof_submitted ──AI──→ verified ──→ rewarded
                                                                   └──→ rejected
```

Each transition is enforced by `expectStatus()` guard in the API routes.

## AI Modes

| Mode | Env | Text Model | Vision Model | Cost |
|------|-----|------------|--------------|------|
| test | `FORGOOD_MODE=test` | `openrouter/auto` | `openrouter/auto` | Free |
| serving | `FORGOOD_MODE=serving` | `moonshotai/kimi-k2.5` | `moonshotai/kimi-k2.5` | ~$0.30/$1.50 per M tokens |

Verify: `curl -s http://127.0.0.1:4000/health | jq '{mode, models}'`

## Environment Variables

See `.env.example` for the full list. Key ones:

| Variable | Required | Default |
|----------|----------|---------|
| `DATABASE_URL` | Yes | — |
| `OPENROUTER_API_KEY` | Yes | — |
| `FORGOOD_MODE` | No | `test` |
| `PORT` | No | `4000` |
| `AUTO_PAYOUT` | No | `false` |
| `AGENT_PRIVATE_KEY` | When `AUTO_PAYOUT=true` | — |
| `TREASURY_ADDRESS` | When `AUTO_PAYOUT=true` | — |
| `FORGOOD_TOKEN_ADDRESS` | When `AUTO_PAYOUT=true` | — |

## Scripts

```bash
pnpm --filter @forgood/api dev          # test mode with watch
pnpm --filter @forgood/api dev:serving  # serving mode with watch
pnpm --filter @forgood/api dev:test     # test mode with .env.test
pnpm --filter @forgood/api build        # compile to dist/
pnpm --filter @forgood/api start        # run compiled output
pnpm --filter @forgood/api smoke:test   # end-to-end lifecycle test
pnpm --filter @forgood/api typecheck    # tsc type validation
pnpm --filter @forgood/api prisma:generate
pnpm --filter @forgood/api prisma:migrate
```
