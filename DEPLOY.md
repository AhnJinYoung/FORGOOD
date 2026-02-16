# FORGOOD — Deployment Guide

> Vercel (frontend) + GCP e2-micro (API + DB) — **$0/month**

```
  Vercel (free)              GCP e2-micro (always free)
┌────────────────┐  CORS  ┌──────────────────────────┐
│  Next.js 14    │ ◄────► │  nginx → Fastify (:4000) │
│  Static + SSR  │        │  PostgreSQL 16            │
└────────────────┘        └──────────────────────────┘
        ↕                           ↕
              Monad Testnet (10143)
```

---

## 1. GCP VM Setup

1. [GCP Console → Compute Engine → Create Instance](https://console.cloud.google.com/compute/instances)
   - **Name:** `forgood-api`
   - **Region:** `us-west1` / `us-central1` / `us-east1` (free tier)
   - **Machine type:** `e2-micro`
   - **Boot disk:** Ubuntu 22.04 LTS, 30 GB standard
   - **Firewall:** ✅ Allow HTTP, ✅ Allow HTTPS

2. Also open port **4000**: [VPC → Firewall → Create rule](https://console.cloud.google.com/networking/firewalls)
   - Name: `allow-api`
   - Targets: All instances
   - Source: `0.0.0.0/0`
   - TCP port: `4000`

3. SSH in (click **SSH** button in GCP Console), then:

```bash
git clone https://github.com/AhnJinYoung/FORGOOD.git /opt/forgood
cd /opt/forgood
bash scripts/deploy-ec2.sh
```

4. When prompted, edit `.env`:

```bash
nano /opt/forgood/.env
```

Set these three:
```
API_DOMAIN=YOUR_GCP_EXTERNAL_IP
OPENROUTER_API_KEY=sk-or-v1-your-key
CORS_ORIGIN=https://forgood-web.vercel.app
```

5. Verify: `curl http://localhost:4000/health`

### Static IP (recommended)

```bash
# GCP external IPs change on reboot. Reserve one:
gcloud compute addresses create forgood-ip --region=YOUR_REGION
# Then assign it to your VM in the Console → VM → Edit → Network → External IP
```

---

## 2. Vercel Frontend

1. [vercel.com](https://vercel.com) → **Add New → Project** → import `AhnJinYoung/FORGOOD`

2. Configure:

| Setting | Value |
|---------|-------|
| Framework | **Next.js** |
| Root Directory | `apps/web` |
| Build Command | `cd ../.. && pnpm --filter @forgood/web build` |
| Install Command | `cd ../.. && corepack enable && pnpm install --frozen-lockfile` |

3. Environment Variables:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | `http://YOUR_GCP_IP:4000` |

4. Click **Deploy**

> `NEXT_PUBLIC_*` vars are baked at build time. After changing them, you must **redeploy**.

---

## 3. Updating

**API** (on GCP):
```bash
cd /opt/forgood
git pull origin master
docker compose -f docker-compose.prod.yml up -d --build
```

**Frontend**: just push to `master` — Vercel auto-deploys.

---

## 4. Useful Commands

```bash
docker compose -f docker-compose.prod.yml logs -f api   # view logs
docker compose -f docker-compose.prod.yml ps             # check status
docker compose -f docker-compose.prod.yml restart api    # restart API
docker compose -f docker-compose.prod.yml down           # stop all
```

---

## 5. Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS errors | `CORS_ORIGIN` in `.env` must match your Vercel URL exactly |
| 502 Bad Gateway | `docker compose -f docker-compose.prod.yml logs api` |
| AI not working | Check `OPENROUTER_API_KEY` in `.env` |
| Can't reach API | GCP firewall: ensure port 4000 is open |
| IP changed after reboot | Reserve a static IP (see above) |

---

## 6. Local Development

```bash
docker compose up -d                  # postgres + api
pnpm --filter @forgood/web dev        # Next.js at localhost:3000
```

Rewrites proxy `/api/*` → `localhost:4000` automatically. No CORS needed locally.
