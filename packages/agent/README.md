# @forgood/agent

AI system prompts and strict response parsers for the FORGOOD autonomous evaluator/verifier. This package defines **what the AI does and how its output is validated** — it is model-agnostic and works with any OpenRouter-compatible LLM.

## Quick Start

```typescript
import {
  evaluationSystemPrompt,
  proofSystemPrompt,
  parseEvaluation,
  parseProofVerification,
} from "@forgood/agent";
```

## What's Inside (`src/index.ts`, ~109 lines)

### System Prompts

#### `evaluationSystemPrompt`

Instructs the AI to evaluate a public-good mission proposal. The prompt embeds:
- Difficulty scale (1–10) with concrete examples per tier
- Impact scale (1–10) from individual to global scope
- Reward formula: `difficulty × impact × BASE_MULTIPLIER`, clamped to `[MIN_WEI, MAX_WEI]`
- Recognised categories from `@forgood/shared`
- Confidence calibration guidelines (0.9+ = clear, <0.4 = likely spam)

Expected AI output: `{ difficulty, impact, confidence, reward, rationale }`

#### `proofSystemPrompt`

Instructs the AI (with vision) to verify submitted proof of mission completion. The prompt embeds:
- Verification criteria (direct evidence, plausibility, category match, effort signals)
- Decision thresholds from `CONFIDENCE` constants
- Strictness rules (selfie-only insufficient, screenshot downweight, before/after strong)

Expected AI output: `{ verdict: "approved"|"rejected"|"needs_review", confidence, evidence[] }`

### Parsers

| Function | Input | Output | Validation |
|----------|-------|--------|------------|
| `parseEvaluation(json)` | Unknown (AI output) | `MissionEvaluation` | Zod `MissionEvaluationSchema.parse()` + numeric reward conversion |
| `parseProofVerification(json)` | Unknown (AI output) | `ProofVerification` | Zod `ProofVerificationSchema.parse()` |

Both parsers will **throw** a Zod error if the AI response doesn't match the schema — the API catches this and returns a 502.

### Re-exports

For convenience, this package re-exports from `@forgood/shared`:
- `CATEGORIES`, `CONFIDENCE`, `REWARD`, `computeReward`

## Architecture

```
┌─────────────────────────────────┐
│  @forgood/agent                 │
│  ┌───────────────────────────┐  │
│  │ evaluationSystemPrompt    │──│──→ openrouter.ts → evaluateMission()
│  │ proofSystemPrompt         │──│──→ openrouter.ts → verifyProof()
│  │ parseEvaluation()         │──│──→ validates AI JSON → typed result
│  │ parseProofVerification()  │──│──→ validates AI JSON → typed result
│  └───────────────────────────┘  │
│         ↕ imports                │
│  @forgood/shared (schemas)      │
└─────────────────────────────────┘
```

## Dependencies

- `@forgood/shared` — schemas, constants, types
- `zod` (transitive via shared)

