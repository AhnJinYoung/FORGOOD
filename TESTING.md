# FORGOOD Test Environment

## Prerequisites
- Node 22 (`nvm use` reads `.nvmrc`)
- Docker + docker-compose
- pnpm 9.x

## Local test profile
- API test env: `apps/api/.env.test`
- Web test env: `apps/web/.env.test`

The API test profile is configured for OpenRouter free models:
- `OPENROUTER_MODEL=openai/gpt-oss-20b:free`
- `OPENROUTER_MODEL_VISION=nvidia/nemotron-nano-12b-v2-vl:free`

## Run stack
```bash
pnpm test:stack:up
```

## Recommended on WSL + Windows-mounted repo
If your repo is under `/mnt/c/...`, pnpm can fail with file-lock issues.
Use:
```bash
pnpm test:runtime
```
This syncs to `~/workspaces/FORGOOD-runtime`, installs there, then runs typechecks and smoke tests.

## Run API in test mode
```bash
pnpm --filter @forgood/api dev:test
```

## Run web in test mode
```bash
pnpm dev:web:test
```

## Run smoke test (API + AI evaluation + reward flow)
```bash
pnpm test:api:smoke
```

The smoke script does:
1. health check
2. mission create
3. `auto-evaluate` (OpenRouter free model)
4. activate
5. submit proof
6. `auto-verify` (with manual fallback if model/tool response is rejected)
7. reward (mock tx hash if `AUTO_PAYOUT=false`)

## OpenRouter free-model note
If smoke output shows:
`No endpoints found matching your data policy (Free model publication)`
then update OpenRouter privacy settings for the key used in `apps/api/.env.test` to allow free-model publication.

If smoke output shows:
`User not found.`
then the API key in `apps/api/.env.test` is invalid or disabled; replace `OPENROUTER_API_KEY` with an active key.

## Required secrets to test on-chain payouts
If you set `AUTO_PAYOUT=true`, these values must be real:
- `AGENT_PRIVATE_KEY`
- `TREASURY_ADDRESS`
- `FORGOOD_TOKEN_ADDRESS`

Without those, keep `AUTO_PAYOUT=false` for safe local testing.
