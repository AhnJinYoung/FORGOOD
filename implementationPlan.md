# $FORGOOD — Comprehensive Implementation Plan

> **Project:** $FORGOOD — The Autonomous Agent for Collective Social Impact
> **Hackathon:** Moltiverse (Feb 2–18, 2026) — $200K prize pool
> **Track:** Agent+Token Track ($140K pool — requires agent + Nad.fun token launch)
> **Network:** Monad (testnet chain 10143 for dev; mainnet chain 143 for demo)
> **AI Runtime:** OpenClaw on AWS EC2 + OpenRouter (Kimi K2.5)

---

## Table of Contents

0. [Goals, Constraints, and Architecture Overview](#phase-0-goals-constraints-and-architecture-overview)
1. [Monorepo Scaffolding and CI](#phase-1-monorepo-scaffolding-and-ci)
2. [Smart Contracts — Foundry on Monad](#phase-2-smart-contracts--foundry-on-monad)
3. [Nad.fun $FORGOOD Token Launch](#phase-3-nadfun-forgood-token-launch)
4. [Backend API — Fastify + Prisma + OpenRouter](#phase-4-backend-api--fastify--prisma--openrouter)
5. [AI Agent Layer — OpenRouter Kimi K2.5](#phase-5-ai-agent-layer--openrouter-kimi-k25)
6. [On-Chain Integration — viem + Monad](#phase-6-on-chain-integration--viem--monad)
7. [OpenClaw Agent Runtime on AWS EC2](#phase-7-openclaw-agent-runtime-on-aws-ec2)
8. [Moltbook Social Integration](#phase-8-moltbook-social-integration)
9. [Frontend — Next.js + Tailwind + RainbowKit](#phase-9-frontend--nextjs--tailwind--rainbowkit)
10. [Proof Storage and Media Pipeline](#phase-10-proof-storage-and-media-pipeline)
11. [End-to-End Integration Testing](#phase-11-end-to-end-integration-testing)
12. [Observability, Security, and Hardening](#phase-12-observability-security-and-hardening)
13. [Demo Script and Hackathon Delivery](#phase-13-demo-script-and-hackathon-delivery)
14. [Open Questions and Risk Register](#phase-14-open-questions-and-risk-register)

---

## Phase 0: Goals, Constraints, and Architecture Overview

### 0.1 Goals

1. **Complete Core Loop:** Propose → AI Evaluate → Activate → Prove → AI Verify → On-Chain Reward.
2. **Token Economy:** Launch `$FORGOOD` token on Nad.fun with bonding curve; use it as the reward currency.
3. **Autonomous Agent:** OpenClaw bot on AWS runs the evaluation/verification pipeline; users interact via Telegram/Discord.
4. **Hackathon Demo:** Reliable, reproducible 3–5 minute demo showing full lifecycle with real testnet transactions.

### 0.2 Constraints

- **Deadline:** Feb 15, 2026 23:59 ET (rolling judging — earlier is better).
- **Testnet first.** Mainnet optional for final demo if token launch requires it (Nad.fun mainnet is production).
- **Budget:** AWS free-tier EC2 (c7i-flex-large, 4 GiB). OpenRouter pay-per-token ($0.30/M in, $1.50/M out for Kimi K2.5).
- **Security:** Hackathon-grade; no production-grade audit, but key hygiene enforced.

### 0.3 Architecture Diagram (Text)

```
┌────────────────────────────────────────────────────────────────────────┐
│                         USER / COMMUNITY                               │
│  Browser (Next.js + RainbowKit)  |  Telegram/Discord (via OpenClaw)    │
└───────────┬──────────────────────┴──────────────────┬──────────────────┘
            │ HTTP/WS                                 │ OpenClaw Gateway
            ▼                                         ▼
┌───────────────────────┐              ┌──────────────────────────────┐
│   apps/api (Fastify)  │◄────────────►│   AWS EC2 — OpenClaw Agent   │
│   - Mission CRUD      │              │   - Kimi K2.5 via OpenRouter │
│   - State Machine     │              │   - evaluateMission tool     │
│   - Proof ingestion   │              │   - verifyProof tool         │
│   - On-chain txns     │              │   - Telegram/Discord channel │
│   - Nad.fun client    │              │   - ClawHub skills           │
└──────┬────────────────┘              └──────────────────────────────┘
       │
       ├─── Prisma ──► PostgreSQL (Docker / AWS RDS)
       │
       ├─── viem ───► Monad Testnet (chain 10143)
       │               ├─ MissionRegistry.sol
       │               ├─ ForGoodTreasury.sol
       │               └─ $FORGOOD ERC-20 (Nad.fun token)
       │
       └─── OpenRouter API ──► Kimi K2.5 (text + vision)
```

### 0.4 Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Chain | Monad testnet (10143) | 10,000+ TPS, 400ms blocks, EVM-compatible, hackathon target |
| Token launch | Nad.fun bonding curve | Hackathon requirement (Agent+Token track) |
| AI model | `moonshotai/kimi-k2.5` via OpenRouter | 262K context, native multimodal/vision, $0.30/$1.50 per M tokens |
| Agent runtime | OpenClaw on AWS EC2 | Required by hackathon; Telegram/Discord channels |
| Smart contracts | Foundry (Solidity 0.8.24, EVM Prague) | Monad requires `evm_version = "prague"` |
| Backend | Fastify + Prisma + PostgreSQL | Already scaffolded; type-safe, fast |
| Frontend | Next.js 14 + Tailwind + RainbowKit | Wallet-first UX; SSR for SEO |
| Blockchain client | viem 2.40+ | Monad-recommended; full EIP-1559 support |

### 0.5 Repository Structure (Current)

```
FORGOOD/
├── apps/
│   ├── api/          # Fastify backend + Prisma + OpenRouter + viem
│   └── web/          # Next.js frontend
├── packages/
│   ├── agent/        # AI prompt templates + schema parsers
│   ├── contracts/    # Foundry: ForGoodTreasury, MissionRegistry, MockToken
│   └── shared/       # Zod schemas shared across API + agent
├── Dev/              # Documentation (AGENTS.md, Monad.md, openclaw.md)
├── scripts/          # doctor.sh, test-api.sh, test-runtime.sh
├── docker-compose.yml
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Phase 1: Monorepo Scaffolding and CI

**Status:** ✅ Mostly complete (existing scaffold). Needs hardening.

### 1.1 Tasks

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 1.1.1 | Verify pnpm workspace resolves all packages | `pnpm-workspace.yaml` | P0 |
| 1.1.2 | Ensure `tsconfig.base.json` composite refs are correct | `tsconfig.base.json`, per-package `tsconfig.json` | P0 |
| 1.1.3 | Add `.env.example` files for all apps with all required keys documented | `apps/api/.env.example`, `apps/web/.env.example` | P0 |
| 1.1.4 | Add `engines` field to root `package.json` requiring Node ≥ 22 | `package.json` | P1 |
| 1.1.5 | Verify `pnpm install` succeeds from clean state | — | P0 |
| 1.1.6 | Add GitHub Actions CI (optional): lint + typecheck + forge test | `.github/workflows/ci.yml` | P2 |

### 1.2 Self-Verification Checklist

```bash
# 1. Clean install succeeds
rm -rf node_modules; pnpm install

# 2. Typecheck passes
pnpm typecheck

# 3. Lint passes (no errors, warnings OK)
pnpm lint

# 4. Every .env.example lists all required keys
grep -c "=" apps/api/.env.example   # should be >= 12
grep -c "=" apps/web/.env.example   # should be >= 2

# 5. Doctor script passes
bash scripts/doctor.sh
```

---

## Phase 2: Smart Contracts — Foundry on Monad

**Status:** ✅ Contracts written. Tests exist. Not yet deployed to testnet.

### 2.1 Contract Architecture

```
ForGoodTreasury.sol
├── Holds $FORGOOD ERC-20 tokens
├── owner: deployer (admin)
├── authorizedAgent: backend agent wallet (can release rewards)
├── authorizedRegistry: MissionRegistry contract address
├── releaseReward(recipient, amount) → ERC-20 transfer
└── emergencyWithdraw(recipient, amount) → owner only

MissionRegistry.sol
├── Stores on-chain mission state machine (hashes only, not full data)
├── Status: Proposed → Evaluated → Active → ProofSubmitted → Verified/Rejected → Rewarded
├── agent-only: evaluateMission, activateMission, verifyMission, rewardMission
├── anyone: proposeMission, submitProof
└── rewardMission calls treasury.releaseReward()

MockToken.sol
└── Minimal ERC-20 for local/test use (name: FORGOOD, 18 decimals)
```

### 2.2 Tasks

| # | Task | Details | Priority |
|---|------|---------|----------|
| 2.2.1 | Verify `foundry.toml` has correct Monad config | `evm_version = "prague"`, `chain_id = 10143`, `solc_version = "0.8.24"` | P0 |
| 2.2.2 | Run all existing Foundry tests locally | `forge test -vvv` from `packages/contracts` | P0 |
| 2.2.3 | Add edge-case tests | Double-reward revert, re-verify rejected mission, zero-amount reward | P1 |
| 2.2.4 | Add gas snapshot | `forge snapshot` to track gas costs | P2 |
| 2.2.5 | Create deployer keystore | `cast wallet import monad-deployer --private-key $(cast wallet new \| grep 'Private key:' \| awk '{print $3}')` | P0 |
| 2.2.6 | Fund deployer from faucet | `curl -X POST https://agents.devnads.com/v1/faucet -H "Content-Type: application/json" -d '{"chainId":10143,"address":"<DEPLOYER>"}'` OR https://faucet.monad.xyz | P0 |
| 2.2.7 | Deploy MockToken to testnet | `forge create src/MockToken.sol:MockToken --account monad-deployer --broadcast` | P0 |
| 2.2.8 | Deploy ForGoodTreasury to testnet | Constructor args: `(tokenAddress, agentAddress)` | P0 |
| 2.2.9 | Deploy MissionRegistry to testnet | Constructor args: `(treasuryAddress, agentAddress)` | P0 |
| 2.2.10 | Post-deploy: `treasury.setAuthorizedRegistry(registryAddress)` | Critical! Registry must be authorized to call treasury | P0 |
| 2.2.11 | Mint MockToken to treasury | Transfer initial supply to treasury contract | P0 |
| 2.2.12 | Verify all 3 contracts on MonadVision | Use Agent Verification API (see AGENTS.md) | P1 |
| 2.2.13 | Save deployed addresses to `packages/contracts/.env.deployed` | `MOCK_TOKEN=0x...\nTREASURY=0x...\nREGISTRY=0x...` | P0 |

### 2.3 Deploy Script Enhancement

The existing `Deploy.s.sol` deploys Treasury + Registry. Enhance to also:
1. Deploy MockToken (or use Nad.fun token address if available).
2. Call `treasury.setAuthorizedRegistry(registry)`.
3. Transfer initial token supply to treasury.

```bash
# Full deploy command
source packages/contracts/.env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "https://testnet-rpc.monad.xyz" \
  --broadcast \
  --account monad-deployer
```

### 2.4 Self-Verification Checklist

```bash
# 1. All tests pass
cd packages/contracts && forge test -vvv
# Expected: all green, 0 failures

# 2. Deploy to testnet succeeds
forge script script/Deploy.s.sol:Deploy --rpc-url https://testnet-rpc.monad.xyz --broadcast --account monad-deployer
# Expected: 3 contract addresses in output

# 3. Verify treasury has correct authorized registry
cast call $TREASURY_ADDRESS "authorizedRegistry()" --rpc-url https://testnet-rpc.monad.xyz
# Expected: registry address (non-zero)

# 4. Verify registry's treasury is set
cast call $REGISTRY_ADDRESS "treasury()" --rpc-url https://testnet-rpc.monad.xyz
# Expected: treasury address

# 5. Verify token balance in treasury
cast call $TOKEN_ADDRESS "balanceOf(address)" $TREASURY_ADDRESS --rpc-url https://testnet-rpc.monad.xyz
# Expected: non-zero balance

# 6. Test releaseReward from registry (dry run)
# Create a mission, evaluate, activate, submit proof, verify, reward → check recipient balance changed

# 7. Contract verification on explorer
# Visit https://testnet.monadvision.com/address/<CONTRACT_ADDRESS> → source code visible
```

---

## Phase 3: Nad.fun $FORGOOD Token Launch

**Status:** 🔲 Not started. Critical for Agent+Token track.

### 3.1 Understanding Nad.fun

Nad.fun is Monad's native token launchpad with bonding curve mechanics:
1. **Create** a token → it starts on a bonding curve (price increases with buys).
2. **Trade** on the curve → buy/sell via `BondingCurveRouter` contract.
3. **Graduate** → when target liquidity is reached, auto-migrates to Capricorn DEX (Uniswap V3).

**Token creation fee:** 10 MON (testnet) / 10 MON (mainnet).

### 3.2 Network Configuration

| Constant | Testnet | Mainnet |
|---|---|---|
| API URL | `https://dev-api.nad.fun` | `https://api.nadapp.net` |
| BONDING_CURVE_ROUTER | `0x865054F0F6A288adaAc30261731361EA7E908003` | `0x6F6B8F1a20703309951a5127c45B49b1CD981A22` |
| LENS | `0xB056d79CA5257589692699a46623F901a3BB76f1` | `0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea` |
| CURVE | `0x1228b0dc9481C11D3071E7A924B794CfB038994e` | `0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE` |
| WMON | `0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd` | `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` |
| Chain ID | 10143 | 143 |
| RPC | `https://testnet-rpc.monad.xyz` | `https://rpc.monad.xyz` |

### 3.3 Token Launch Flow (4 Steps)

#### Step 1: Upload Image
```typescript
const imageBuffer = fs.readFileSync("assets/forgood-logo.png");
const { image_uri, is_nsfw } = await fetch(`${API_URL}/agent/token/image`, {
  method: "POST",
  headers: { "Content-Type": "image/png", ...headers },
  body: imageBuffer,
}).then(r => r.json());
```

#### Step 2: Upload Metadata
```typescript
const { metadata_uri } = await fetch(`${API_URL}/agent/token/metadata`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify({
    image_uri,
    name: "FORGOOD",
    symbol: "FORGOOD",
    description: "The Autonomous Agent for Collective Social Impact. Propose missions, verify proof, earn rewards.",
    website: "https://forgood.xyz",      // optional
    twitter: "https://x.com/forgood_ai", // optional
  }),
}).then(r => r.json());
```

#### Step 3: Mine Salt (Vanity Address)
```typescript
const { salt, address: predictedAddress } = await fetch(`${API_URL}/agent/salt`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify({
    creator: account.address,
    name: "FORGOOD",
    symbol: "FORGOOD",
    metadata_uri,
  }),
}).then(r => r.json());
```

#### Step 4: Create On-Chain
```typescript
// Get deploy fee
const feeConfig = await publicClient.readContract({
  address: CURVE, abi: curveAbi, functionName: "feeConfig",
});
const deployFeeAmount = feeConfig[0]; // ~10 MON

// Optional initial buy
const initialBuyAmount = parseEther("1"); // buy 1 MON worth
const minTokens = await publicClient.readContract({
  address: LENS, abi: lensAbi,
  functionName: "getInitialBuyAmountOut", args: [initialBuyAmount],
});

// Execute create
const hash = await walletClient.writeContract({
  address: BONDING_CURVE_ROUTER,
  abi: bondingCurveRouterAbi,
  functionName: "create",
  args: [{
    name: "FORGOOD", symbol: "FORGOOD", tokenURI: metadata_uri,
    amountOut: minTokens, salt: salt as `0x${string}`, actionId: 1,
  }],
  value: deployFeeAmount + initialBuyAmount,
  gas: 8_000_000n, // ~7M typical, +buffer
});

// Extract token address from CurveCreate event
const receipt = await publicClient.waitForTransactionReceipt({ hash });
for (const log of receipt.logs) {
  try {
    const event = decodeEventLog({ abi: curveAbi, data: log.data, topics: log.topics });
    if (event.eventName === "CurveCreate") {
      const { token: tokenAddress, pool: poolAddress } = event.args;
      console.log("Token:", tokenAddress, "Pool:", poolAddress);
      break;
    }
  } catch {}
}
```

### 3.4 Tasks

| # | Task | Priority |
|---|------|----------|
| 3.4.1 | Create `$FORGOOD` logo image (PNG, ≤5MB) | P0 |
| 3.4.2 | Create `scripts/launch-token.ts` implementing the 4-step flow above | P0 |
| 3.4.3 | Fund creator wallet with ≥15 MON (10 deploy fee + initial buy + gas) | P0 |
| 3.4.4 | Execute token launch on testnet first | P0 |
| 3.4.5 | Record token address and pool address | P0 |
| 3.4.6 | Verify token is visible on Nad.fun UI (`/agent/token/:token_id`) | P0 |
| 3.4.7 | Transfer initial $FORGOOD supply to ForGoodTreasury contract | P0 |
| 3.4.8 | Update ForGoodTreasury to point to real $FORGOOD token (`setToken()`) | P0 |
| 3.4.9 | If targeting Agent+Token track: repeat on mainnet (chain 143) | P1 |
| 3.4.10 | Create `packages/shared/src/nadfun.ts` with Nad.fun API client + types | P1 |

### 3.5 Self-Verification Checklist

```bash
# 1. Image upload returns valid URI
curl -s -X POST https://dev-api.nad.fun/agent/token/image \
  -H "Content-Type: image/png" --data-binary @assets/forgood-logo.png \
  | jq '.image_uri'
# Expected: non-null IPFS or CDN URI

# 2. Metadata upload returns valid URI
# (run metadata upload script, check metadata_uri)

# 3. Salt mining returns predicted address
# (run salt script, check salt + address)

# 4. Token creation tx confirmed
# Check tx hash on https://testnet.monadvision.com/tx/<hash>

# 5. Token visible via Nad.fun API
curl -s "https://dev-api.nad.fun/agent/token/<TOKEN_ADDRESS>" | jq '.token_info.name'
# Expected: "FORGOOD"

# 6. Creator wallet holds tokens
cast call <TOKEN_ADDRESS> "balanceOf(address)" <CREATOR_ADDRESS> --rpc-url https://testnet-rpc.monad.xyz
# Expected: non-zero balance

# 7. Treasury holds tokens after transfer
cast call <TOKEN_ADDRESS> "balanceOf(address)" <TREASURY_ADDRESS> --rpc-url https://testnet-rpc.monad.xyz
# Expected: non-zero balance
```

---

## Phase 4: Backend API — Fastify + Prisma + OpenRouter

**Status:** ✅ Core routes implemented. Needs Nad.fun client, on-chain write-through, and hardening.

### 4.1 Current API Routes

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/health` | ✅ | Health check |
| GET | `/treasury` | ✅ | Read ERC-20 balance via viem |
| GET | `/missions` | ✅ | List all missions (newest first) |
| GET | `/missions/:id` | ✅ | Single mission + proofs |
| POST | `/missions` | ✅ | Propose new mission |
| POST | `/missions/:id/evaluate` | ✅ | Manual evaluation |
| POST | `/missions/:id/auto-evaluate` | ✅ | AI evaluation via Kimi K2.5 |
| POST | `/missions/:id/activate` | ✅ | Activate evaluated mission |
| POST | `/missions/:id/submit-proof` | ✅ | Submit proof for active mission |
| POST | `/missions/:id/verify` | ✅ | Manual verification |
| POST | `/missions/:id/auto-verify` | ✅ | AI vision verification via Kimi K2.5 |
| POST | `/missions/:id/reward` | ✅ | Release reward (off-chain or on-chain) |

### 4.2 New Routes Needed

| Method | Path | Description | Priority |
|--------|------|-------------|----------|
| GET | `/token/info` | Nad.fun token metadata + market data | P1 |
| GET | `/token/market` | Current price, volume, holder count from Nad.fun | P1 |
| POST | `/missions/:id/propose-onchain` | Write mission hash to MissionRegistry | P1 |
| POST | `/missions/:id/reward-onchain` | Trigger on-chain reward via MissionRegistry.rewardMission() | P0 |
| GET | `/missions/:id/onchain` | Read on-chain mission state from MissionRegistry | P2 |

### 4.3 Database Schema Updates

Current schema is sufficient. Minor additions needed:

| Field | Table | Type | Purpose |
|-------|-------|------|---------|
| `onchainMissionId` | Mission | `Int?` | MissionRegistry's on-chain mission ID |
| `metadataHash` | Mission | `String?` | keccak256 of mission metadata stored on-chain |
| `proofHash` | Proof | `String?` | keccak256 of proof data stored on-chain |

### 4.4 Tasks

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 4.4.1 | Add `onchainMissionId`, `metadataHash` fields to Prisma schema | `apps/api/prisma/schema.prisma` | P1 |
| 4.4.2 | Generate + apply migration | `prisma migrate dev --name add_onchain_fields` | P1 |
| 4.4.3 | Add Nad.fun API client | `apps/api/src/nadfun/client.ts` | P1 |
| 4.4.4 | Add `/token/info` and `/token/market` routes | `apps/api/src/index.ts` | P1 |
| 4.4.5 | Implement on-chain mission write-through in reward route | `apps/api/src/chain/monad.ts` | P0 |
| 4.4.6 | Add request validation middleware (rate limiting) | `apps/api/src/index.ts` | P2 |
| 4.4.7 | Add structured error responses with codes | `apps/api/src/index.ts` | P2 |
| 4.4.8 | Add bigint serialization plugin to Fastify | `apps/api/src/index.ts` | P1 |

### 4.5 Self-Verification Checklist

```bash
# 1. API boots without errors
PORT=4010 pnpm --filter @forgood/api dev:test
# Expected: "Server listening at http://0.0.0.0:4010"

# 2. Health check
curl -s http://127.0.0.1:4010/health | jq .ok
# Expected: true

# 3. Create mission
MISSION=$(curl -s -X POST http://127.0.0.1:4010/missions \
  -H 'content-type: application/json' \
  -d '{"title":"Test park cleanup","description":"Clean up litter and sort recyclables at Central Park","category":"environment","proposer":"0x1111111111111111111111111111111111111111"}')
echo $MISSION | jq .mission.id
# Expected: UUID

# 4. Auto-evaluate (AI)
MISSION_ID=$(echo $MISSION | jq -r .mission.id)
curl -s -X POST http://127.0.0.1:4010/missions/$MISSION_ID/auto-evaluate -H 'content-type: application/json' -d '{}'
# Expected: status = "evaluated", rewardAmount is non-null string

# 5. Treasury balance
curl -s http://127.0.0.1:4010/treasury | jq .balance
# Expected: numeric string (may be "0" if no tokens deposited)

# 6. Full smoke test
pnpm test:api:smoke
# Expected: all steps pass (with manual fallbacks if AI models are rate-limited)
```

---

## Phase 5: AI Agent Layer — OpenRouter Kimi K2.5

**Status:** ✅ Core prompts and parsers implemented. Needs refinement and confidence thresholds.

### 5.1 Model Configuration

| Parameter | Value |
|-----------|-------|
| Model (text) | `moonshotai/kimi-k2.5` |
| Model (vision) | `moonshotai/kimi-k2.5` (same model, native multimodal) |
| Context window | 262,144 tokens |
| Input cost | $0.30 / 1M tokens |
| Output cost | $1.50 / 1M tokens |
| Temperature | 0.3 (for consistency) |
| Response format | `{ type: "json_object" }` |

### 5.2 Agent Tools

#### Tool 1: `evaluateMission`

**Input Schema:**
```json
{
  "title": "string",
  "description": "string",
  "category": "string",
  "location": "string | undefined"
}
```

**Output Schema (enforced via Zod):**
```json
{
  "difficulty": "number (1-10)",
  "impact": "number (1-10)",
  "confidence": "number (0-1)",
  "reward": "string (wei) or number",
  "rationale": "string (10-2000 chars)"
}
```

**Reward Formula Guidance in Prompt:**
- Base reward: `difficulty × impact × 1e16` wei (0.01–1.0 FORGOOD tokens).
- Scaling factor: adjustable based on treasury balance.
- Minimum reward: `1e16` (0.01 FORGOOD).
- Maximum reward: `1e19` (10 FORGOOD).

#### Tool 2: `verifyProof` (Vision)

**Input:**
- Mission summary text
- Proof image URL (passed as `image_url` content part)

**Output Schema (enforced via Zod):**
```json
{
  "verdict": "'approved' | 'rejected' | 'needs_review'",
  "confidence": "number (0-1)",
  "evidence": "string[] (min 1 item)"
}
```

**Verification Policy:**
- `confidence >= 0.7` + `verdict === 'approved'` → auto-reward.
- `confidence >= 0.5` + `verdict === 'needs_review'` → queue for manual review.
- `confidence < 0.5` OR `verdict === 'rejected'` → auto-reject.
- All decisions logged with full evidence array.

### 5.3 Tasks

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 5.3.1 | Refine evaluation prompt with reward formula + category-specific guidance | `packages/agent/src/index.ts` | P0 |
| 5.3.2 | Refine proof verification prompt with stricter criteria | `packages/agent/src/index.ts` | P0 |
| 5.3.3 | Add confidence threshold constants to `packages/shared` | `packages/shared/src/index.ts` | P1 |
| 5.3.4 | Add retry logic with exponential backoff (max 3 retries) | `apps/api/src/ai/openrouter.ts` | P1 |
| 5.3.5 | Add fallback to manual evaluation when AI fails | `apps/api/src/index.ts` | P1 |
| 5.3.6 | Add token usage tracking / logging | `apps/api/src/ai/openrouter.ts` | P2 |
| 5.3.7 | Test with ≥5 diverse mission types and ≥5 proof images | — | P0 |
| 5.3.8 | Validate Kimi K2.5 vision works with real image URLs | — | P0 |

### 5.4 Self-Verification Checklist

```bash
# 1. Evaluate a sample mission
curl -s -X POST http://127.0.0.1:4010/missions/$MISSION_ID/auto-evaluate \
  -H 'content-type: application/json' -d '{}'
# Expected: JSON with difficulty, impact, confidence, reward, rationale
# Reward should be a reasonable wei string (e.g., "50000000000000000" = 0.05 FORGOOD)

# 2. Verify a proof image (vision)
# Submit a proof with a real image URL, then:
curl -s -X POST http://127.0.0.1:4010/missions/$MISSION_ID/auto-verify \
  -H 'content-type: application/json' -d '{}'
# Expected: JSON with verdict, confidence, evidence[]

# 3. Test confidence threshold logic
# Submit a clearly irrelevant image (e.g., a cat photo for a "park cleanup" mission)
# Expected: verdict = "rejected", confidence < 0.5

# 4. Test JSON extraction fallback
# Some models wrap JSON in markdown; extractJson() should handle this
# (Unit test in packages/agent)

# 5. Test retry logic
# Temporarily set invalid API key, confirm 3 retries then error
```

---

## Phase 6: On-Chain Integration — viem + Monad

**Status:** ✅ Treasury read + reward write implemented. Needs MissionRegistry write-through.

### 6.1 Current Chain Module (`apps/api/src/chain/monad.ts`)

| Function | Status | Description |
|----------|--------|-------------|
| `getTreasuryBalance()` | ✅ | Reads ERC-20 `balanceOf(TREASURY)` |
| `releaseReward(recipient, amount)` | ✅ | Calls `treasury.releaseReward()` when `AUTO_PAYOUT=true` |

### 6.2 New Functions Needed

| Function | Description | Priority |
|----------|-------------|----------|
| `proposeMissionOnChain(metadataHash)` | Call `registry.proposeMission(hash)` | P1 |
| `evaluateMissionOnChain(missionId, rewardAmount)` | Call `registry.evaluateMission()` | P1 |
| `activateMissionOnChain(missionId)` | Call `registry.activateMission()` | P1 |
| `submitProofOnChain(missionId, proofHash)` | Call `registry.submitProof()` | P1 |
| `verifyMissionOnChain(missionId, approved)` | Call `registry.verifyMission()` | P1 |
| `rewardMissionOnChain(missionId)` | Call `registry.rewardMission()` (triggers treasury payout) | P0 |
| `getMissionOnChain(missionId)` | Read `registry.missions(id)` | P2 |

### 6.3 Monad-Specific Considerations

From AGENTS.md:
- **Gas is charged on gas_limit, not gas_used.** Set gas limits accurately to avoid overpaying MON.
- **Block finality:** 800ms (2 blocks). Wait for `Finalized` state for payments.
- **SLOAD cold access:** 8,100 gas (vs Ethereum's 2,100). Minimize storage reads.
- **viem minimum version:** 2.40.0+.
- **EVM version:** Prague (required for Monad).
- **No blob transactions** (EIP-4844 not supported).
- **Contract size limit:** 128 KB (vs Ethereum's 24.5 KB).

### 6.4 Tasks

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 6.4.1 | Add MissionRegistry ABI to `apps/api/src/chain/` | `apps/api/src/chain/abi.ts` | P0 |
| 6.4.2 | Add ForGoodTreasury ABI to chain module | `apps/api/src/chain/abi.ts` | P0 |
| 6.4.3 | Implement all MissionRegistry write functions | `apps/api/src/chain/monad.ts` | P1 |
| 6.4.4 | Add gas estimation before every write (Monad charges on gas_limit) | `apps/api/src/chain/monad.ts` | P1 |
| 6.4.5 | Add `waitForTransactionReceipt` after writes | `apps/api/src/chain/monad.ts` | P1 |
| 6.4.6 | Wire on-chain write-through into API reward route | `apps/api/src/index.ts` | P0 |
| 6.4.7 | Add environment variables: `REGISTRY_ADDRESS` | `apps/api/.env.example` | P0 |

### 6.5 Self-Verification Checklist

```bash
# 1. Treasury balance readable
curl -s http://127.0.0.1:4010/treasury | jq .balance
# Expected: numeric string

# 2. On-chain reward triggers actual token transfer
# (After full lifecycle, check recipient balance on explorer)

# 3. Gas estimation works
# (Check logs: gas estimate should be printed before each tx)

# 4. Transaction receipts are stored
curl -s http://127.0.0.1:4010/missions/$MISSION_ID | jq .mission.onchainTxHash
# Expected: "0x..." hash after reward

# 5. Verify on explorer
# Visit https://testnet.monadvision.com/tx/<HASH> → status: success
```

---

## Phase 7: OpenClaw Agent Runtime on AWS EC2

**Status:** 🔲 Not started. Required for hackathon.

### 7.1 Architecture

```
AWS EC2 (c7i-flex-large, Ubuntu 24.04)
├── OpenClaw Gateway (localhost:18789)
│   ├── Telegram channel (bot token)
│   ├── Discord channel (optional)
│   └── AI Provider: OpenRouter (Kimi K2.5)
├── ClawHub Skills
│   ├── monad-development (wallet ops, contract deploy, verify)
│   └── nadfun-token-creation (token launch on Nad.fun)
├── Custom Tools (FORGOOD-specific)
│   ├── evaluateMission → calls backend /auto-evaluate
│   ├── verifyProof → calls backend /auto-verify
│   ├── activateMission → calls backend /activate
│   ├── rewardMission → calls backend /reward
│   └── listMissions → calls backend /missions
└── SSH tunnel for Control UI access
```

### 7.2 Detailed Setup Steps

#### Step 1: EC2 Instance Provisioning
1. Sign into AWS Console → EC2 → Launch Instance.
2. **Name:** `forgood-agent`
3. **AMI:** Ubuntu 24.04 LTS
4. **Instance type:** `c7i-flex.large` (4 GiB RAM, free-tier eligible)
5. **Key pair:** Create RSA key, download `.pem` file, `chmod 400 key.pem`
6. **Security group:** Allow SSH (port 22) from your IP only. No other inbound rules.
7. **Storage:** 20 GB (default)
8. Launch and note Public IPv4.

#### Step 2: SSH and System Setup
```bash
ssh -i <key.pem> ubuntu@<public-ip>

# System updates
sudo apt update && sudo apt upgrade -y

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version   # v22.x.x
npm --version    # 10.x.x

# Install pnpm
npm install -g pnpm@latest

# Install Foundry (for contract interactions via cast)
curl -L https://foundry.paradigm.xyz | bash
source ~/.bashrc
foundryup

# Verify
forge --version  # forge 1.5.x
cast --version   # cast 1.5.x

# Install Docker + Docker Compose (for Postgres)
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
# Log out and back in for group change
```

#### Step 3: Install OpenClaw
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

**Onboarding prompts (recommended answers):**
- Model provider: **OpenRouter**
- API Key: Enter your `OPENROUTER_API_KEY`
- Default model: `moonshotai/kimi-k2.5`
- Channel: **Telegram**
- Bot token: (from Step 4)
- Skills setup: **Yes**
- Node manager: **npm**
- Hooks: **Skip**
- Final step: **Hatch in TUI**

#### Step 4: Telegram Bot Setup
1. Visit https://telegram.me/BotFather
2. `/newbot`
3. Name: `FORGOOD Agent`
4. Username: `forgood_agent_bot` (must be unique)
5. Copy bot token → paste into OpenClaw during onboard
6. In SSH terminal: `openclaw pairing approve telegram <pairing-code>`

#### Step 5: Install ClawHub Skills
```bash
npm install -g clawhub
clawhub install monad-development
clawhub install nadfun-token-creation
```

Restart OpenClaw session so skills load.

#### Step 6: Custom FORGOOD Skill

Create `~/.openclaw/skills/forgood/SKILL.md`:

```markdown
# FORGOOD Agent Skill

You are the FORGOOD autonomous agent. You manage public-good missions on the Monad blockchain.

## API Base
FORGOOD_API_URL: http://localhost:4000

## Available Tools

### listMissions
GET ${FORGOOD_API_URL}/missions
Returns all missions sorted by newest first.

### getMission
GET ${FORGOOD_API_URL}/missions/{id}
Returns a single mission with its proofs.

### proposeMission
POST ${FORGOOD_API_URL}/missions
Body: { title, description, category, location?, proposer }
Creates a new public-good mission proposal.

### evaluateMission
POST ${FORGOOD_API_URL}/missions/{id}/auto-evaluate
AI evaluates difficulty, impact, and calculates fair reward.

### activateMission
POST ${FORGOOD_API_URL}/missions/{id}/activate
Activates an evaluated mission so proof can be submitted.

### submitProof
POST ${FORGOOD_API_URL}/missions/{id}/submit-proof
Body: { submitter, proofUri, note? }
Submits proof of mission completion.

### verifyProof
POST ${FORGOOD_API_URL}/missions/{id}/auto-verify
AI vision verifies the submitted proof.

### rewardMission
POST ${FORGOOD_API_URL}/missions/{id}/reward
Triggers on-chain $FORGOOD token reward payout.

### getTreasury
GET ${FORGOOD_API_URL}/treasury
Returns current treasury balance.

## Behavior Guidelines
- Always confirm with the user before triggering reward payouts.
- Report AI confidence scores when sharing verification results.
- If proof verification confidence < 0.7, suggest manual review.
- Format token amounts in human-readable form (e.g., "0.35 FORGOOD" not wei).
```

#### Step 7: Deploy FORGOOD Backend on EC2
```bash
# Clone repo (or scp from local)
git clone <FORGOOD_REPO_URL> ~/forgood
cd ~/forgood

# Install dependencies
pnpm install

# Setup env
cp apps/api/.env.example apps/api/.env
# Edit with real values: DATABASE_URL, OPENROUTER_API_KEY, MONAD_RPC_URL, etc.

# Start Postgres
docker compose up -d

# Run migrations
pnpm --filter @forgood/api prisma:generate
pnpm --filter @forgood/api exec prisma migrate deploy

# Start API with pm2 (persistent)
npm install -g pm2
cd apps/api
pm2 start "pnpm dev" --name forgood-api
pm2 save
```

#### Step 8: Access Control UI
```bash
# From LOCAL machine (not EC2):
ssh -i <key.pem> -N -L 18789:127.0.0.1:18789 ubuntu@<public-ip>

# On EC2:
openclaw dashboard --no-open
# Copy URL: https://127.0.0.1:18789/?token=<gateway-token>
# Open in local browser
```

### 7.3 Tasks

| # | Task | Priority |
|---|------|----------|
| 7.3.1 | Provision EC2 instance (c7i-flex-large, Ubuntu 24.04) | P0 |
| 7.3.2 | SSH in and install Node 22, pnpm, Foundry, Docker | P0 |
| 7.3.3 | Install OpenClaw + configure with OpenRouter API key | P0 |
| 7.3.4 | Create Telegram bot via @BotFather | P0 |
| 7.3.5 | Pair Telegram bot with OpenClaw | P0 |
| 7.3.6 | Install `monad-development` ClawHub skill | P0 |
| 7.3.7 | Install `nadfun-token-creation` ClawHub skill | P0 |
| 7.3.8 | Create custom FORGOOD skill file (`~/.openclaw/skills/forgood/SKILL.md`) | P0 |
| 7.3.9 | Deploy FORGOOD backend API on EC2 (Docker Compose + pm2) | P0 |
| 7.3.10 | Test Telegram → OpenClaw → FORGOOD API flow end-to-end | P0 |
| 7.3.11 | Setup SSH tunnel for Control UI | P1 |
| 7.3.12 | Add systemd service for OpenClaw daemon persistence | P1 |
| 7.3.13 | Optional: Add Discord channel | P2 |

### 7.4 Self-Verification Checklist

```bash
# 1. OpenClaw is running
curl http://127.0.0.1:18789/health
# Expected: 200 OK

# 2. Telegram bot responds
# Send "hello" to @forgood_agent_bot on Telegram
# Expected: AI response

# 3. ClawHub skills loaded
openclaw skills list
# Expected: monad-development, nadfun-token-creation listed

# 4. Custom tool works via Telegram
# Send: "List all FORGOOD missions"
# Expected: Bot calls /missions and returns formatted list

# 5. Full agentic flow via Telegram
# Send: "Evaluate mission <ID>"
# Expected: Bot calls /auto-evaluate, returns difficulty/impact/reward summary

# 6. OpenClaw models status
openclaw models status
# Expected: moonshotai/kimi-k2.5 shown as active model

# 7. Backend API accessible from OpenClaw
curl -s http://localhost:4000/health
# Expected: { "ok": true }
```

---

## Phase 8: Moltbook Social Integration

**Status:** 🔲 Not started. Optional but adds hackathon visibility.

### 8.1 Purpose

Register the FORGOOD agent on Moltbook (social network for AI agents) to:
- Post mission summaries and completions.
- Engage with the Moltiverse hackathon community.
- Build karma and social proof for the agent.

### 8.2 Registration Flow

```bash
# 1. Register agent
curl -X POST https://www.moltbook.com/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{"name": "ForgoodAgent", "description": "The Autonomous Agent for Collective Social Impact on Monad"}'
# Save api_key immediately!

# 2. Have human claim via tweet
# Visit claim_url from registration response

# 3. Create forgood submolt
curl -X POST https://www.moltbook.com/api/v1/submolts \
  -H "Authorization: Bearer $MOLTBOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "forgood", "display_name": "FORGOOD Missions", "description": "Public-good missions powered by AI + Monad"}'
```

### 8.3 Tasks

| # | Task | Priority |
|---|------|----------|
| 8.3.1 | Register FORGOOD agent on Moltbook | P2 |
| 8.3.2 | Have human owner claim via tweet verification | P2 |
| 8.3.3 | Create `forgood` submolt community | P2 |
| 8.3.4 | Add heartbeat integration to post mission completions | P2 |
| 8.3.5 | Post initial announcement about $FORGOOD | P2 |

### 8.4 Self-Verification

```bash
# 1. Agent registered and claimed
curl https://www.moltbook.com/api/v1/agents/status \
  -H "Authorization: Bearer $MOLTBOOK_API_KEY"
# Expected: {"status": "claimed"}

# 2. Post visible on Moltbook
curl "https://www.moltbook.com/api/v1/posts?sort=new&limit=1" \
  -H "Authorization: Bearer $MOLTBOOK_API_KEY"
# Expected: FORGOOD post in results
```

---

## Phase 9: Frontend — Next.js + Tailwind + RainbowKit

**Status:** ✅ Basic scaffold exists. Needs full mission lifecycle UI.

### 9.1 Current State

| Page | Status | Description |
|------|--------|-------------|
| `/` (Home) | ✅ | Hero/branding + mission list |
| Wallet connect | ✅ | RainbowKit with Monad testnet |
| `MissionList` component | ✅ | Basic list from API |

### 9.2 New Pages/Components Needed

| Page/Component | Description | Priority |
|---|---|---|
| `/missions` | Full mission feed with status filters, search, pagination | P0 |
| `/missions/[id]` | Mission detail: description, AI scores, proof, status timeline, reward | P0 |
| `/missions/new` | Propose mission form (connected wallet auto-fills proposer) | P0 |
| `/missions/[id]/submit-proof` | Proof submission form (image URL + note) | P0 |
| `/treasury` | Treasury balance, recent payouts, token market info from Nad.fun | P1 |
| `/leaderboard` | Top mission completers by reward earned | P2 |
| `StatusBadge` | Colored badge for each mission status | P0 |
| `MissionCard` | Card with title, category, reward, status, timestamp | P0 |
| `MissionTimeline` | Visual timeline showing status transitions | P1 |
| `ProofViewer` | Image viewer with AI verdict overlay | P1 |
| `TreasuryWidget` | Compact balance + Nad.fun token price | P1 |
| `TokenPriceChart` | Mini chart from Nad.fun OHLCV data | P2 |

### 9.3 Tasks

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 9.3.1 | Create `StatusBadge` component with color-coded statuses | `apps/web/components/StatusBadge.tsx` | P0 |
| 9.3.2 | Create `MissionCard` component | `apps/web/components/MissionCard.tsx` | P0 |
| 9.3.3 | Build `/missions` page with API fetch + status filters | `apps/web/app/missions/page.tsx` | P0 |
| 9.3.4 | Build `/missions/[id]` detail page with full mission info | `apps/web/app/missions/[id]/page.tsx` | P0 |
| 9.3.5 | Build `/missions/new` proposal form (wallet-connected) | `apps/web/app/missions/new/page.tsx` | P0 |
| 9.3.6 | Build proof submission page with image URL input | `apps/web/app/missions/[id]/submit-proof/page.tsx` | P0 |
| 9.3.7 | Add treasury dashboard page | `apps/web/app/treasury/page.tsx` | P1 |
| 9.3.8 | Add real-time status polling (5s interval for active missions) | `apps/web/hooks/useMission.ts` | P1 |
| 9.3.9 | Mobile-responsive layout for all pages | — | P1 |
| 9.3.10 | Add Nad.fun token price widget | `apps/web/components/TokenPrice.tsx` | P2 |
| 9.3.11 | Add toast notifications for state changes | — | P2 |

### 9.4 Self-Verification Checklist

```bash
# 1. Dev server starts without errors
pnpm --filter @forgood/web dev
# Expected: http://localhost:3000 loads

# 2. Wallet connects to Monad testnet
# Click "Connect Wallet" → MetaMask/Rabby → Monad Testnet (10143)

# 3. Mission list loads from API
# Navigate to /missions → see list of missions from backend

# 4. Create mission flow
# /missions/new → fill form → submit → see new mission in list

# 5. Mission detail shows all fields
# Click a mission → see title, description, AI scores, status, proof

# 6. Proof submission works
# Navigate to mission detail → "Submit Proof" → enter image URL → submit

# 7. Production build succeeds
pnpm --filter @forgood/web build
# Expected: no errors, .next/ directory created
```

---

## Phase 10: Proof Storage and Media Pipeline

**Status:** 🔲 Not started. Currently proofs are URLs only.

### 10.1 Strategy for Hackathon

| Option | Approach | Priority |
|--------|----------|----------|
| **URL-only (current)** | Accept `proofUri` as external URL. Simplest. | ✅ MVP |
| **Local upload** | `@fastify/multipart` → save to `/uploads/` → serve via static route | P2 |
| **S3/Cloudflare R2** | Upload to S3-compatible storage | P3 (post-hackathon) |

### 10.2 Tasks

| # | Task | Priority |
|---|------|----------|
| 10.2.1 | Keep URL-only approach for MVP | P0 (done) |
| 10.2.2 | Add image upload endpoint to API (`POST /upload`) | P2 |
| 10.2.3 | Serve uploaded files via static route | P2 |
| 10.2.4 | Frontend: drag-and-drop upload component | P2 |

### 10.3 Self-Verification

```bash
# 1. URL-only proof works end-to-end
curl -s -X POST http://127.0.0.1:4010/missions/$ID/submit-proof \
  -H 'content-type: application/json' \
  -d '{"submitter":"0x222...","proofUri":"https://images.unsplash.com/photo-example","note":"test"}'
# Expected: 200, proof created

# 2. Vision AI can read the proof URL
curl -s -X POST http://127.0.0.1:4010/missions/$ID/auto-verify -H 'content-type: application/json' -d '{}'
# Expected: verdict + confidence + evidence
```

---

## Phase 11: End-to-End Integration Testing

**Status:** ✅ Smoke test exists. Needs full on-chain E2E.

### 11.1 Test Scenarios

#### Scenario A: Happy Path (Full Lifecycle)

```
1. POST /missions → create "Park Cleanup" mission
2. POST /missions/:id/auto-evaluate → AI: difficulty=6, impact=8, reward=5e17
3. POST /missions/:id/activate → status = active
4. POST /missions/:id/submit-proof → submitter uploads park cleanup photo
5. POST /missions/:id/auto-verify → AI approves (confidence=0.85)
6. POST /missions/:id/reward → on-chain tx releases 0.5 FORGOOD to submitter
7. GET /missions/:id → status = rewarded, onchainTxHash set
8. Verify on explorer: tx shows FORGOOD token transfer
```

#### Scenario B: AI Rejection + Manual Override

```
1-4. Same as Scenario A
5. POST /missions/:id/auto-verify → AI rejects (irrelevant proof)
6. GET /missions/:id → status = rejected
7. POST /missions/:id/verify → manual: {verdict:"approved",confidence:0.6,evidence:["override"]}
8. POST /missions/:id/reward → payout succeeds
```

#### Scenario C: Insufficient Treasury

```
1-5. Same as Scenario A (but reward > treasury balance)
6. POST /missions/:id/reward → reverts with "InsufficientBalance"
7. Top up treasury with more tokens
8. POST /missions/:id/reward → succeeds
```

#### Scenario D: OpenClaw Telegram Flow

```
1. User messages bot: "Propose a mission: Clean the beach at Bondi"
2. Agent calls POST /missions → returns mission ID
3. Agent calls POST /missions/:id/auto-evaluate → returns evaluation
4. Agent responds: "Mission evaluated! Difficulty: 6, Impact: 8, Reward: 0.48 FORGOOD"
5. User: "Activate mission <ID>"
6. Agent calls POST /missions/:id/activate → confirmed
7. (User submits proof via web UI)
8. User: "Verify proof for mission <ID>"
9. Agent calls POST /missions/:id/auto-verify → verdict: approved
10. Agent: "Proof approved (confidence: 0.87)! Sending reward..."
11. Agent calls POST /missions/:id/reward → tx hash returned
12. Agent: "Reward sent! 0.48 FORGOOD → 0x2222... Tx: https://testnet.monadvision.com/tx/0x..."
```

### 11.2 Tasks

| # | Task | Priority |
|---|------|----------|
| 11.2.1 | Enhance `apps/api/scripts/smoke-test.mjs` with on-chain assertions | P0 |
| 11.2.2 | Add Scenario A as automated E2E test | P0 |
| 11.2.3 | Add Scenario B (rejection + manual override) | P1 |
| 11.2.4 | Add Scenario C (insufficient treasury) | P1 |
| 11.2.5 | Manual walkthrough of Scenario D (Telegram) at least 3 times | P0 |
| 11.2.6 | Add Foundry integration test: full lifecycle on-chain | P1 |

### 11.3 Self-Verification

```bash
# 1. Existing smoke test passes
pnpm test:api:smoke
# Expected: all steps pass

# 2. Contract tests pass
cd packages/contracts && forge test -vvv
# Expected: all green

# 3. Full E2E on testnet
# Run enhanced smoke test against testnet API with real contracts
# Expected: tx hash visible on explorer

# 4. Telegram flow works manually
# Walk through Scenario D — all 12 steps succeed
```

---

## Phase 12: Observability, Security, and Hardening

### 12.1 Observability

| Item | Implementation | Priority |
|------|---------------|----------|
| Structured logging | Fastify pino logger (already configured) | ✅ Done |
| Request IDs | `x-request-id` header propagation | P2 |
| AI call logging | Log model, token count, latency for each OpenRouter call | P1 |
| On-chain tx logging | Log tx hash, gas used, block number for every write | P1 |
| Health monitoring | `/health` endpoint + external uptime check | P2 |

### 12.2 Security

| Item | Implementation | Priority |
|------|---------------|----------|
| API key auth for admin routes | Bearer token for evaluate, verify, reward | P1 |
| Rate limiting | `@fastify/rate-limit` — 100 req/min public, 10 req/min AI | P1 |
| Input sanitization | Zod already enforces; add HTML escaping for text fields | P2 |
| Secret management | `.env` files + EC2 env vars via systemd | P0 |
| Private key safety | Cast keystore for deploy; env var for agent wallet | P0 |
| `AUTO_PAYOUT=false` default | Prevents accidental mainnet payouts | ✅ Done |
| OpenClaw gateway | Bind to `127.0.0.1` only; SSH tunnel for remote access | P0 |

### 12.3 Tasks

| # | Task | Priority |
|---|------|----------|
| 12.3.1 | Add `@fastify/rate-limit` to API | P1 |
| 12.3.2 | Add bearer token auth middleware for admin routes | P1 |
| 12.3.3 | Ensure OpenClaw binds to localhost only | P0 |
| 12.3.4 | Rotate any accidentally exposed keys | P0 |
| 12.3.5 | Verify `.gitignore` covers all `.env`, `.pem`, keystore files | P0 |
| 12.3.6 | Add AI call latency + token count logging | P1 |

### 12.4 Self-Verification

```bash
# 1. Rate limiter active
for i in $(seq 1 110); do curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4010/health; done
# Expected: 429 responses after ~100 requests

# 2. No secrets in git history
git log --all --diff-filter=A --name-only | xargs grep -l "PRIVATE_KEY\|API_KEY\|SECRET" 2>/dev/null
# Expected: no matches (or only .env.example files)

# 3. OpenClaw not publicly accessible
curl -s http://<EC2_PUBLIC_IP>:18789/health
# Expected: connection refused (port closed in security group)

# 4. .gitignore is comprehensive
cat .gitignore | grep -E "\.env|\.pem|keystore"
# Expected: patterns present
```

---

## Phase 13: Demo Script and Hackathon Delivery

### 13.1 Demo Script (3–5 minutes)

```
[0:00] INTRO — "$FORGOOD: The Autonomous Agent for Collective Social Impact"

[0:15] PROBLEM — "Public good work is underfunded and unverifiable."

[0:30] SOLUTION — "An AI agent evaluates missions, verifies proof with vision,
       and pays rewards instantly on Monad."

[0:45] TOKEN — Show $FORGOOD on Nad.fun. "Community owns the economy."

[1:00] DEMO START — Open Telegram. Message bot:
       "Propose a mission: Clean up trash at Riverside Park"

[1:15] EVALUATION — Bot responds with AI evaluation:
       "Difficulty: 5, Impact: 7, Reward: 0.35 FORGOOD"

[1:30] ACTIVATION — "Activate mission <ID>" → Bot confirms: "Mission is now active!"

[1:45] PROOF — Switch to web UI. Upload proof photo.
       "Here's the before/after of the cleanup."

[2:00] VERIFICATION — Bot auto-verifies: "Proof approved! Confidence: 0.87"

[2:15] REWARD — Bot sends on-chain reward:
       "Reward sent! 0.35 FORGOOD → 0x2222...
        Tx: https://testnet.monadvision.com/tx/0x..."

[2:30] EXPLORER — Show tx on MonadVision. Token transfer confirmed in 800ms.

[2:45] TREASURY — Show treasury dashboard. Balance decreased by reward amount.

[3:00] ARCHITECTURE — Quick overview diagram:
       "Monad for speed, Kimi K2.5 for intelligence, OpenClaw for autonomy,
        Nad.fun for community economy."

[3:15] WRAP — "The agent is autonomous, the economy is community-owned,
       and every mission makes the world a little better."
```

### 13.2 Pre-Demo Checklist

- [ ] EC2 instance running with OpenClaw + backend API.
- [ ] Telegram bot paired and responding.
- [ ] At least 3 seed missions in DB (environment, open-source, community).
- [ ] Treasury funded with ≥100 FORGOOD tokens.
- [ ] Frontend deployed and accessible (Vercel or EC2 + nginx).
- [ ] Browser tabs ready: Telegram, web UI, MonadVision explorer.
- [ ] Screen recording software ready.
- [ ] Internet connection stable.
- [ ] Dry-run completed at least 3 times.

### 13.3 Submission Artifacts

| Artifact | Requirement | Status |
|----------|-------------|--------|
| GitHub repo | Public or shared with judges | 🔲 |
| Demo video | 3–5 min recording of full lifecycle | 🔲 |
| Live URL | Frontend accessible | 🔲 |
| Telegram bot | `@forgood_agent_bot` accessible | 🔲 |
| Token address | $FORGOOD on Nad.fun (testnet/mainnet) | 🔲 |
| Contract addresses | Treasury + Registry on Monad | 🔲 |

### 13.4 Tasks

| # | Task | Priority |
|---|------|----------|
| 13.4.1 | Seed 3 demo missions (environment, open-source, community) | P0 |
| 13.4.2 | Prepare 3 proof images (real or curated stock photos) | P0 |
| 13.4.3 | Fund treasury with test FORGOOD tokens | P0 |
| 13.4.4 | Do 3 full dry-run rehearsals | P0 |
| 13.4.5 | Record demo video | P0 |
| 13.4.6 | Deploy frontend to Vercel (or EC2 + nginx) | P0 |
| 13.4.7 | Write submission description for Moltiverse form | P0 |
| 13.4.8 | Submit via https://forms.moltiverse.dev/submit before Feb 15 23:59 ET | P0 |

---

## Phase 14: Open Questions and Risk Register

### 14.1 Open Questions

| # | Question | Impact | Decision Needed By |
|---|----------|--------|-------------------|
| 1 | **Testnet vs Mainnet for Nad.fun token?** Agent+Token track may require mainnet launch for the "highest market cap" liquidity boost prize ($40K). | High | Before token launch |
| 2 | **Reward formula:** Fixed table based on `difficulty × impact`, or dynamic based on treasury balance? | Medium | Before Phase 5 prompt refinement |
| 3 | **Who can propose missions?** Anyone with a wallet, or DAO-gated? | Low (hackathon: anyone) | Post-hackathon |
| 4 | **Proof verification threshold:** Auto-payout at confidence ≥ 0.7, or always require manual approval? | Medium | Before demo rehearsal |
| 5 | **Frontend hosting:** Vercel (free, fast, automatic) vs EC2 + nginx (co-located with API)? | Low | Before Phase 13 |
| 6 | **OpenClaw primary model:** Kimi K2.5 for everything, or Anthropic for conversation + Kimi for tools? | Medium | During Phase 7 setup |

### 14.2 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OpenRouter rate limits or downtime for Kimi K2.5 | Medium | High | Manual fallback routes in API; test with backup model (`meta-llama/llama-4-scout`) |
| Nad.fun testnet API instability | Low | High | Cache token address; have manual deploy path; pre-record token launch |
| EC2 instance quota / billing surprise | Low | Medium | Use free-tier; set billing alerts at $10 |
| Monad testnet congestion | Low | Low | Use multiple RPC fallbacks (rpc1, rpc2, rpc3) |
| Proof images too large / slow for vision | Medium | Medium | Resize client-side; 30s timeout on vision calls |
| Hackathon deadline pressure | High | High | Prioritize P0 tasks ruthlessly; cut P2 features first |
| Private key exposure in commits/logs | Low | Critical | Use keystore; env vars only; never log keys; `.gitignore` |
| Kimi K2.5 returns malformed JSON | Medium | Medium | `extractJson()` fallback + Zod validation already handle this |

---

## Execution Priority Matrix

### P0 — Must-Have (Without these, no demo)

1. ✅ Monorepo scaffolding + typecheck
2. ✅ Smart contracts written + tested locally
3. 🔲 Deploy contracts to Monad testnet
4. 🔲 Launch $FORGOOD token on Nad.fun
5. 🔲 Fund treasury with tokens
6. ✅ Backend API with full mission lifecycle
7. ✅ AI evaluation + vision verification via Kimi K2.5
8. 🔲 On-chain reward payout working E2E
9. 🔲 OpenClaw on AWS + Telegram bot
10. 🔲 Frontend: mission list, detail, create, proof submit
11. 🔲 Demo video + hackathon submission

### P1 — Should-Have (Makes demo compelling)

12. 🔲 On-chain write-through for full lifecycle (not just reward)
13. 🔲 Nad.fun market data in UI
14. 🔲 Rate limiting + basic auth on admin routes
15. 🔲 Mobile-responsive frontend
16. 🔲 AI retry logic with exponential backoff
17. 🔲 Real-time mission status polling

### P2 — Nice-to-Have (Polish)

18. 🔲 Moltbook social integration
19. 🔲 Image upload to local storage
20. 🔲 Leaderboard page
21. 🔲 GitHub Actions CI
22. 🔲 Toast notifications
23. 🔲 Token price chart from Nad.fun

---

## Quick Command Reference

```bash
# ===== Development =====
pnpm install                              # Install all dependencies
pnpm typecheck                            # Type-check all packages
pnpm lint                                 # Lint all packages
pnpm doctor                               # Environment diagnostics

# ===== Database =====
pnpm test:stack:up                        # Start Postgres (Docker)
pnpm test:stack:down                      # Stop Postgres
pnpm --filter @forgood/api prisma:generate # Generate Prisma client
pnpm --filter @forgood/api exec prisma migrate deploy # Run migrations

# ===== API =====
pnpm --filter @forgood/api dev            # Dev server (port 4000)
pnpm --filter @forgood/api dev:test       # Test profile (port 4010)
pnpm test:api:smoke                       # Full smoke test

# ===== Frontend =====
pnpm --filter @forgood/web dev            # Dev server (port 3000)
pnpm --filter @forgood/web build          # Production build

# ===== Contracts =====
cd packages/contracts
forge test -vvv                           # Run all tests
forge test --match-test testLifecycle -vvv # Run specific test
forge script script/Deploy.s.sol:Deploy --rpc-url $MONAD_RPC_URL --broadcast --account monad-deployer

# ===== OpenClaw (on EC2) =====
openclaw gateway --port 18789             # Start gateway
openclaw models status                    # Check active models
openclaw skills list                      # List installed skills
clawhub install monad-development         # Install Monad skill
clawhub install nadfun-token-creation     # Install Nad.fun skill

# ===== Monad Chain Queries =====
cast call $TREASURY "balanceOf(address)" $TREASURY --rpc-url https://testnet-rpc.monad.xyz
cast wallet address --account monad-deployer
```

---

## Environment Variables Reference

### `apps/api/.env`

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/forgood

# Server
PORT=4000

# OpenRouter AI
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=moonshotai/kimi-k2.5
OPENROUTER_MODEL_VISION=moonshotai/kimi-k2.5
OPENROUTER_REFERER=https://forgood.xyz
OPENROUTER_TITLE=FORGOOD

# Monad Chain
MONAD_RPC_URL=https://testnet-rpc.monad.xyz

# On-chain payout
AUTO_PAYOUT=false
AGENT_PRIVATE_KEY=0x...           # Only when AUTO_PAYOUT=true
TREASURY_ADDRESS=0x...            # ForGoodTreasury contract
FORGOOD_TOKEN_ADDRESS=0x...       # $FORGOOD ERC-20 (MockToken or Nad.fun token)
REGISTRY_ADDRESS=0x...            # MissionRegistry contract

# Nad.fun (optional)
NAD_API_KEY=nadfun_...
NAD_API_URL=https://dev-api.nad.fun
```

### `apps/web/.env`

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-project-id
```

### `packages/contracts/.env`

```env
DEPLOYER_PRIVATE_KEY=0x...
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
FORGOOD_TOKEN_ADDRESS=0x...
AUTHORIZED_AGENT=0x...
```

---

*Last updated: 2026-02-08. This plan is a living document — update status markers as tasks complete.*

