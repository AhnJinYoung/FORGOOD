# FORGOOD

The Autonomous Agent for Collective Social Impact.

This repository is a pnpm monorepo that implements an end-to-end mission loop:
1. user proposes a mission,
2. AI evaluates reward,
3. mission is activated,
4. proof is submitted,
5. AI verifies proof,
6. reward is released (off-chain record or on-chain payout).

The current implementation is optimized for Monad testnet + OpenRouter SDK-backed AI (streaming) with a local Postgres dev/test stack.

## 1. Current Architecture At A Glance

### Runtime components
- `apps/api`: Fastify API, Prisma/Postgres persistence, OpenRouter AI calls, viem Monad integration.
- `apps/web`: Next.js frontend with RainbowKit wallet connection and mission feed.
- `packages/shared`: canonical Zod schemas/types used by API + AI package.
- `packages/agent`: evaluator/verifier prompt templates + strict parser helpers.
- `packages/contracts`: Solidity contracts and Foundry tests for treasury/registry flow.

### High-level data flow
1. Frontend (or client) calls API route in `apps/api/src/index.ts`.
2. API validates payload using `@forgood/shared` schemas.
3. API writes mission/proof records to Postgres via Prisma.
4. AI routes call OpenRouter from `apps/api/src/ai/openrouter.ts`.
5. Reward route optionally writes on-chain tx via viem in `apps/api/src/chain/monad.ts`.
6. API returns JSON mission state, with bigint reward serialized as string.

### Chain target
- Monad testnet
- chain id: `10143`
- RPC default: `https://testnet-rpc.monad.xyz`
- explorer: `https://testnet.monadvision.com`

## 2. Repository Map

- `README.md`: this document.
- `TESTING.md`: focused test-environment notes.
- `implementationPlan.md`: build roadmap.
- `docker-compose.yml`: local Postgres service.
- `scripts/test-api.sh`: API smoke bootstrapping script (DB + API + smoke run).
- `scripts/test-runtime.sh`: WSL-safe runtime mirror and validation.
- `scripts/doctor.sh`: quick environment diagnostics.

### Apps
- `apps/api`
  - `src/index.ts`: all HTTP routes and mission state transitions.
  - `src/ai/openrouter.ts`: OpenRouter text + vision calls.
  - `src/chain/monad.ts`: treasury read/reward transaction helpers.
  - `src/config/chain.ts`: Monad viem chain config.
  - `prisma/schema.prisma`: data model and enum state machine.
  - `prisma/migrations/...`: SQL migration history.
  - `scripts/smoke-test.mjs`: end-to-end API mission lifecycle test.
- `apps/web`
  - `app/page.tsx`: landing + mission feed entrypoint.
  - `components/MissionList.tsx`: client mission fetch and render.
  - `app/providers.tsx`: RainbowKit, Wagmi, React Query wiring.
  - `lib/chain.ts`: Monad chain definition used by wallet client.

### Packages
- `packages/shared/src/index.ts`: shared schemas:
  - mission proposal
  - mission evaluation
  - proof submission
  - proof verification
  - mission response model
- `packages/agent/src/index.ts`: system prompts + schema parse helpers.
- `packages/contracts/src`
  - `MockToken.sol`
  - `ForGoodTreasury.sol`
  - `MissionRegistry.sol`
- `packages/contracts/test/MissionRegistry.t.sol`: contract lifecycle tests.
- `packages/contracts/script/Deploy.s.sol`: Foundry deploy script.

## 3. Mission Lifecycle And State Machine

Canonical mission status enum (DB + shared types):
- `proposed`
- `evaluated`
- `active`
- `proof_submitted`
- `verified`
- `rejected`
- `rewarded`

State transitions implemented in API:
1. `proposed` -> `evaluated`
   - `POST /missions/:id/evaluate` (manual)
   - `POST /missions/:id/auto-evaluate` (AI)
2. `evaluated` -> `active`
   - `POST /missions/:id/activate`
3. `active` -> `proof_submitted`
   - `POST /missions/:id/submit-proof`
4. `proof_submitted` -> `verified|rejected`
   - `POST /missions/:id/auto-verify` (AI)
   - `POST /missions/:id/verify` (manual override)
5. `verified` -> `rewarded`
   - `POST /missions/:id/reward`

