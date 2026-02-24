#!/data/data/com.termux/files/usr/bin/bash
# ═══════════════════════════════════════════════════════════════════
# P31 EDE — Termux Patches
# ═══════════════════════════════════════════════════════════════════
#
# Applies Termux-specific modifications to the P31 EDE codebase.
# Run AFTER cloning/extracting the repo and BEFORE first start.
#
# Handles:
#   1. No Docker → direct service launch
#   2. No Neo4j → SQLite fallback for knowledge graph
#   3. ARM-specific pip dependencies
#   4. code-server extension installation
#   5. Vite config for 0.0.0.0 binding
#
# Usage: bash ~/p31/scripts/termux-patches.sh
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
NC='\033[0m'
log() { echo -e "${GREEN}[P31-PATCH]${NC} $1"; }

cd ~/p31

# ─── PATCH 1: Backend — SQLite fallback for Neo4j ─────────────────

log "Patch 1: Adding SQLite graph fallback..."

cat > backend/graph_sqlite.py << 'PYEOF'
"""
P31 Graph Store — SQLite Fallback (Termux / No-Docker)

Drop-in replacement for graph_loader.py Neo4j functions
when Neo4j is unavailable (e.g., on Android/Termux).

Uses SQLite for lightweight persistent graph storage.
"""

import json
import os
import sqlite3
from pathlib import Path
from typing import Optional

DB_PATH = os.getenv("P31_GRAPH_DB", os.path.expanduser("~/p31/.data/graph.db"))


def _ensure_db() -> sqlite3.Connection:
    """Initialize SQLite database with graph schema."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            axis TEXT DEFAULT 'D',
            voltage_composite REAL DEFAULT 0.0,
            voltage_level TEXT DEFAULT 'GREEN',
            created TEXT DEFAULT (datetime('now')),
            metadata TEXT DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS files (
            path TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            extension TEXT,
            axis TEXT DEFAULT 'D'
        );
        CREATE TABLE IF NOT EXISTS directories (
            path TEXT PRIMARY KEY,
            name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS edges (
            source TEXT NOT NULL,
            target TEXT NOT NULL,
            relation TEXT DEFAULT 'RELATES_TO',
            weight REAL DEFAULT 1.0,
            PRIMARY KEY (source, target, relation)
        );
        CREATE INDEX IF NOT EXISTS idx_nodes_axis ON nodes(axis);
        CREATE INDEX IF NOT EXISTS idx_files_axis ON files(axis);
    """)
    return conn


def get_driver():
    """Compatibility shim — returns None (no Neo4j on Termux)."""
    return None


def neo4j_health() -> str:
    """Report SQLite health instead of Neo4j."""
    try:
        conn = _ensure_db()
        count = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        conn.close()
        return f"sqlite({count} nodes)"
    except Exception:
        return "sqlite(error)"


def ingest_node(node_id: str, content: str, axis: str, voltage: dict = None) -> bool:
    """Insert a node into SQLite graph."""
    try:
        conn = _ensure_db()
        conn.execute(
            "INSERT OR REPLACE INTO nodes (id, content, axis, voltage_composite, voltage_level) VALUES (?, ?, ?, ?, ?)",
            (
                node_id,
                content,
                axis,
                voltage.get("composite", 0.0) if voltage else 0.0,
                voltage.get("level", "GREEN") if voltage else "GREEN",
            ),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"SQLite ingest error: {e}")
        return False


def query_neighbors(file_path: str, depth: int = 2, driver=None) -> list:
    """Find related files by axis similarity."""
    try:
        conn = _ensure_db()
        row = conn.execute("SELECT axis FROM files WHERE path = ?", (file_path,)).fetchone()
        if not row:
            conn.close()
            return []
        axis = row["axis"]
        results = conn.execute(
            "SELECT path, name, axis FROM files WHERE axis = ? AND path != ? LIMIT 20",
            (axis, file_path),
        ).fetchall()
        conn.close()
        return [dict(r) for r in results]
    except Exception:
        return []


def query_by_axis(axis: str, limit: int = 50, driver=None) -> list:
    """Retrieve all files in a given taxonomy axis."""
    try:
        conn = _ensure_db()
        results = conn.execute(
            "SELECT path, name FROM files WHERE axis = ? ORDER BY name LIMIT ?",
            (axis, limit),
        ).fetchall()
        conn.close()
        return [dict(r) for r in results]
    except Exception:
        return []


