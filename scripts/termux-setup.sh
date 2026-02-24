#!/data/data/com.termux/files/usr/bin/bash
# ═══════════════════════════════════════════════════════════════════
# P31 EDE — Termux Full Build for Pixel 9 Pro Fold
# ═══════════════════════════════════════════════════════════════════
#
# Run this ONCE after fresh Termux install:
#   curl -fsSL https://raw.githubusercontent.com/p31labs/p31/main/scripts/termux-setup.sh | bash
#
# Or copy-paste into Termux manually.
#
# What this does:
#   1. Installs all build dependencies (node, python, rust, git, etc.)
#   2. Installs code-server (VS Code in your browser)
#   3. Clones P31 EDE
#   4. Configures services to run without Docker
#   5. Sets up Termux:Boot for auto-start
#
# After setup, open Chrome on the Fold's inner screen:
#   http://localhost:8080  → VS Code
#   http://localhost:3031  → Spaceship Earth dashboard
#   http://localhost:8031  → Backend API
#
# Requirements:
#   - Termux from F-Droid (NOT Play Store — Play Store version is outdated)
#   - Termux:Boot from F-Droid (optional, for auto-start)
#   - ~4GB free storage
#   - Pixel 9 Pro Fold with 16GB RAM
#
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[P31]${NC} $1"; }
warn() { echo -e "${YELLOW}[P31]${NC} $1"; }
info() { echo -e "${CYAN}[P31]${NC} $1"; }
fail() { echo -e "${RED}[P31]${NC} $1"; exit 1; }

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  P31 EDE — Termux Setup for Pixel 9 Pro Fold"
echo "  The Centaur goes mobile. 💜🔺💜"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── PHASE 1: Termux Base ─────────────────────────────────────────

log "Phase 1: Termux base packages..."

# Grant storage access (needed for USB OTG / shared storage)
if [ ! -d "$HOME/storage" ]; then
    warn "Run 'termux-setup-storage' manually if you need shared storage access."
fi

# Update and install core packages
pkg update -y && pkg upgrade -y

pkg install -y \
    git \
    nodejs-lts \
    python \
    python-pip \
    rust \
    build-essential \
    cmake \
    ninja \
    openssh \
    wget \
    curl \
    jq \
    ripgrep \
    fd \
    fzf \
    tmux \
    neovim \
    libffi \
    openssl \
    libjpeg-turbo \
    libpng \
    zlib

log "✓ Base packages installed"

# ─── PHASE 2: Node.js & npm ───────────────────────────────────────

log "Phase 2: Node.js environment..."

# Termux nodejs-lts gives us Node 22.x
node --version
npm --version

# Global npm packages
npm install -g \
    pnpm \
    yarn

log "✓ Node.js $(node --version) ready"

# ─── PHASE 3: Python Environment ──────────────────────────────────

log "Phase 3: Python environment..."

python --version
pip --version

# Upgrade pip
pip install --upgrade pip setuptools wheel

log "✓ Python $(python --version) ready"

# ─── PHASE 4: code-server (VS Code) ───────────────────────────────

log "Phase 4: Installing code-server..."

# Install code-server via npm (most reliable on Termux)
npm install -g code-server@latest

# Create config
mkdir -p ~/.config/code-server
cat > ~/.config/code-server/config.yaml << 'CSEOF'
bind-addr: 0.0.0.0:8080
auth: none
cert: false
disable-telemetry: true
CSEOF

# Create a launch script
mkdir -p ~/bin
cat > ~/bin/p31-code << 'CSEOF'
#!/data/data/com.termux/files/usr/bin/bash
# Launch code-server for P31 EDE
cd ~/p31
exec code-server \
    --bind-addr 0.0.0.0:8080 \
    --auth none \
    --disable-telemetry \
    ~/p31
CSEOF
chmod +x ~/bin/p31-code

log "✓ code-server installed → http://localhost:8080"

# ─── PHASE 5: Clone P31 EDE ───────────────────────────────────────

log "Phase 5: Cloning P31 EDE..."

cd ~

if [ -d "p31" ]; then
    warn "~/p31 already exists. Pulling latest..."
    cd p31 && git pull || true
else
    # If the repo isn't on GitHub yet, extract from tarball
    if [ -f "p31-ede-v0.1.0.tar.gz" ]; then
        tar xzf p31-ede-v0.1.0.tar.gz
    else
        warn "No tarball found. Creating from scratch..."
        mkdir -p p31
    fi
fi

cd ~/p31

# Create .env from example if not present
if [ ! -f .env ] && [ -f .env.example ]; then
    cp .env.example .env
    info "Created .env from .env.example — edit with your API keys"
fi

log "✓ P31 EDE at ~/p31"

# ─── PHASE 6: Install Project Dependencies ────────────────────────

log "Phase 6: Installing project dependencies..."

# Frontend
cd ~/p31/frontend
npm install 2>/dev/null || warn "Frontend npm install had warnings (normal on ARM)"

