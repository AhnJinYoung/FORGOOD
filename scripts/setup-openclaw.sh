#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# FORGOOD — OpenClaw Agent Setup Script for AWS EC2
# Run this on a fresh Ubuntu 24.04 EC2 instance (c7i-flex.large)
#
# Usage:
#   ssh -i key.pem ubuntu@<public-ip>
#   curl -fsSL https://raw.githubusercontent.com/<repo>/main/scripts/setup-openclaw.sh | bash
#   # or: scp this file + run locally
# ─────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[FORGOOD]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ─── Config ──────────────────────────────────────────────────
FORGOOD_DIR="${HOME}/forgood"
OPENCLAW_SKILLS_DIR="${HOME}/.openclaw/skills"

# ─── Step 1: System Prerequisites ────────────────────────────
log "Step 1/8: Installing system prerequisites..."
sudo apt update -qq
sudo apt upgrade -y -qq
sudo apt install -y -qq curl git build-essential

# ─── Step 2: Node.js 22 ─────────────────────────────────────
if command -v node &>/dev/null && [[ "$(node --version)" == v22* ]]; then
  log "Step 2/8: Node.js $(node --version) already installed ✓"
else
  log "Step 2/8: Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
log "  node $(node --version) | npm $(npm --version)"

# ─── Step 3: pnpm ───────────────────────────────────────────
if command -v pnpm &>/dev/null; then
  log "Step 3/8: pnpm already installed ✓"
else
  log "Step 3/8: Installing pnpm..."
  npm install -g pnpm@latest
fi

# ─── Step 4: Docker + Docker Compose ─────────────────────────
if command -v docker &>/dev/null; then
  log "Step 4/8: Docker already installed ✓"
else
  log "Step 4/8: Installing Docker..."
  sudo apt install -y -qq docker.io
  sudo usermod -aG docker "$USER"
  warn "Docker group added — you may need to log out and back in."
fi

# Docker Compose v2 plugin
if docker compose version &>/dev/null 2>&1; then
  log "  Docker Compose v2 already installed ✓"
else
  log "  Installing Docker Compose v2 plugin..."
  COMPOSE_VERSION="v2.36.1"
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-$(uname -m)" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

# ─── Step 5: Foundry (for on-chain interactions) ─────────────
if command -v cast &>/dev/null; then
  log "Step 5/8: Foundry already installed ✓"
else
  log "Step 5/8: Installing Foundry..."
  curl -L https://foundry.paradigm.xyz | bash
  export PATH="${HOME}/.foundry/bin:${PATH}"
  foundryup
fi

# ─── Step 6: OpenClaw ───────────────────────────────────────
if command -v openclaw &>/dev/null; then
  log "Step 6/8: OpenClaw already installed ✓"
else
  log "Step 6/8: Installing OpenClaw..."
  npm install -g openclaw@latest
fi

# ─── Step 7: ClawHub + Skills ───────────────────────────────
log "Step 7/8: Installing ClawHub and skills..."
if ! command -v clawhub &>/dev/null; then
  npm install -g clawhub
fi

# Install Monad development skill (wallet ops, contract deploy, verify)
clawhub install monad-development 2>/dev/null || warn "monad-development skill may already be installed"

# Install Nad.fun token creation skill
clawhub install nadfun-token-creation 2>/dev/null || warn "nadfun-token-creation skill may already be installed"

# ─── Step 8: FORGOOD Project ────────────────────────────────
log "Step 8/8: Setting up FORGOOD project..."

if [ -d "${FORGOOD_DIR}" ]; then
  log "  FORGOOD directory exists, pulling latest..."
  cd "${FORGOOD_DIR}"
  git pull 2>/dev/null || warn "Not a git repo or no remote configured"
else
  warn "  Clone your FORGOOD repo to ${FORGOOD_DIR} or copy files manually."
  warn "  Example: git clone <YOUR_REPO_URL> ${FORGOOD_DIR}"
  mkdir -p "${FORGOOD_DIR}"
fi

# ─── Install FORGOOD Custom Skills ──────────────────────────
log "Installing FORGOOD custom skills into OpenClaw..."
mkdir -p "${OPENCLAW_SKILLS_DIR}"

# Link skills from our project into OpenClaw's skills directory
if [ -d "${FORGOOD_DIR}/skills/forgood" ]; then
  ln -sfn "${FORGOOD_DIR}/skills/forgood" "${OPENCLAW_SKILLS_DIR}/forgood"
  log "  ✓ forgood (main mission management skill)"
fi

if [ -d "${FORGOOD_DIR}/skills/forgood-evaluator" ]; then
  ln -sfn "${FORGOOD_DIR}/skills/forgood-evaluator" "${OPENCLAW_SKILLS_DIR}/forgood-evaluator"
  log "  ✓ forgood-evaluator (AI mission scoring)"
