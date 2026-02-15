# FORGOOD Contracts

Solidity smart contracts for the FORGOOD on-chain reward system, built with Foundry and targeting **Monad** (EVM, Prague fork, Solidity 0.8.24).

## Architecture

```
                   ┌──────────────────┐
                   │   MockToken      │  ERC-20 (FORGOOD token)
                   │   (or real ERC20)│
                   └────────┬─────────┘
                            │ holds tokens
                   ┌────────▼─────────┐
   owner ────────→ │ ForGoodTreasury  │  Token vault + reward release
   agent ────────→ │                  │  releaseReward(recipient, amount)
   registry ─────→ │                  │  authorized callers only
                   └────────┬─────────┘
                            │ calls releaseReward()
                   ┌────────▼─────────┐
   owner ────────→ │ MissionRegistry  │  On-chain mission state machine
   agent ────────→ │                  │  7-state lifecycle
   anyone ───────→ │  proposeMission  │  permissionless proposal
                   │  submitProof     │  permissionless proof
                   └──────────────────┘
```

## Contracts

### `MockToken.sol` (30 lines)
Minimal ERC-20 for testing. Public `mint()` — no access control. Name/symbol: FORGOOD, 18 decimals.

### `ForGoodTreasury.sol` (88 lines)
Holds FORGOOD tokens and releases rewards. Two authorized callers:
- `authorizedAgent` — the AI agent wallet (set at construction)
- `authorizedRegistry` — the MissionRegistry contract (set post-deploy)

Key functions:
| Function | Access | Purpose |
|----------|--------|---------|
| `releaseReward(recipient, amount)` | agent or registry | Transfer tokens to mission completer |
| `emergencyWithdraw(recipient, amount)` | owner only | Safety hatch |
| `setAuthorizedAgent(agent)` | owner only | Rotate agent key |
| `setAuthorizedRegistry(registry)` | owner only | Wire registry |
| `setToken(token)` | owner only | Update token address |

### `MissionRegistry.sol` (155 lines)
On-chain mission state machine. Mirrors the API's Postgres state machine.

Status enum: `Proposed → Evaluated → Active → ProofSubmitted → Verified|Rejected → Rewarded`

Key functions:
| Function | Access | State Transition |
|----------|--------|------------------|
| `proposeMission(metadataHash)` | anyone | → Proposed |
| `evaluateMission(missionId, rewardAmount)` | agent | Proposed → Evaluated |
| `activateMission(missionId)` | agent | Evaluated → Active |
| `submitProof(missionId, proofHash)` | anyone | Active → ProofSubmitted |
| `verifyMission(missionId, approved)` | agent | ProofSubmitted → Verified/Rejected |
| `rewardMission(missionId)` | agent | Verified → Rewarded (calls treasury) |

## Deploy Script (`script/Deploy.s.sol`)

Deploys the full stack in order:
1. MockToken (or use existing via `FORGOOD_TOKEN_ADDRESS`)
2. ForGoodTreasury(token, agent)
3. MissionRegistry(treasury, agent)
4. Wire: `treasury.setAuthorizedRegistry(registry)`
5. Mint 1M FORGOOD to treasury (if MockToken)

```bash
source .env
forge script script/Deploy.s.sol:Deploy --rpc-url "$MONAD_RPC_URL" --broadcast
```

Required env vars:
- `DEPLOYER_PRIVATE_KEY`
- `AUTHORIZED_AGENT` — address of AI agent wallet
- `FORGOOD_TOKEN_ADDRESS` (optional, deploys MockToken if unset)

**Critical post-deploy step**: The script wires `treasury.setAuthorizedRegistry(registry)` automatically. Without this, `rewardMission()` would revert with `Unauthorized`.

## Tests (`test/MissionRegistry.t.sol`)

Full lifecycle happy-path test + edge cases:
- `testLifecycleHappyPath()` — propose → evaluate → activate → submit proof → verify → reward, asserts token transfer
- `testEvaluateUnauthorized()` — non-agent cannot evaluate
- `testRewardInsufficientTreasury()` — reward with insufficient balance reverts

```bash
forge test
```

## Foundry Config

```toml
solc_version = "0.8.24"
evm_version = "prague"
optimizer = true
optimizer_runs = 200
chain_id = 10143  # Monad testnet
```

## How Contracts Connect to the API

The API's `apps/api/src/chain/monad.ts` mirrors every Registry function using viem:
- `proposeMissionOnChain()`, `evaluateMissionOnChain()`, etc.
- `releaseReward()` calls Treasury directly
- `getTreasuryBalance()` reads token balance

On-chain features are gated by `AUTO_PAYOUT=true` + valid contract addresses + agent private key.