Special override behavior:
- `POST /missions/:id/verify` accepts both `proof_submitted` and `rejected` status, so a previously rejected mission can be manually approved later.

## 4. API Contract (Fastify)

Base URL:
- dev default: `http://localhost:4000`
- test default: `http://localhost:4010`

### Health + treasury
- `GET /health`
  - returns `{ ok: true }`
- `GET /treasury`
  - reads ERC-20 `balanceOf(TREASURY_ADDRESS)` via viem
  - returns `{ balance: "<uint256-as-string>" }`

### Mission CRUD-ish
- `GET /missions`
  - latest-first list.
- `GET /missions/:id`
  - includes `proofs` relation.
- `POST /missions`
  - body:
    - `title` (3-120)
    - `description` (10-4000)
    - `category` (2-64)
    - `location` optional (2-128)
    - `proposer` wallet string (42-64)

### Evaluation
- `POST /missions/:id/evaluate`
  - manual scores:
    - `difficulty` 1-10
    - `impact` 1-10
    - `confidence` 0-1
    - `rewardAmount` integer string (wei)
    - `rationale` (10-2000)
- `POST /missions/:id/auto-evaluate`
  - no required body
  - AI returns schema-constrained JSON from OpenRouter
  - reward saved as bigint (`rewardAmount`)

### Proof + verification
- `POST /missions/:id/submit-proof`
  - body:
    - `submitter` wallet string
    - `proofUri` URL
    - `note` optional
- `POST /missions/:id/verify`
  - manual verdict:
    - `verdict`: `approved | rejected | needs_review`
    - `confidence`: 0-1
    - `evidence`: string[]
- `POST /missions/:id/auto-verify`
  - uses mission summary + proof image URL in multimodal OpenRouter request

### Reward
- `POST /missions/:id/reward`
  - body:
    - `txHash` optional
    - `recipient` optional
  - behavior:
    - if `AUTO_PAYOUT=false`: stores provided `txHash` only.
    - if `AUTO_PAYOUT=true`: sends on-chain `releaseReward(recipient, rewardAmount)` transaction and stores returned hash.
  - recipient fallback:
    - request `recipient` or `mission.proofSubmittedBy`.

### Serialization detail
- `rewardAmount` is stored as Prisma `BigInt` and serialized to string in API responses.

## 5. AI Layer (OpenRouter + Agent Prompts)

Implementation files:
- `apps/api/src/ai/openrouter.ts`
- `packages/agent/src/index.ts`

Behavior:
- Uses OpenRouter Chat Completions endpoint.
- Enforces JSON object response format.
- Includes fallback JSON extraction for models that wrap JSON in extra text.
- Supports separate text and vision models:
  - `OPENROUTER_MODEL` for mission evaluation.
  - `OPENROUTER_MODEL_VISION` for proof verification.
- Adds request headers:
  - `HTTP-Referer`
  - `X-Title`

Prompt contracts:
- evaluation prompt requires:
  - `difficulty`
  - `impact`
  - `confidence`
  - `reward` (wei)
  - `rationale`
- proof prompt requires:
  - `verdict`
  - `confidence`
  - `evidence[]`

Validation:
- AI outputs are parsed through shared Zod schemas before DB writes.

## 6. Database Model (Prisma + Postgres)

Prisma provider:
- PostgreSQL

Tables:
- `Mission`
  - core mission fields + AI fields + payout tx hash + timestamps
- `Proof`
  - proof submission/verdict artifacts

Relationships:
- one `Mission` to many `Proof` entries
- cascade delete on mission removal

Migration source:
- `apps/api/prisma/migrations/20260204080701_init/migration.sql`

## 7. Smart Contracts (Foundry)

Contracts in `packages/contracts/src`:

### `MockToken.sol`
- minimal ERC-20-like mock used in tests.
- fixed metadata: name/symbol `FORGOOD`, decimals `18`.

### `ForGoodTreasury.sol`
- owner-controlled treasury contract.
- authorized reward callers:
  - `authorizedAgent`
  - `authorizedRegistry`
- reward function:
  - `releaseReward(recipient, amount)` checks balance then transfer.
- admin functions:
  - set owner, token, authorized agent, authorized registry
  - emergency withdraw.

