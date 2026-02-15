#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${FORGOOD_RUNTIME_DIR:-$HOME/workspaces/FORGOOD-runtime}"

mkdir -p "$RUNTIME_DIR"

rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'packages/contracts/out' \
  --exclude 'packages/contracts/cache' \
  "$ROOT_DIR/" "$RUNTIME_DIR/"

export NVM_DIR="$HOME/.nvm"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
else
  echo "nvm not found at $NVM_DIR"
  exit 1
fi

nvm install 22 >/dev/null
nvm use 22 >/dev/null

cd "$RUNTIME_DIR"

pnpm install --reporter=append-only
pnpm --filter @forgood/api exec prisma generate
pnpm --filter @forgood/api exec prisma migrate deploy
pnpm --filter @forgood/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @forgood/web exec tsc -p tsconfig.json --noEmit
pnpm --filter @forgood/api exec node -e "console.log('api deps ok')"

pnpm test:api:smoke
