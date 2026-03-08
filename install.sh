#!/bin/bash
# TmuxPlant — One-click install script for CentOS/RHEL
# Usage: bash install.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[TmuxPlant]${NC} $1"; }
ok()   { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

log "Starting TmuxPlant installation for CentOS..."

# ─── 1. Check tmux ───────────────────────────────────────────
if ! command -v tmux &>/dev/null; then
  warn "tmux not found, installing..."
  yum install -y tmux || err "Failed to install tmux"
fi
ok "tmux $(tmux -V | awk '{print $2}')"

# ─── 2. Check Node.js ────────────────────────────────────────
if ! command -v node &>/dev/null; then
  warn "Node.js not found, installing Node.js 16 via NodeSource..."
  curl -fsSL https://rpm.nodesource.com/setup_16.x | bash -
  yum install -y nodejs || err "Failed to install Node.js"
fi

NODE_VER=$(node -v)
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 16 ]; then
  err "Node.js >= 16 required, found $NODE_VER. Please upgrade first."
fi
ok "Node.js $NODE_VER"

# ─── 3. Install build tools for node-pty ─────────────────────
log "Installing build tools (gcc, python3)..."
yum groupinstall -y "Development Tools" &>/dev/null || true
yum install -y python3 &>/dev/null || true
ok "Build tools ready"

# ─── 4. Install npm dependencies ─────────────────────────────
log "Installing npm dependencies (this compiles node-pty natively)..."
npm install || err "npm install failed"
ok "Dependencies installed"

# ─── 5. Done ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗"
echo -e "║   TmuxPlant is ready to launch! 🌿   ║"
echo -e "╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "  Start:  ${CYAN}node server.js${NC}"
echo -e "  Open:   ${CYAN}http://<your-server-ip>:3001${NC}"
echo ""
echo -e "  To run as a background service:"
echo -e "  ${CYAN}nohup node server.js > tmuxplant.log 2>&1 &${NC}"
echo ""
