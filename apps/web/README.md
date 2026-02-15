# @forgood/web

Next.js 14 frontend with RainbowKit wallet connection and a mission feed powered by the FORGOOD API. Targets **Monad testnet** (chain 10143).

## Quick Start

```bash
cp apps/web/.env.example apps/web/.env
pnpm --filter @forgood/web dev
# → http://localhost:3000
```

## Directory Structure

```
apps/web/
├── app/
│   ├── layout.tsx        ← global layout, fonts, atmosphere background
│   ├── page.tsx          ← landing page: hero, wallet connect, mission feed
│   ├── providers.tsx     ← RainbowKit + Wagmi + React Query wiring
│   └── globals.css       ← Tailwind globals + custom design tokens
├── components/
│   ├── MissionList.tsx   ← fetches GET /missions, renders status + rewards
│   ├── TreasuryCard.tsx  ← live treasury balance display
│   ├── CreateMissionForm.tsx ← mission proposal form (POST /missions)
│   └── AgentStatus.tsx   ← AI agent health/mode indicator
├── lib/
│   └── chain.ts          ← Monad testnet viem chain definition
├── styles/               ← additional style assets
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

## Key Implementation

### `app/providers.tsx` — Web3 Stack

Configures the full wallet stack:
- **Wagmi** — React hooks for Ethereum (configured for Monad testnet)
- **RainbowKit** — wallet connection modal (MetaMask, WalletConnect, etc.)
- **React Query** — data fetching/caching for wagmi hooks
- Chain transport: HTTP to `https://testnet-rpc.monad.xyz`

### `app/page.tsx` — Landing Page

Main UI layout:
- Hero section with branding and `CreateMissionForm`
- Wallet connect via RainbowKit `ConnectButton`
- `TreasuryCard` showing on-chain FORGOOD balance
- `AgentStatus` showing API health + current AI mode
- `MissionList` with live mission feed

### `lib/chain.ts` — Monad Chain Config

Imports constants from `@forgood/shared` and defines the viem chain object used by both Wagmi and direct viem calls.

### Components

| Component | API Call | Purpose |
|-----------|----------|---------|
| `MissionList` | `GET /missions` | Displays mission cards with status badges and formatted rewards |
| `TreasuryCard` | `GET /treasury` | Shows FORGOOD token balance in treasury |
| `CreateMissionForm` | `POST /missions` | Form to submit a new mission proposal |
| `AgentStatus` | `GET /health` | Shows current AI mode (test/serving) and model info |

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:4000` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | For real WalletConnect | `FORGOOD_PROJECT_ID` |

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS 3.4
- RainbowKit 2.2 + Wagmi 2.12
- viem (chain definitions)
- `@forgood/shared` (chain constants)
