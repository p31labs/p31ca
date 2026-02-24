# P31 EDE — Pixel 9 Pro Fold Build Guide

> The Centaur goes mobile. Full sovereign stack on a folding phone. 💜🔺💜

## What Works

| Component | Status | Notes |
|-----------|--------|-------|
| code-server (VS Code) | ✅ Full | Browser-based on :8080, inner screen |
| Frontend (Vite + React + Three.js) | ✅ Full | Spaceship Earth renders in Chrome |
| Backend (FastAPI + WebSocket) | ✅ Full | All endpoints functional |
| Python + pip | ✅ Full | 3.12 from Termux repos |
| Node.js + npm | ✅ Full | 22.x LTS from Termux repos |
| PlatformIO (firmware compile) | ✅ Full | Compiles ESP32-S3 firmware |
| ESP32 flash via USB-C OTG | ✅ Works | Requires OTG adapter + Termux:API |
| SQLite graph (Neo4j replacement) | ✅ Full | Drop-in, no Java needed |
| Ollama (local AI) | ⚠️ Possible | ARM64 build exists, needs 8GB+ free RAM |
| Neo4j | ❌ Skip | Requires JVM, too heavy for mobile |
| Docker | ❌ Skip | Needs root/kernel support |
| LiteLLM proxy | ❌ Skip | Use API keys directly |
| Continue.dev extension | ❌ Skip | Not available in code-server |

## Prerequisites

### 1. Install Termux (from F-Droid, NOT Play Store)

The Play Store version is abandoned. Get the real one:

1. Install [F-Droid](https://f-droid.org/)
2. Search for **Termux** and install
3. Also install **Termux:Boot** (for auto-start)
4. Also install **Termux:API** (for USB access)

### 2. Grant Permissions

First launch of Termux:
```bash
termux-setup-storage
```
Tap "Allow" when prompted.

### 3. Acquire Wake Lock

Prevent Android from killing Termux:
```bash
termux-wake-lock
```

## Installation

### Option A: One-liner (when script is hosted)
```bash
curl -fsSL https://raw.githubusercontent.com/p31labs/p31/main/scripts/termux-setup.sh | bash
```

### Option B: Manual step-by-step

```bash
# Step 1: Update Termux
pkg update -y && pkg upgrade -y

# Step 2: Install everything
pkg install -y git nodejs-lts python python-pip rust \
    build-essential cmake ninja openssh wget curl jq \
    ripgrep fd fzf tmux neovim libffi openssl

# Step 3: code-server
npm install -g code-server

# Step 4: Clone P31
cd ~ && git clone https://github.com/p31labs/p31.git
# OR extract tarball:
# tar xzf p31-ede-v0.1.0.tar.gz

# Step 5: Install deps
cd ~/p31/frontend && npm install
cd ~/p31/docs && npm install
cd ~/p31/backend && pip install -r requirements-termux.txt

# Step 6: Apply Termux patches
bash ~/p31/scripts/termux-patches.sh

# Step 7: Copy scripts
cp ~/p31/scripts/p31-start ~/bin/
cp ~/p31/scripts/p31-stop ~/bin/
cp ~/p31/scripts/p31-status ~/bin/
chmod +x ~/bin/p31-*

# Step 8: Configure
cp ~/p31/.env.example ~/p31/.env
nano ~/p31/.env  # Add your API keys

# Step 9: Launch
p31-start
```

## Daily Usage

### Starting Everything
```bash
p31-start
```
Then open Chrome → `http://localhost:8080`

### Stopping
```bash
p31-stop
```

### Check Status
```bash
p31-status
```

### tmux Multi-Pane (for the Fold's inner screen)
```bash
p31-tmux
```
This creates a 4-pane layout:
```
┌──────────────────────────────┐
│        backend (FastAPI)      │
├───────────────┬──────────────┤
│  frontend     │    shell     │
├───────────────┴──────────────┤
│           logs               │
└──────────────────────────────┘
```

### Quick Aliases
```
p31s  → p31-start
p31x  → p31-stop
p31t  → p31-status
p31   → cd ~/p31
p31fe → start frontend only
p31be → start backend only
p31fw → compile firmware
p31log → tail all logs
```

## Fold-Specific Tips

### Inner Screen (8" unfolded)
- Use Chrome in desktop mode for code-server
- Two-finger pinch to zoom code-server if text is too small
- Landscape orientation gives more horizontal space for code
- Split screen: Chrome (code-server) + Termux side-by-side

### Outer Screen (6.3" folded)
- Use Termux directly for CLI tasks
- `p31-status` for quick health checks
- `p31-tmux` works well even on the smaller screen

### Bluetooth Keyboard
- Highly recommended for serious coding
- All VS Code shortcuts work through code-server
- Ctrl+` opens terminal inside code-server

### Battery Optimization
- **Disable** battery optimization for Termux in Android Settings
- Settings → Apps → Termux → Battery → Unrestricted
- Also for Termux:Boot
- `termux-wake-lock` prevents sleep kills

## Flashing ESP32-S3 via USB-C OTG

The Pixel 9 Pro Fold's USB-C port supports OTG:

1. Get a USB-C OTG adapter (USB-C male to USB-A female)
2. Connect ESP32-S3 DevKitC via the adapter
3. Install Termux:API: `pkg install termux-api`
4. Flash:
```bash
cd ~/p31/firmware
pio run -t upload
```

If the device isn't detected:
```bash
# List USB devices
termux-usb -l
# Grant permission to the device
termux-usb -r /dev/bus/usb/001/002  # adjust path
```

## Architecture Differences (Termux vs Docker)

| Docker EDE | Termux EDE |
|------------|------------|
| Neo4j container | SQLite (`~/.data/graph.db`) |
| LiteLLM proxy | Direct API calls |
| Caddy reverse proxy | Vite proxy config |
| docker-compose up | p31-start script |
| Ollama container | Optional: native Ollama ARM64 |
| code-server in container | code-server via npm global |
| Network: p31-network bridge | All services on localhost |

## Optional: Ollama on Pixel 9 Pro Fold

The Pixel 9 Pro has 16GB RAM. You can run small models:

```bash
# Install Ollama (ARM64 Linux binary)
curl -fsSL https://ollama.com/install.sh | sh

# Pull a small model
ollama pull qwen2.5-coder:3b    # 2GB, fits in RAM
# or
ollama pull phi3:mini            # 2.3GB

# Start server
ollama serve &

# Test
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5-coder:3b",
  "prompt": "Write a CRC8 function in C"
}'
```

Note: Inference will be slow (CPU-only, ~5-10 tokens/sec) but
it works for offline summarization and simple queries.

## Troubleshooting

### code-server won't start
```bash
# Check if port 8080 is in use
lsof -i :8080
# Kill and retry
pkill code-server
code-server --bind-addr 0.0.0.0:8080 --auth none ~/p31
```

### npm install fails on ARM
```bash
# Some native modules need rebuilding
npm rebuild
# If that fails, try:
npm install --build-from-source
```

### Python packages fail to install
```bash
# Use Termux-specific requirements
pip install -r backend/requirements-termux.txt
# For any failures, install the C lib first:
pkg install libxml2 libxslt  # if lxml is needed
```

### Termux killed by Android
```bash
# Acquire wake lock
termux-wake-lock
# Disable battery optimization (do this in Android Settings)
# Run notification to keep alive:
termux-notification -t "P31 EDE Running" --ongoing
```

### ESP32 not detected via USB OTG
```bash
# Grant USB permissions
termux-usb -l                    # list devices
termux-usb -r /dev/bus/usb/...  # grant permission
# Verify PlatformIO sees it
pio device list
```

## File Locations

```
~/p31/                    # Main repository
~/p31/.data/graph.db      # SQLite knowledge graph
~/p31/.logs/              # Service logs
~/p31/.pids/              # PID files for running services
~/p31/.env                # API keys and configuration
~/bin/p31-*               # Launcher scripts
~/.config/code-server/    # code-server config
~/.termux/                # Termux UI config
~/.termux/boot/           # Auto-start scripts
```