### `MissionRegistry.sol`
- on-chain mission state machine for hashed mission/proof data.
- lifecycle:
  - `proposeMission(metadataHash)`
  - `evaluateMission(missionId, rewardAmount)` (agent only)
  - `activateMission(missionId)` (agent only)
  - `submitProof(missionId, proofHash)`
  - `verifyMission(missionId, approved)` (agent only)
  - `rewardMission(missionId)` (agent only, calls treasury)

### Tests
- `packages/contracts/test/MissionRegistry.t.sol` covers:
  - happy path lifecycle and payout
  - unauthorized evaluation revert
  - insufficient treasury revert

### Deploy script
- `packages/contracts/script/Deploy.s.sol` deploys:
  - `ForGoodTreasury`
  - `MissionRegistry`
- script env:
  - `DEPLOYER_PRIVATE_KEY`
  - `FORGOOD_TOKEN_ADDRESS`
  - `AUTHORIZED_AGENT`
- important post-deploy step:
  - call `treasury.setAuthorizedRegistry(<registry>)` so registry can release rewards.

## 8. Frontend (Next.js + RainbowKit)

Frontend focus today:
- hero/branding screen
- wallet connect panel
- live mission list from API

Key files:
- `apps/web/app/layout.tsx`
  - global fonts, atmosphere/grid visual background
  - providers wrapper
- `apps/web/app/providers.tsx`
  - Wagmi + RainbowKit + React Query setup
- `apps/web/components/MissionList.tsx`
  - fetches `GET /missions` from `NEXT_PUBLIC_API_URL`
  - displays status and reward

Environment dependency:
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is required for real WalletConnect usage.

## 9. Environment Variables

### API (`apps/api/.env` and `apps/api/.env.test`)

Required for normal local run:
- `DATABASE_URL`
- `PORT`
- `FORGOOD_MODE` — `test` (default) or `serving`
- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_REFERER`
- `OPENROUTER_TITLE`
- `MONAD_RPC_URL`
- `AUTO_PAYOUT`

Test-mode model overrides (used when `FORGOOD_MODE=test`):
- `OPENROUTER_MODEL_TEST` (default: `openrouter/auto`)
- `OPENROUTER_MODEL_VISION_TEST` (default: `openrouter/auto`)

Serving-mode model overrides (used when `FORGOOD_MODE=serving`):
- `OPENROUTER_MODEL` (default: `moonshotai/kimi-k2.5`)
- `OPENROUTER_MODEL_VISION` (default: `moonshotai/kimi-k2.5`)

Required only when `AUTO_PAYOUT=true`:
- `AGENT_PRIVATE_KEY`
- `TREASURY_ADDRESS`
- `FORGOOD_TOKEN_ADDRESS`

Notes:
- `.env.example` defaults to `FORGOOD_MODE=test` for safe development.
- Switch to `FORGOOD_MODE=serving` for production-quality AI (costs real credits).

### Web (`apps/web/.env` and `apps/web/.env.test`)

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

## 10. AI Modes: Test vs Serving

FORGOOD runs in two AI modes controlled by the `FORGOOD_MODE` environment variable.

### Test Mode (default, free)

Uses free/auto-routed models via OpenRouter. No cost, suitable for development, CI, and smoke tests. AI quality may be lower and some models may refuse certain prompts.

| Setting | Value |
|---------|-------|
| `FORGOOD_MODE` | `test` |
| Text model | `openrouter/auto` |
| Vision model | `openrouter/auto` |
| Cost | Free |

**Run in test mode:**
```bash
# Using API package script (recommended)
pnpm --filter @forgood/api dev

# Or explicitly
FORGOOD_MODE=test pnpm --filter @forgood/api dev

# Or from root
pnpm dev:api:test
```

### Serving Mode (production, paid)

Uses `moonshotai/kimi-k2.5` — a high-quality multimodal model with 262K context window. Provides reliable JSON outputs and strong vision capabilities for proof verification.

| Setting | Value |
|---------|-------|
| `FORGOOD_MODE` | `serving` |
| Text model | `moonshotai/kimi-k2.5` |
| Vision model | `moonshotai/kimi-k2.5` |
| Cost | ~$0.30/M input, ~$1.50/M output |


**Run in serving mode:**
```bash
# Using API package script
pnpm --filter @forgood/api dev:serving

# Or from root
pnpm dev:api:serving

