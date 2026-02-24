"""
P31 Graph Store — SQLite Fallback (Termux / No-Docker)

Drop-in replacement for Neo4j graph_loader functions when
Neo4j is unavailable (Android/Termux, lightweight deployments).

Uses SQLite for persistent graph storage with the same API surface.
"""

import json
import os
import sqlite3
from pathlib import Path
from typing import Optional

DB_PATH = os.getenv("P31_GRAPH_DB", os.path.join(os.path.expanduser("~"), "p31", ".data", "graph.db"))

# Canonical taxonomy axis map
AXIS_MAP = {
    ".py": "D", ".ts": "D", ".tsx": "D", ".jsx": "D", ".js": "D",
    ".cpp": "D", ".h": "D", ".md": "A", ".mdx": "A",
    ".yml": "D", ".yaml": "D", ".json": "D", ".css": "D",
}


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


def neo4j_health() -> str:
    """Report SQLite health (compatibility with buffer_agent)."""
    try:
        conn = _ensure_db()
        count = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        conn.close()
        return f"sqlite({count} nodes)"
    except Exception:
        return "sqlite(error)"


def ingest_node(node_id: str, content: str, axis: str, voltage: Optional[dict] = None) -> bool:
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
    """Find related files by axis similarity (simplified graph traversal)."""
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
    skip_dirs = {"node_modules", "__pycache__", ".git", ".pio", "dist", "build", ".venv"}
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
            axis = AXIS_MAP.get(ext, "D")
            file_path = os.path.join(rel_dir, filename)
            conn.execute(
                "INSERT OR REPLACE INTO files (path, name, extension, axis) VALUES (?, ?, ?, ?)",
                (file_path, filename, ext, axis),
            )
            stats["files"] += 1

    conn.commit()
    conn.close()
    return {"status": "loaded", **stats}


def get_driver():
    """Compatibility shim — returns None (no Neo4j)."""
    return None