# Docs
cd ~/p31/docs
npm install 2>/dev/null || warn "Docs npm install had warnings (normal on ARM)"

# Backend
cd ~/p31/backend
pip install -r requirements.txt 2>/dev/null || warn "Some backend deps may need adjustment for Termux"
pip install -r requirements-dev.txt 2>/dev/null || true

cd ~/p31

log "✓ Dependencies installed"

# ─── PHASE 7: PlatformIO (Firmware) ───────────────────────────────

log "Phase 7: PlatformIO for ESP32-S3 firmware..."

pip install platformio

# Verify
pio --version && log "✓ PlatformIO ready" || warn "PlatformIO install needs attention"

# Note: USB OTG flashing requires Termux:API and USB permission
info "To flash ESP32-S3 via USB-C OTG:"
info "  1. Install Termux:API from F-Droid"
info "  2. pkg install termux-api"
info "  3. Connect ESP32-S3 via USB-C OTG adapter"
info "  4. cd ~/p31/firmware && pio run -t upload"

# ─── PHASE 8: Termux Services Setup ───────────────────────────────

log "Phase 8: Creating service launchers..."

# Master launcher script
cat > ~/bin/p31-start << 'STARTEOF'
#!/data/data/com.termux/files/usr/bin/bash
# ═══════════════════════════════════════════════════════════════
# P31 EDE — Start All Services (Termux, no Docker)
# ═══════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[P31]${NC} $1"; }
info() { echo -e "${CYAN}[P31]${NC} $1"; }

cd ~/p31

# Kill any existing P31 processes
pkill -f "uvicorn buffer_agent" 2>/dev/null || true
pkill -f "vite.*3031" 2>/dev/null || true
pkill -f "astro.*4321" 2>/dev/null || true
pkill -f "code-server" 2>/dev/null || true
sleep 1

# Start backend (FastAPI)
log "Starting backend on :8031..."
cd ~/p31/backend
nohup uvicorn buffer_agent:app --host 0.0.0.0 --port 8031 --reload \
    > ~/p31/.logs/backend.log 2>&1 &
echo $! > ~/p31/.pids/backend.pid

# Start frontend (Vite)
log "Starting frontend on :3031..."
cd ~/p31/frontend
nohup npx vite --host 0.0.0.0 --port 3031 \
    > ~/p31/.logs/frontend.log 2>&1 &
echo $! > ~/p31/.pids/frontend.pid

# Start docs (Astro)
log "Starting docs on :4321..."
cd ~/p31/docs
nohup npx astro dev --host 0.0.0.0 --port 4321 \
    > ~/p31/.logs/docs.log 2>&1 &
echo $! > ~/p31/.pids/docs.pid

# Start code-server
log "Starting code-server on :8080..."
nohup code-server --bind-addr 0.0.0.0:8080 --auth none --disable-telemetry ~/p31 \
    > ~/p31/.logs/code-server.log 2>&1 &
echo $! > ~/p31/.pids/code-server.pid

sleep 2

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  P31 EDE — All Services Running"
echo "═══════════════════════════════════════════════════════════════"
echo ""
info "code-server  → http://localhost:8080"
info "Frontend     → http://localhost:3031"
info "Backend API  → http://localhost:8031"
info "Docs         → http://localhost:4321"
echo ""
info "Stop all:  p31-stop"
info "Logs:      tail -f ~/p31/.logs/*.log"
info "Status:    p31-status"
echo ""
echo "  Open Chrome on your Fold → http://localhost:8080"
echo "  The Centaur is mobile. 💜🔺💜"
echo ""
STARTEOF
chmod +x ~/bin/p31-start