# Or set env directly
FORGOOD_MODE=serving pnpm --filter @forgood/api dev
```

### How it works

The mode is resolved at startup in `apps/api/src/ai/openrouter.ts`:
1. Reads `FORGOOD_MODE` env var (defaults to `test` if unset).
2. Selects model pair from `MODEL_MAP[mode]`.
3. All AI calls (evaluation + proof verification) use the selected models.
4. The `/health` endpoint reports current mode and active models.

**Verify active mode:**
```bash
curl -s http://127.0.0.1:4000/health | jq '{mode, models}'
# → { "mode": "test", "models": { "text": "openrouter/auto", "vision": "openrouter/auto" } }
```

### Custom model overrides

You can override models per mode via env vars:

```bash
# Override test-mode models
OPENROUTER_MODEL_TEST=google/gemini-2.5-flash
OPENROUTER_MODEL_VISION_TEST=google/gemini-2.5-flash

# Override serving-mode models
OPENROUTER_MODEL=anthropic/claude-sonnet-4
OPENROUTER_MODEL_VISION=anthropic/claude-sonnet-4
```

## 11. Local Development Setup

### Prerequisites
- Node `22` recommended (`.nvmrc` provided; runtime script enforces 22)
- Node `18+` can run local API/web in many setups, but use 22 for consistent results
- pnpm `9.x`
- Docker + docker-compose

### First-time setup
```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm test:stack:up
pnpm --filter @forgood/api prisma:generate
pnpm --filter @forgood/api exec prisma migrate deploy
```

### Run services
```bash
pnpm --filter @forgood/api dev
pnpm --filter @forgood/web dev
```

Default URLs:
- API: `http://localhost:4000`
- Web: `http://localhost:3000`

### Stop DB stack
```bash
pnpm test:stack:down
```

## 12. Testing And Debug Workflows

### Fast checks
```bash
pnpm doctor
pnpm typecheck
```

### API smoke test (recommended)
```bash
pnpm test:api:smoke
```

What it does:
1. ensures Postgres is reachable
2. runs Prisma migrate deploy
3. boots API with `.env.test`
4. executes `apps/api/scripts/smoke-test.mjs`
5. runs lifecycle:
   - health
   - create mission
   - auto-evaluate (or manual fallback)
   - activate
   - submit proof
   - auto-verify (or manual fallback)
   - reward with mock tx hash when `AUTO_PAYOUT=false`

### WSL + `/mnt/c` lock workaround
If pnpm file locking is unstable on Windows-mounted paths:
```bash
pnpm test:runtime
```
This mirrors repo to `~/workspaces/FORGOOD-runtime` and runs install, typechecks, and smoke there.

### Test profile run commands
```bash
pnpm --filter @forgood/api dev:test
pnpm dev:web:test
```

## 13. Contract Development Workflow

From `packages/contracts`:

Install forge-std (if missing):
```bash
forge install foundry-rs/forge-std
```

Run tests:
```bash
forge test
```

Deploy to Monad testnet:
```bash
source .env
forge script script/Deploy.s.sol:Deploy --rpc-url "$MONAD_RPC_URL" --broadcast
```

## 14. Operational Notes And Current Gaps

- The API currently stores mission metadata/proofs in Postgres; it does not yet write mission lifecycle actions to `MissionRegistry` on-chain.
- Reward settlement can be fully on-chain only when `AUTO_PAYOUT=true` and real chain env vars are configured.
- Smoke tests intentionally include manual fallbacks for AI route instability or free-model policy failures.
- Frontend is currently read-focused (mission display + wallet connect) and does not yet expose full create/evaluate/verify UI flows.

## 15. Security And Secret Hygiene

- Do not commit live private keys or paid API keys.
- Rotate any key immediately if it was exposed in logs, screenshots, or commit history.
- Keep `AUTO_PAYOUT=false` by default in local/testing until treasury and agent signer are intentionally configured.
- Treat proof URLs as untrusted user input; only process through validated parsers.

## 16. Action Commands Reference

All commands you need to run FORGOOD in every combination of mode, UI, and environment.

---

### 16.1 Docker Compose — Container Management