fi

if [ -d "${FORGOOD_DIR}/skills/forgood-verifier" ]; then
  ln -sfn "${FORGOOD_DIR}/skills/forgood-verifier" "${OPENCLAW_SKILLS_DIR}/forgood-verifier"
  log "  ✓ forgood-verifier (AI proof verification)"
fi

if [ -d "${FORGOOD_DIR}/skills/forgood-social" ]; then
  ln -sfn "${FORGOOD_DIR}/skills/forgood-social" "${OPENCLAW_SKILLS_DIR}/forgood-social"
  log "  ✓ forgood-social (Moltbook integration)"
fi

if [ -d "${FORGOOD_DIR}/skills/forgood-heartbeat" ]; then
  ln -sfn "${FORGOOD_DIR}/skills/forgood-heartbeat" "${OPENCLAW_SKILLS_DIR}/forgood-heartbeat"
  log "  ✓ forgood-heartbeat (proactive monitoring)"
fi

# ─── Copy OpenClaw Config ───────────────────────────────────
if [ -f "${FORGOOD_DIR}/openclaw.json" ]; then
  log "Deploying openclaw.json config..."
  cp "${FORGOOD_DIR}/openclaw.json" "${HOME}/.openclaw/openclaw.json"
  log "  ✓ Config installed to ~/.openclaw/openclaw.json"
  warn "  Edit ~/.openclaw/openclaw.json to set your API keys!"
fi

# ─── Create .env template ───────────────────────────────────
ENV_FILE="${FORGOOD_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  log "Creating .env template..."
  cat > "${ENV_FILE}" << 'ENVEOF'
# ─── FORGOOD Environment Variables ───────────────────────────
# Copy this to apps/api/.env and fill in your values

# Database (Docker Compose manages this)
DATABASE_URL="postgresql://forgood:forgood@localhost:5432/forgood?schema=public"

# OpenRouter AI
OPENROUTER_API_KEY="sk-or-v1-your-key-here"
FORGOOD_MODE="serving"

# Monad Testnet
MONAD_RPC_URL="https://testnet-rpc.monad.xyz"
AGENT_PRIVATE_KEY="0x_your_agent_wallet_private_key"
TREASURY_ADDRESS="0x_deployed_treasury_contract"
FORGOOD_TOKEN_ADDRESS="0x_deployed_token_contract"
MISSION_REGISTRY_ADDRESS="0x_deployed_registry_contract"

# Auto-payout (set to true for autonomous operation)
AUTO_PAYOUT="true"

# Moltbook (optional, for social posting)
MOLTBOOK_API_KEY="moltbook_your_key_here"
ENVEOF
  warn "Edit ${ENV_FILE} with your actual values!"
fi

# ─── Summary ────────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🌍 FORGOOD OpenClaw Agent — Setup Complete!${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo ""
echo -e "  1. ${CYAN}Set your API keys:${NC}"
echo -e "     Edit ~/.openclaw/openclaw.json"
echo -e "     Edit ${FORGOOD_DIR}/.env"
echo ""
echo -e "  2. ${CYAN}Start the FORGOOD backend (Docker):${NC}"
echo -e "     cd ${FORGOOD_DIR}"
echo -e "     docker compose up -d"
echo -e "     # Wait for postgres to be healthy, then:"
echo -e "     docker compose --profile web up -d"
echo ""
echo -e "  3. ${CYAN}Run OpenClaw onboarding (if first time):${NC}"
echo -e "     openclaw onboard --install-daemon"
echo -e "     # Select: OpenRouter, moonshotai/kimi-k2.5, Telegram"
echo ""
echo -e "  4. ${CYAN}Or start OpenClaw directly:${NC}"
echo -e "     openclaw gateway --port 18789"
echo ""
echo -e "  5. ${CYAN}Access Control UI (from your local machine):${NC}"
echo -e "     ssh -i key.pem -N -L 18789:127.0.0.1:18789 ubuntu@<public-ip>"
echo -e "     Then open: http://127.0.0.1:18789"
echo ""
echo -e "  6. ${CYAN}Telegram:${NC}"
echo -e "     Message your bot and try: 'List all missions'"
echo ""
echo -e "  ${GREEN}Installed skills:${NC}"
echo -e "    🌍 forgood           — Mission lifecycle management"
echo -e "    🧠 forgood-evaluator  — AI mission scoring"
echo -e "    👁️  forgood-verifier   — AI proof verification"
echo -e "    🦞 forgood-social     — Moltbook community posts"
echo -e "    💓 forgood-heartbeat  — Proactive monitoring"
echo -e "    ⛓️  monad-development  — Wallet & contract ops"
echo -e "    🚀 nadfun-token-creation — Token launch on Nad.fun"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