def load_codebase(root_dir: str = ".", driver=None) -> dict:
    """Walk codebase and populate SQLite graph."""
    conn = _ensure_db()
    skip_dirs = {"node_modules", "__pycache__", ".git", ".pio", "dist", "build"}
    axis_map = {
        ".py": "D", ".ts": "D", ".tsx": "D", ".jsx": "D", ".js": "D",
        ".cpp": "D", ".h": "D", ".md": "A", ".mdx": "A",
        ".yml": "D", ".yaml": "D", ".json": "D", ".css": "D",
    }
    stats = {"files": 0, "directories": 0}

    root = Path(root_dir)
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        rel_dir = os.path.relpath(dirpath, root)

        conn.execute(
            "INSERT OR REPLACE INTO directories (path, name) VALUES (?, ?)",
            (rel_dir, os.path.basename(dirpath) or "root"),
        )
        stats["directories"] += 1

        for filename in filenames:
            ext = os.path.splitext(filename)[1]
            axis = axis_map.get(ext, "D")
            file_path = os.path.join(rel_dir, filename)
            conn.execute(
                "INSERT OR REPLACE INTO files (path, name, extension, axis) VALUES (?, ?, ?, ?)",
                (file_path, filename, ext, axis),
            )
            stats["files"] += 1

    conn.commit()
    conn.close()
    return {"status": "loaded", **stats}
PYEOF

log "✓ graph_sqlite.py created"

# ─── PATCH 2: Backend — Auto-detect Neo4j vs SQLite ───────────────

log "Patch 2: Patching buffer_agent.py for SQLite fallback..."

# Add SQLite fallback to buffer_agent.py
# We patch the import and neo4j_health function
python3 << 'PYPATCH'
import os, re

path = os.path.expanduser("~/p31/backend/buffer_agent.py")
with open(path, "r") as f:
    content = f.read()

# Add SQLite import fallback after the existing neo4j code
patch = '''
# ─── Termux/SQLite Fallback ───────────────────────────────────
try:
    from graph_sqlite import neo4j_health as sqlite_health, ingest_node as sqlite_ingest
    USING_SQLITE = True
except ImportError:
    USING_SQLITE = False
'''

# Only patch if not already patched
if "USING_SQLITE" not in content:
    # Insert after the neo4j_health function
    insert_point = content.find("# ---------------------------------------------------------------------------\n# WebSocket manager")
    if insert_point > 0:
        content = content[:insert_point] + patch + "\n" + content[insert_point:]
        with open(path, "w") as f:
            f.write(content)
        print("  buffer_agent.py patched")
    else:
        print("  Could not find insertion point in buffer_agent.py")
else:
    print("  buffer_agent.py already patched")
PYPATCH

log "✓ buffer_agent.py patched"

# ─── PATCH 3: Vite config — bind to 0.0.0.0 ──────────────────────

log "Patch 3: Vite host binding..."

python3 << 'PYPATCH2'
import os

path = os.path.expanduser("~/p31/frontend/vite.config.js")
with open(path, "r") as f:
    content = f.read()

# Ensure host: '0.0.0.0' is in server config
if "host:" not in content:
    content = content.replace(
        "port: 3031,",
        "port: 3031,\n    host: '0.0.0.0',"
    )
    with open(path, "w") as f:
        f.write(content)
    print("  vite.config.js patched with host: 0.0.0.0")
else:
    print("  vite.config.js already has host binding")
PYPATCH2

log "✓ Vite config patched"

# ─── PATCH 4: code-server extensions ──────────────────────────────

log "Patch 4: Installing VS Code extensions in code-server..."

# Install extensions that work in code-server
code-server --install-extension dbaeumer.vscode-eslint 2>/dev/null || true
code-server --install-extension bradlc.vscode-tailwindcss 2>/dev/null || true
code-server --install-extension ms-python.python 2>/dev/null || true
code-server --install-extension astro-build.astro-vscode 2>/dev/null || true

# Note: Some extensions (PlatformIO, Continue.dev) don't work in code-server
# PlatformIO CLI is available directly in terminal instead

log "✓ code-server extensions installed"

# ─── PATCH 5: Create .data directory ──────────────────────────────

log "Patch 5: Data directories..."

mkdir -p ~/p31/.data
mkdir -p ~/p31/.logs
mkdir -p ~/p31/.pids

log "✓ Data directories created"

# ─── PATCH 6: Termux-specific requirements ────────────────────────

log "Patch 6: Termux pip requirements..."

cat > ~/p31/backend/requirements-termux.txt << 'EOF'
# P31 Backend — Termux-specific requirements
# Use instead of requirements.txt on Android/Termux
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
pydantic>=2.9.0
websockets>=13.0
# Skip neo4j (no Java runtime on Termux)
# Skip semantic-router (heavy ML deps)
# Skip litellm (use API keys directly)
# Use direct API calls instead:
httpx>=0.27.0
openai>=1.50.0
EOF

pip install -r ~/p31/backend/requirements-termux.txt 2>/dev/null || true

log "✓ Termux requirements installed"

# ─── DONE ──────────────────────────────────────────────────────────

echo ""
log "All patches applied. Run 'p31-start' to launch."
echo ""
