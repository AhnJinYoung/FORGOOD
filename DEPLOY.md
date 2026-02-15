# FORGOOD — Deployment Guide

> **Architecture:** Vercel (frontend) + AWS EC2 t2.micro (API + PostgreSQL + nginx)

```
┌──────────────────┐          HTTPS           ┌──────────────────────────┐
│   Vercel (free)  │ ◄──── CORS calls ──────► │   EC2 t2.micro (free)   │
│                  │                           │                          │
│  Next.js 14      │                           │  nginx (443/80)          │
│  Static + SSR    │                           │    ↓ reverse proxy       │
│                  │                           │  Fastify API (:4000)     │
│  NEXT_PUBLIC_    │                           │  PostgreSQL 16 (:5432)   │
│  API_URL=EC2     │                           │  Uploads (disk)          │
└──────────────────┘                           └──────────────────────────┘
         │                                                │
         │              Monad Testnet (10143)              │
         └──────────── on-chain calls ────────────────────►│
```

## Cost: $0/month (AWS Free Tier + Vercel Hobby)

| Service    | Tier       | Cost    | Limits                         |
|------------|------------|---------|--------------------------------|
| Vercel     | Hobby      | $0      | 100GB bandwidth, serverless    |
| EC2        | t2.micro   | $0*     | 1 vCPU, 1GB RAM, 12 months    |
| OpenRouter | Free tier  | ~$0     | `openrouter/auto` is free      |
| Let's Encrypt | Free   | $0      | Auto-renewing SSL              |

*Free for 12 months with new AWS account

---

## Step 1: AWS EC2 Setup

### 1a. Launch EC2 Instance

1. Go to [AWS Console → EC2](https://console.aws.amazon.com/ec2/)
2. Click **Launch Instance**
3. Settings:
   - **Name:** `forgood-api`
   - **AMI:** Ubuntu 22.04 LTS (free tier eligible)
   - **Instance type:** `t2.micro` (free tier)
   - **Key pair:** Create new → download `.pem` file
   - **Security Group:** Create new with these rules:
     | Type  | Port | Source    |
     |-------|------|-----------|
     | SSH   | 22   | My IP     |
     | HTTP  | 80   | Anywhere  |
     | HTTPS | 443  | Anywhere  |
   - **Storage:** 20 GB gp3 (free tier allows 30 GB)
4. Click **Launch**

### 1b. Connect to EC2

```bash
# Make your key read-only
chmod 400 ~/Downloads/forgood-api.pem

# SSH into the instance
ssh -i ~/Downloads/forgood-api.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

### 1c. Run the Deploy Script

```bash
# Clone your repo
git clone https://github.com/YOUR_USERNAME/forgood.git /opt/forgood
cd /opt/forgood

# Run the automated setup
bash scripts/deploy-ec2.sh
```

The script will:
1. Install Docker & Docker Compose
2. Create `.env` from template — **edit it with your values**
3. Set up nginx with SSL (if using a domain) or HTTP-only (if using IP)
4. Build and start all containers

### 1d. Edit Environment Variables

```bash
nano /opt/forgood/.env
```

**Required values:**
```
DB_PASSWORD=<generate a strong random password>
OPENROUTER_API_KEY=sk-or-v1-<your key from openrouter.ai/keys>
API_DOMAIN=<your domain or EC2 public IP>
CORS_ORIGIN=https://your-app.vercel.app
```

### 1e. Deploy Smart Contracts (Optional)

If you want on-chain rewards:

```bash
# On your local machine (needs Foundry):
cd packages/contracts
bash ../../scripts/deploy-contracts.sh

# Copy the output addresses to your EC2 .env:
#   AGENT_PRIVATE_KEY=0x...
#   TREASURY_ADDRESS=0x...
#   FORGOOD_TOKEN_ADDRESS=0x...
#   REGISTRY_ADDRESS=0x...
```

### 1f. Verify API is Running

```bash
# On EC2:
curl http://localhost:4000/health

# From anywhere (if using IP):
curl http://YOUR_EC2_IP/health

# From anywhere (if using domain + SSL):
curl https://api.forgood.xyz/health
```

---

## Step 2: Vercel Frontend Setup

### 2a. Import Project

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**
2. Import your GitHub repository
3. Configure:
   - **Framework Preset:** Next.js
   - **Root Directory:** `apps/web`
   - **Build Command:** `cd ../.. && pnpm --filter @forgood/web build`
   - **Output Directory:** `.next`
   - **Install Command:** `corepack enable && cd ../.. && pnpm install --frozen-lockfile`

### 2b. Set Environment Variables

In Vercel → Project → **Settings** → **Environment Variables**, add:

| Key                                  | Value                           | Environment |
|--------------------------------------|---------------------------------|-------------|
| `NEXT_PUBLIC_API_URL`                | `https://api.forgood.xyz`*      | Production  |
| `NEXT_PUBLIC_TREASURY_ADDRESS`       | `0x...` (from contract deploy)  | Production  |
| `NEXT_PUBLIC_TOKEN_ADDRESS`          | `0x...` (from contract deploy)  | Production  |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Your WalletConnect project ID | Production  |

> *Use `http://YOUR_EC2_IP` if not using a domain (Note: some browser features may require HTTPS)

### 2c. Deploy

Click **Deploy** or push to your `main` branch. Vercel auto-deploys on every push.

### 2d. Set Custom Domain (Optional)

In Vercel → Project → **Settings** → **Domains**:
- Add `forgood.xyz` or `app.forgood.xyz`
- Vercel provides free SSL

---

## Step 3: Domain Setup (Optional but Recommended)

If you have a domain (e.g., `forgood.xyz`):

| Record | Name            | Value                          |
|--------|-----------------|--------------------------------|
| A      | `api`           | `YOUR_EC2_PUBLIC_IP`           |
| CNAME  | `app` or `www`  | `cname.vercel-dns.com`         |

Then:
- EC2 API: `https://api.forgood.xyz`
- Vercel frontend: `https://app.forgood.xyz`

---

## Updating

### Update API (EC2)
```bash
ssh -i key.pem ubuntu@YOUR_EC2_IP
cd /opt/forgood
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

### Update Frontend (Vercel)
Just push to `main` — Vercel auto-deploys.

---

## Monitoring

```bash
# View all logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service
docker compose -f docker-compose.prod.yml logs -f api

# Check container status
docker compose -f docker-compose.prod.yml ps

# Restart a service
docker compose -f docker-compose.prod.yml restart api

# Full restart
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| CORS errors | Check `CORS_ORIGIN` in `.env` matches your Vercel URL exactly |
| 502 Bad Gateway | API container crashed — check `docker compose logs api` |
| SSL cert issues | Run `docker compose -f docker-compose.prod.yml run --rm certbot renew` |
| Database connection | Check `DB_PASSWORD` matches in `.env` |
| AI not working | Verify `OPENROUTER_API_KEY` in `.env` |
| Contract calls fail | Ensure `AGENT_PRIVATE_KEY` has Monad testnet MON for gas |

---

## Local Development (unchanged)

```bash
# Start dev stack (no nginx, no SSL)
docker compose up -d          # postgres + api
pnpm --filter @forgood/web dev  # Next.js dev server at localhost:3000
```

The Next.js dev server uses rewrites (`/api/*` → `localhost:4000`) so CORS is not needed locally.
