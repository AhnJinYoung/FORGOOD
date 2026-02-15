# @forgood/shared

Canonical Zod schemas, TypeScript types, constants, and utility helpers shared across the entire monorepo. This is the **single source of truth** for data shapes — API validation, AI response parsing, and frontend rendering all reference these definitions.

## Quick Start

```bash
# imported in other workspace packages
import { MissionProposalSchema, REWARD, CONFIDENCE, formatReward } from "@forgood/shared";
```

## What's Inside (`src/index.ts`, ~200 lines)

### Constants

```typescript
MONAD_TESTNET_CHAIN_ID  // 10143
MONAD_MAINNET_CHAIN_ID  // 143
MONAD_TESTNET_RPC       // "https://testnet-rpc.monad.xyz"
MONAD_MAINNET_RPC       // "https://rpc.monad.xyz"
MONAD_EXPLORER_TESTNET  // "https://testnet.monadvision.com"
```

### Confidence Thresholds

```typescript
CONFIDENCE = {
  AUTO_APPROVE: 0.7,   // ≥ 0.7 → auto-approve proof
  MANUAL_REVIEW: 0.5,  // 0.5–0.7 → needs human review
  AUTO_REJECT: 0.5,    // < 0.5 → auto-reject
}
```

### Reward Formula

```typescript
REWARD = {
  MIN_WEI: 10000000000000000n,       // 0.01 FORGOOD
  MAX_WEI: 10000000000000000000n,     // 10 FORGOOD
  BASE_MULTIPLIER: 10000000000000000n, // 1e16
  DECIMALS: 18,
}
// reward = clamp(difficulty × impact × BASE_MULTIPLIER, MIN, MAX)
```

### Categories

```typescript
CATEGORIES = ["environment", "education", "community", "open-source", "health", "infrastructure", "other"]
```

### Zod Schemas

| Schema | Purpose | Used by |
|--------|---------|---------|
| `MissionProposalSchema` | Validate mission creation input | API `POST /missions` |
| `MissionEvaluationSchema` | Validate AI evaluation output | Agent parser, API evaluate route |
| `ProofSubmissionSchema` | Validate proof upload input | API submit-proof route |
| `ProofVerificationSchema` | Validate AI verification output | Agent parser, API verify route |
| `MissionResponseSchema` | Shape of mission API response | Frontend type safety |
| `MissionStatus` | Enum of lifecycle states | API, Prisma, Frontend |

### Utility Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `formatReward` | `(weiStr) → string` | `"500000000000000000" → "0.5"` |
| `computeReward` | `(difficulty, impact) → bigint` | Reward formula with min/max clamp |
| `resolveVerdict` | `(verdict, confidence) → string` | Apply confidence thresholds to AI verdict |
| `serializeBigInts` | `(obj) → Record` | Safe BigInt → string for JSON |

## Type Exports

```typescript
type Category          // "environment" | "education" | ...
type MissionStatus     // "proposed" | "evaluated" | "active" | ...
type MissionProposal   // { title, description, category, location?, proposer }
type MissionEvaluation // { difficulty, impact, confidence, reward, rationale }
type ProofSubmission   // { missionId, submitter, proofUri, note? }
type ProofVerification // { verdict, confidence, evidence[] }
type MissionResponse   // Full mission object shape for API responses
```

## Dependency Graph

```
@forgood/shared ← @forgood/agent (imports schemas, constants, types)
@forgood/shared ← @forgood/api   (imports schemas, constants, utility fns)
@forgood/shared ← apps/web       (via API response types)
```

This package has **zero external dependencies** beyond `zod`.
