#!/usr/bin/env bash
# ================================================================
#  FORGOOD — EC2 First-Time Setup Script
#
#  Run on a fresh Ubuntu 22.04/24.04 EC2 instance (t2.micro free tier):
#    curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/scripts/deploy-ec2.sh | bash
#
#  Or after cloning:
#    bash scripts/deploy-ec2.sh
#
#  What it does:
#    1. Install Docker + Docker Compose
#    2. Clone repo (or use existing)
#    3. Set up nginx + SSL (Let's Encrypt)
#    4. Start services with docker-compose.prod.yml
#
#  Prerequisites:
#    - EC2 security group: inbound 80, 443, 22
#    - A domain pointing to this EC2 IP (for SSL)
#      OR use the EC2 public IP (no SSL, HTTP only)
# ================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[FORGOOD]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── 1. Install Docker ───────────────────────────────────────
install_docker() {
  if command -v docker &>/dev/null; then
    log "Docker already installed: $(docker --version)"
    return
  fi

  log "Installing Docker..."
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg

  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  # Allow current user to run Docker without sudo
  sudo usermod -aG docker "$USER"
  log "Docker installed. You may need to log out and back in for group changes."
}

# ── 2. Clone or update repo ─────────────────────────────────
setup_repo() {
  local PROJECT_DIR="${PROJECT_DIR:-/opt/forgood}"

  if [ -d "$PROJECT_DIR/.git" ]; then
    log "Repo exists at $PROJECT_DIR — pulling latest..."
    cd "$PROJECT_DIR"
    git pull origin main
  else
    log "Cloning repo to $PROJECT_DIR..."
    read -rp "GitHub repo URL (e.g., https://github.com/you/forgood.git): " REPO_URL
    sudo mkdir -p "$PROJECT_DIR"
    sudo chown "$USER:$USER" "$PROJECT_DIR"
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
  fi
}

# ── 3. Environment setup ────────────────────────────────────
setup_env() {
  local PROJECT_DIR="${PROJECT_DIR:-/opt/forgood}"
  cd "$PROJECT_DIR"

  if [ ! -f .env ]; then
    log "Creating .env from .env.example..."
    cp .env.example .env
    warn "Edit .env with your actual values:"
    warn "  nano $PROJECT_DIR/.env"
    warn ""
    warn "Required values:"
    warn "  DB_PASSWORD     — strong random password"
    warn "  OPENROUTER_API_KEY — from https://openrouter.ai/keys"
    warn "  API_DOMAIN      — your domain or EC2 public IP"
    warn "  CORS_ORIGIN     — your Vercel URL"
    warn ""
    read -rp "Press Enter after editing .env (or Ctrl+C to do it later)..."
  else
    log ".env already exists"
  fi
}

# ── 4. SSL setup ─────────────────────────────────────────────
setup_ssl() {
  local PROJECT_DIR="${PROJECT_DIR:-/opt/forgood}"
  cd "$PROJECT_DIR"

  # Read domain from .env
  source .env
  local DOMAIN="${API_DOMAIN:-}"

  if [ -z "$DOMAIN" ]; then
    error "API_DOMAIN not set in .env"
    exit 1
  fi

  # Check if domain looks like an IP address
  if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    warn "API_DOMAIN is an IP address ($DOMAIN) — skipping SSL."
    warn "The API will run on HTTP only (port 80)."
    warn "For HTTPS, point a domain to this IP and re-run."

    # Create HTTP-only nginx config
    cat > nginx/conf.d/default.conf <<'HTTPCONF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /uploads/ {
        alias /app/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
HTTPCONF
    log "Created HTTP-only nginx config."
    return
  fi

  log "Setting up SSL for $DOMAIN..."

  # Replace placeholder in nginx config
  sed -i "s/YOUR_DOMAIN/$DOMAIN/g" nginx/conf.d/default.conf

  # First, create a temporary HTTP-only config for initial cert request
  cat > nginx/conf.d/temp-certbot.conf <<TEMPCONF
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'Setting up SSL...';
        add_header Content-Type text/plain;
    }
}
TEMPCONF

  # Remove SSL config temporarily (cert doesn't exist yet)
  mv nginx/conf.d/default.conf nginx/conf.d/default.conf.bak

  # Start nginx only for cert challenge
  docker compose -f docker-compose.prod.yml up -d nginx
  sleep 3

  # Request certificate
  read -rp "Email for Let's Encrypt notifications: " CERT_EMAIL
  docker compose -f docker-compose.prod.yml run --rm certbot \
    certonly --webroot --webroot-path=/var/www/certbot \
    --email "$CERT_EMAIL" --agree-tos --no-eff-email \
    -d "$DOMAIN"

  # Restore SSL config
  mv nginx/conf.d/default.conf.bak nginx/conf.d/default.conf
  rm nginx/conf.d/temp-certbot.conf

  log "SSL certificate obtained for $DOMAIN!"
}

# ── 5. Start services ───────────────────────────────────────
start_services() {
  local PROJECT_DIR="${PROJECT_DIR:-/opt/forgood}"
  cd "$PROJECT_DIR"

  log "Building and starting services..."
  docker compose -f docker-compose.prod.yml up -d --build

  log ""
  log "========================================="
  log "  FORGOOD is running! 🎉"
  log "========================================="
  log ""

  source .env
  local DOMAIN="${API_DOMAIN:-localhost}"
  local PROTOCOL="https"
  if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    PROTOCOL="http"
  fi

  log "  API:     ${PROTOCOL}://${DOMAIN}"
  log "  Health:  ${PROTOCOL}://${DOMAIN}/health"
  log ""
  log "  Logs:    docker compose -f docker-compose.prod.yml logs -f"
  log "  Stop:    docker compose -f docker-compose.prod.yml down"
  log "  Restart: docker compose -f docker-compose.prod.yml restart"
  log ""
  log "  Next: Set these in your Vercel dashboard → Settings → Environment Variables:"
  log "    NEXT_PUBLIC_API_URL=${PROTOCOL}://${DOMAIN}"
  log "    NEXT_PUBLIC_TREASURY_ADDRESS=${TREASURY_ADDRESS:-0x...}"
  log "    NEXT_PUBLIC_TOKEN_ADDRESS=${FORGOOD_TOKEN_ADDRESS:-0x...}"
  log ""
}

# ── Main ─────────────────────────────────────────────────────
main() {
  log "FORGOOD EC2 Deployment"
  log ""

  install_docker
  setup_repo
  setup_env
  setup_ssl
  start_services
}

main "$@"
