# ============================================================
#  FORGOOD API — Dockerfile
#  Multi-stage build: install → generate → run
#  Produces a Linux-native image — no platform mismatch ever.
# ============================================================

# ── Stage 1: deps ──────────────────────────────────────────
FROM node:22-slim AS deps

# pnpm
RUN corepack enable && corepack prepare pnpm@9.15.5 --activate

# openssl is required by Prisma at generate-time AND runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only workspace manifests first → better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json            apps/api/
COPY apps/api/prisma/                 apps/api/prisma/
COPY packages/shared/package.json     packages/shared/
COPY packages/agent/package.json      packages/agent/
COPY apps/web/package.json            apps/web/

# Contracts is a Foundry project with no package.json — create a stub
# so pnpm doesn't error on the missing workspace member.
RUN mkdir -p packages/contracts && echo '{"name":"@forgood/contracts","version":"0.0.1","private":true}' > packages/contracts/package.json

RUN pnpm install --frozen-lockfile

# ── Stage 2: build ─────────────────────────────────────────
FROM deps AS build

# Copy source code for the API and its workspace deps
COPY packages/shared/ packages/shared/
COPY packages/agent/  packages/agent/
COPY apps/api/         apps/api/

# Generate Prisma Client (Linux-native binary)
RUN pnpm --filter @forgood/api exec prisma generate

# ── Stage 3: runtime ──────────────────────────────────────
FROM node:22-slim AS runtime

RUN corepack enable && corepack prepare pnpm@9.15.5 --activate
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the entire workspace (node_modules, generated Prisma, source)
COPY --from=build /app ./

# Create uploads directory for proof file storage
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
EXPOSE 4000

# Default to test mode. Override with FORGOOD_MODE=serving.
ENV FORGOOD_MODE=test

# Entrypoint: migrate DB then start server via tsx
CMD ["sh", "-c", "pnpm --filter @forgood/api exec prisma migrate deploy && pnpm --filter @forgood/api exec tsx src/index.ts"]