| Action | Command |
| :--- | :--- |
| **Start API (test mode, default)** | `docker compose up -d` |
| **Start API + rebuild images** | `docker compose up -d --build` |
| **Start API + Web UI** | `docker compose --profile web up -d --build` |
| **Start API in serving mode (no web)** | `docker compose --profile serving up -d --build` |
| **Start API serving + Web UI** | `docker compose --profile serving --profile web up -d --build` |
| **Quick restart (keep data)** | `docker compose restart api` |
| **Restart + rebuild code only** | `docker compose up -d --build api` |
| **Rebuild and restart web only** | `docker compose --profile web up -d --build web` |
| **Full restart (wipe DB)** | `docker compose down -v && docker compose up -d --build` |
| **Stop everything** | `docker compose down` |
| **Stop + wipe all data** | `docker compose down -v` |
| **View API logs** | `docker compose logs -f api` |
| **View all logs** | `docker compose logs -f` |
| **Show running containers** | `docker compose ps` |

> **Note:** The `-v` flag removes the Postgres data volume. Omit it to keep your mission data across restarts.

#### Docker quick-start matrix

| Scenario | Command |
| :--- | :--- |
| Test mode, API only | `docker compose up -d` |
| Test mode, API + Web | `docker compose --profile web up -d --build` |
| Serving mode, API only | `docker compose --profile serving up -d --build` |
| Serving mode, API + Web | `docker compose --profile serving --profile web up -d --build` |
| Clean slate (reset everything) | `docker compose down -v && docker compose up -d --build` |
| Clean slate + Web | `docker compose down -v && docker compose --profile web up -d --build` |

---

### 16.2 Docker Compose — Root pnpm Shortcuts

These root-level scripts wrap Docker Compose for convenience:

| Action | Command |
| :--- | :--- |
| Start (test mode, API) | `pnpm docker:up` |
| Start + rebuild | `pnpm docker:up:build` |
| Start + Web UI + rebuild | `pnpm docker:up:full` |
| Start serving mode + rebuild | `pnpm docker:up:serving` |
| Stop all | `pnpm docker:down` |
| View API logs | `pnpm docker:logs` |
| Build images only | `pnpm docker:build` |
| Show status | `pnpm docker:ps` |

---

### 16.3 Local Dev (no Docker for API/Web)

Requires a running Postgres (via `pnpm test:stack:up` or external).

#### API

| Action | Command |
| :--- | :--- |
| Dev — test mode (default) | `pnpm dev:api` |
| Dev — test mode + .env.test | `pnpm dev:api:test` |
| Dev — serving mode | `pnpm dev:api:serving` |
| Dev — from API dir | `pnpm --filter @forgood/api dev` |
| Dev — serving from API dir | `pnpm --filter @forgood/api dev:serving` |
| Build production | `pnpm --filter @forgood/api build` |
| Start prod (test mode) | `pnpm --filter @forgood/api start:test` |
| Start prod (serving mode) | `pnpm --filter @forgood/api start:serving` |

#### Web

| Action | Command |
| :--- | :--- |
| Dev — Next.js dev server | `pnpm dev:web` |
| Dev — from web dir | `pnpm --filter @forgood/web dev` |
| Build production | `pnpm --filter @forgood/web build` |
| Start prod | `pnpm --filter @forgood/web start` |

#### Database

| Action | Command |
| :--- | :--- |
| Start Postgres (Docker) | `pnpm test:stack:up` |
| Stop Postgres | `pnpm test:stack:down` |
| Generate Prisma client | `pnpm prisma:generate` |
| Run migrations | `pnpm prisma:migrate` |

---

### 16.4 Testing & Diagnostics

| Action | Command |
| :--- | :--- |
| TypeScript check (all packages) | `pnpm typecheck` |
| Lint all | `pnpm lint` |
| Format all | `pnpm format` |
| Doctor (env diagnostics) | `pnpm doctor` |
| API smoke test | `pnpm test:api:smoke` |
| Smoke test (skip DB check) | `pnpm test:smoke:skip-db` |
| WSL runtime mirror test | `pnpm test:runtime:bash` |
| Foundry contract tests | `cd packages/contracts && forge test` |

---

### 16.5 Seed & API Actions (curl)

These are HTTP calls to the running API. Default base URL: `http://localhost:4000`.

#### Health & Status

