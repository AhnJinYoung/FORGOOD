#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "cwd: $ROOT_DIR"
node -v || true
pnpm -v || true
docker-compose ps || true

if [[ -f "$ROOT_DIR/apps/api/.env.test" ]]; then
  echo "apps/api/.env.test: present"
else
  echo "apps/api/.env.test: missing"
fi

if [[ -f "$ROOT_DIR/apps/web/.env.test" ]]; then
  echo "apps/web/.env.test: present"
else
  echo "apps/web/.env.test: missing"
fi
