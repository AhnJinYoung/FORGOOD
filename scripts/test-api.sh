#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
ENV_FILE="$API_DIR/.env.test"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

if ! command -v docker-compose >/dev/null 2>&1; then
  echo "docker-compose is required"
  exit 1
fi

if ! docker-compose -f "$ROOT_DIR/docker-compose.yml" up -d postgres >/dev/null 2>&1; then
  echo "Postgres container startup skipped; checking existing postgres on 5432..."
fi

if ! (echo >/dev/tcp/127.0.0.1/5432) >/dev/null 2>&1; then
  echo "Postgres is not reachable on 127.0.0.1:5432"
  exit 1
fi

# Use test env for API boot and smoke run.
set -a
source "$ENV_FILE"
set +a

(
  cd "$ROOT_DIR"
  DATABASE_URL="$DATABASE_URL" pnpm --filter @forgood/api exec prisma migrate deploy >/dev/null
)

(
  cd "$ROOT_DIR"
  TMPDIR=/tmp API_BASE_URL="http://127.0.0.1:${PORT}" dotenv_config_path="$ENV_FILE" pnpm --filter @forgood/api exec tsx src/index.ts
) > /tmp/forgood-api.log 2>&1 &
API_PID=$!

cleanup() {
  kill "$API_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$API_PID" >/dev/null 2>&1; then
    echo "API exited before health check passed:"
    cat /tmp/forgood-api.log || true
    exit 1
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "API health check failed:"
  cat /tmp/forgood-api.log || true
  exit 1
fi

(
  cd "$ROOT_DIR"
  API_BASE_URL="http://127.0.0.1:${PORT}" pnpm --filter @forgood/api exec node scripts/smoke-test.mjs
)