| Action | Command |
| :--- | :--- |
| Health check | `curl -s http://localhost:4000/health \| jq` |
| Check mode + models | `curl -s http://localhost:4000/health \| jq '{mode, models}'` |
| Treasury balance | `curl -s http://localhost:4000/treasury \| jq` |

#### Seed Data (test mode only)

| Action | Command |
| :--- | :--- |
| Seed 8 example missions | `curl -s -X POST http://localhost:4000/seed \| jq` |
| Reset DB + re-seed | `curl -s -X POST http://localhost:4000/seed -H 'content-type: application/json' -d '{"reset":true}' \| jq` |

#### Mission Lifecycle

| Action | Command |
| :--- | :--- |
| List all missions | `curl -s http://localhost:4000/missions \| jq` |
| List active only | `curl -s 'http://localhost:4000/missions?status=active' \| jq` |
| List unclaimed active | `curl -s 'http://localhost:4000/missions?status=active&excludeClaimed=true' \| jq` |
| Get single mission | `curl -s http://localhost:4000/missions/<ID> \| jq` |
| Create mission | `curl -s -X POST http://localhost:4000/missions -H 'content-type: application/json' -d '{"title":"...","description":"...","category":"environment","proposer":"0x..."}'` |
| Auto-evaluate | `curl -s -X POST http://localhost:4000/missions/<ID>/auto-evaluate -H 'content-type: application/json' -d '{}'` |
| Activate | `curl -s -X POST http://localhost:4000/missions/<ID>/activate -H 'content-type: application/json' -d '{}'` |
| Claim | `curl -s -X POST http://localhost:4000/missions/<ID>/claim -H 'content-type: application/json' -d '{"claimer":"0x..."}'` |
| Unclaim | `curl -s -X POST http://localhost:4000/missions/<ID>/unclaim -H 'content-type: application/json' -d '{"claimer":"0x..."}'` |
| Submit proof | `curl -s -X POST http://localhost:4000/missions/<ID>/submit-proof -H 'content-type: application/json' -d '{"submitter":"0x...","proofUri":"https://...","note":"..."}'` |
| Auto-verify | `curl -s -X POST http://localhost:4000/missions/<ID>/auto-verify -H 'content-type: application/json' -d '{}'` |
| Manual verify | `curl -s -X POST http://localhost:4000/missions/<ID>/verify -H 'content-type: application/json' -d '{"verdict":"approved","confidence":0.9,"evidence":["looks good"]}'` |
| Issue reward | `curl -s -X POST http://localhost:4000/missions/<ID>/reward -H 'content-type: application/json' -d '{}'` |
| Boost reward | `curl -s -X POST http://localhost:4000/missions/<ID>/boost -H 'content-type: application/json' -d '{"booster":"0x...","amount":"1000000000000000000"}'` |

#### My Missions & Agent

| Action | Command |
| :--- | :--- |
| My missions (by address) | `curl -s http://localhost:4000/my-missions/0x... \| jq` |
| AI auto-post new mission | `curl -s -X POST http://localhost:4000/agent/auto-post \| jq` |

---

### 16.6 Contract Commands (Foundry)

| Action | Command |
| :--- | :--- |
| Run tests | `cd packages/contracts && forge test` |
| Run tests (verbose) | `cd packages/contracts && forge test -vvv` |
| Build contracts | `cd packages/contracts && forge build` |
| Deploy to Monad testnet | `cd packages/contracts && source .env && forge script script/Deploy.s.sol:Deploy --rpc-url "$MONAD_RPC_URL" --broadcast` |
| Install forge-std | `cd packages/contracts && forge install foundry-rs/forge-std` |

---

### 16.7 Common Workflows (Copy-Paste Ready)

**Fresh start (test mode, API + Web + seed data):**
```bash
docker compose down -v
docker compose --profile web up -d --build
sleep 5
curl -s -X POST http://localhost:4000/seed | jq '.summary'
```

**Fresh start (serving mode, API only):**
```bash
docker compose down -v
docker compose --profile serving up -d --build
sleep 5
curl -s http://localhost:4000/health | jq
```

**Local dev (no Docker for API):**
```bash
pnpm test:stack:up          # Postgres only
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev:api                # test mode
# In another terminal:
pnpm dev:web
```

**Quick code change → restart:**
```bash
docker compose up -d --build api   # rebuilds API image only
docker compose logs -f api          # watch for errors
```