# Stop script
cat > ~/bin/p31-stop << 'STOPEOF'
#!/data/data/com.termux/files/usr/bin/bash
echo "[P31] Stopping all services..."
for pidfile in ~/p31/.pids/*.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile")
        kill "$pid" 2>/dev/null && echo "  Stopped PID $pid ($(basename "$pidfile" .pid))"
        rm "$pidfile"
    fi
done
pkill -f "uvicorn buffer_agent" 2>/dev/null || true
pkill -f "vite.*3031" 2>/dev/null || true
pkill -f "astro.*4321" 2>/dev/null || true
pkill -f "code-server" 2>/dev/null || true
echo "[P31] All services stopped."
STOPEOF
chmod +x ~/bin/p31-stop

# Status script
cat > ~/bin/p31-status << 'STATUSEOF'
#!/data/data/com.termux/files/usr/bin/bash
echo "═══════════════════════════════════════════════════"
echo "  P31 EDE — Service Status"
echo "═══════════════════════════════════════════════════"

check() {
    local name=$1 port=$2
    if curl -s --connect-timeout 2 "http://localhost:$port" > /dev/null 2>&1; then
        echo "  ● $name (:$port)  — LIVE"
    else
        echo "  ○ $name (:$port)  — DOWN"
    fi
}

check "code-server " 8080
check "Frontend    " 3031
check "Backend API " 8031
check "Docs        " 4321

echo ""
echo "PIDs:"
for pidfile in ~/p31/.pids/*.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile")
        name=$(basename "$pidfile" .pid)
        if kill -0 "$pid" 2>/dev/null; then
            echo "  $name: $pid (running)"
        else
            echo "  $name: $pid (dead)"
        fi
    fi
done
STATUSEOF
chmod +x ~/bin/p31-status

# Create log/pid directories
mkdir -p ~/p31/.logs ~/p31/.pids

log "✓ Service scripts created: p31-start, p31-stop, p31-status"

# ─── PHASE 9: Termux:Boot Auto-Start ──────────────────────────────

log "Phase 9: Termux:Boot configuration..."

mkdir -p ~/.termux/boot
cat > ~/.termux/boot/p31-autostart << 'BOOTEOF'
#!/data/data/com.termux/files/usr/bin/bash
# Auto-start P31 EDE on device boot
# Requires Termux:Boot from F-Droid

# Wait for network
sleep 5

# Acquire wake lock to prevent Termux from being killed
termux-wake-lock

# Start services
~/bin/p31-start
BOOTEOF
chmod +x ~/.termux/boot/p31-autostart

log "✓ Termux:Boot auto-start configured"

# ─── PHASE 10: Termux UI Tweaks ───────────────────────────────────

log "Phase 10: Termux UI for Fold screen..."

mkdir -p ~/.termux

# Termux properties optimized for Pixel 9 Pro Fold
cat > ~/.termux/termux.properties << 'PROPEOF'
# P31 EDE — Termux Properties for Pixel 9 Pro Fold
# Optimized for the 8" inner display

# Use extra keys row for common dev shortcuts
extra-keys = [[ \
  {key: ESC, popup: {macro: "CTRL c", display: "^C"}}, \
  {key: CTRL, popup: {macro: "CTRL z", display: "^Z"}}, \
  {key: ALT}, \
  {key: TAB}, \
  {key: '-', popup: '_'}, \
  {key: UP, popup: PGUP}, \
  {key: DOWN, popup: PGDN}, \
  {key: LEFT, popup: HOME}, \
  {key: RIGHT, popup: END} \
]]

# Appearance
use-black-ui = true
terminal-margin-horizontal = 3
terminal-margin-vertical = 3

# Bell
bell-character = ignore

# Keyboard
enforce-char-based-input = true
PROPEOF

# Font — Atkinson Hyperlegible Mono or JetBrains Mono if available
info "For best experience, install a Nerd Font:"
info "  curl -fLo ~/.termux/font.ttf https://github.com/ryanoasis/nerd-fonts/raw/HEAD/patched-fonts/JetBrainsMono/Ligatures/Regular/JetBrainsMonoNerdFont-Regular.ttf"
info "  Then: termux-reload-settings"

log "✓ Termux UI configured for Fold"

# ─── PHASE 11: PATH Setup ─────────────────────────────────────────

log "Phase 11: PATH and shell config..."

# Add ~/bin to PATH if not already there
if ! grep -q 'p31' ~/.bashrc 2>/dev/null; then
    cat >> ~/.bashrc << 'RCEOF'

# ─── P31 EDE ──────────────────────────────────────────────
export PATH="$HOME/bin:$PATH"
alias p31='cd ~/p31'
alias p31s='p31-start'
alias p31x='p31-stop'
alias p31t='p31-status'
alias p31c='p31-code'
alias p31fe='cd ~/p31/frontend && npm run dev'
alias p31be='cd ~/p31/backend && uvicorn buffer_agent:app --host 0.0.0.0 --port 8031 --reload'
alias p31fw='cd ~/p31/firmware && pio run'
alias p31log='tail -f ~/p31/.logs/*.log'

# Prompt
export PS1='\[\033[0;32m\]P31\[\033[0m\]:\[\033[0;36m\]\w\[\033[0m\]\$ '
RCEOF
fi

source ~/.bashrc 2>/dev/null || true

log "✓ Shell configured"

# ─── DONE ──────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  P31 EDE — Termux Setup Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
info "Quick start:"
echo "  p31-start       Start all services"
echo "  p31-stop        Stop all services"
echo "  p31-status      Check service status"
echo "  p31-code        Launch VS Code only"
echo ""
info "Open in Chrome (inner Fold screen):"
echo "  http://localhost:8080  → VS Code"
echo "  http://localhost:3031  → Spaceship Earth"
echo "  http://localhost:8031  → Backend API"
echo ""
info "Edit your API keys:"
echo "  nano ~/p31/.env"
echo ""
info "Firmware flash (USB-C OTG):"
echo "  cd ~/p31/firmware && pio run -t upload"
echo ""
info "Aliases: p31s (start), p31x (stop), p31t (status)"
echo ""
echo "  The Centaur is mobile. 💜🔺💜"
echo ""