**Reset everything and re-seed:**
```bash
curl -s -X POST http://localhost:4000/seed -H 'content-type: application/json' -d '{"reset":true}' | jq '.summary'
```

## 17. How To Extend Safely

Recommended order for new features:
1. update shared schema in `packages/shared/src/index.ts`
2. update API route validation + state transition checks
3. add/adjust Prisma fields + migration
4. update frontend types/rendering
5. add smoke-test assertions for new flow
6. if needed, mirror behavior to contracts and add Foundry tests

This order prevents API/frontend drift and keeps AI outputs schema-safe.

## 18. End-To-End API Walkthrough (curl)

This is the fastest way to understand the runtime behavior without opening the frontend.

```bash
# 0) health
curl -s http://127.0.0.1:4010/health

# 1) create mission
MISSION_ID=$(curl -s -X POST http://127.0.0.1:4010/missions \
  -H 'content-type: application/json' \
  -d '{
    "title":"Park cleanup",
    "description":"Clean litter, sort recyclables, and upload before/after evidence.",
    "category":"environment",
    "location":"test-city",
    "proposer":"0x1111111111111111111111111111111111111111"
  }' | node -e "process.stdin.once('data',d=>console.log(JSON.parse(d).mission.id))")

# 2) AI evaluate
curl -s -X POST http://127.0.0.1:4010/missions/$MISSION_ID/auto-evaluate -H 'content-type: application/json' -d '{}'

# 3) activate
curl -s -X POST http://127.0.0.1:4010/missions/$MISSION_ID/activate -H 'content-type: application/json' -d '{}'

# 4) submit proof
curl -s -X POST http://127.0.0.1:4010/missions/$MISSION_ID/submit-proof \
  -H 'content-type: application/json' \
  -d '{
    "submitter":"0x2222222222222222222222222222222222222222",
    "proofUri":"https://images.unsplash.com/photo-1552083375-1447ce886485?auto=format&fit=crop&w=800&q=60",
    "note":"cleanup done"
  }'

# 5) AI verify (fallback to manual if needed)
curl -s -X POST http://127.0.0.1:4010/missions/$MISSION_ID/auto-verify -H 'content-type: application/json' -d '{}'

# Optional manual approve
curl -s -X POST http://127.0.0.1:4010/missions/$MISSION_ID/verify \
  -H 'content-type: application/json' \
  -d '{"verdict":"approved","confidence":0.6,"evidence":["manual override"]}'

# 6) reward (off-chain record mode)
curl -s -X POST http://127.0.0.1:4010/missions/$MISSION_ID/reward \
  -H 'content-type: application/json' \
  -d '{"txHash":"0xtesthash000000000000000000000000000000000000000000000000000000"}'

# 7) final mission snapshot
curl -s http://127.0.0.1:4010/missions/$MISSION_ID
```

## 19. Troubleshooting

### API fails to boot
- check `DATABASE_URL` and Postgres reachability on `127.0.0.1:5432`
- run `pnpm test:stack:up`
- run `pnpm --filter @forgood/api exec prisma migrate deploy`
- inspect `/tmp/forgood-api.log` after smoke-test failures

### OpenRouter free model errors
- `No endpoints found matching your data policy (Free model publication)`:
  - update OpenRouter key privacy/data policy to allow free model usage.
- `User not found`:
  - key is invalid/disabled; replace `OPENROUTER_API_KEY`.

### Reward route fails with `AUTO_PAYOUT=true`
- ensure all are real values:
  - `AGENT_PRIVATE_KEY`
  - `TREASURY_ADDRESS`
  - `FORGOOD_TOKEN_ADDRESS`
- ensure treasury contract actually holds FORGOOD token balance.

### WSL + `/mnt/c` install issues
- run `pnpm test:runtime` to execute in Linux home path mirror.

## 20. Minimum Productionization Checklist

Before public deployment:
1. replace all local/test secrets and rotate any exposed keys.
2. add authenticated role checks on sensitive routes (`evaluate`, `verify`, `reward`).
3. add rate limits + request logging retention policy.
4. add pinning/storage policy for mission and proof artifacts (e.g., signed upload flow).
5. wire API lifecycle writes to `MissionRegistry` (or remove unused registry path).
6. add integration tests for real on-chain payout path with testnet contracts.
