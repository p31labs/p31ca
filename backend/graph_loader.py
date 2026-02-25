"""
P31 Graph Loader — Neo4j Codebase Knowledge Graph
Loads the P31 codebase structure into Neo4j for semantic navigation.
Provides query helpers for the context enrichment middleware.
"""

import os
from pathlib import Path
from typing import Optional

# Configuration - use environment variables (see .env.example)
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")  # Must be set via env var

# Canonical taxonomy axes
AXIS_MAP = {
    ".py": "D",
    ".ts": "D",
    ".tsx": "D",
    ".jsx": "D",
    ".js": "D",
    ".cpp": "D",
    ".h": "D",
    ".md": "A",
    ".mdx": "A",
    ".yml": "D",
    ".yaml": "D",
    ".json": "D",
    ".css": "D",
}


_driver = None


def get_driver():
    """Lazy Neo4j driver initialization (singleton)."""
    global _driver
    if _driver is not None:
        return _driver
    try:
        from neo4j import GraphDatabase
        _driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        return _driver
    except Exception as e:
        print(f"Neo4j connection failed: {e}")
        return None


def load_codebase(root_dir: str = ".", driver=None) -> dict:
    """Walk the codebase and create nodes + relationships in Neo4j.

    Returns summary of nodes created.
    """
    if driver is None:
        driver = get_driver()
    if driver is None:
        return {"status": "error", "message": "Neo4j unavailable"}

    root = Path(root_dir)
    skip_dirs = {
        "node_modules", "__pycache__", ".git", ".pio",
        "dist", "build", ".venv", "venv",
    }

    stats = {"files": 0, "directories": 0, "relationships": 0}

    with driver.session() as session:
        # Create constraints
        session.run(
            "CREATE CONSTRAINT IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE"
        )
        session.run(
            "CREATE CONSTRAINT IF NOT EXISTS FOR (d:Directory) REQUIRE d.path IS UNIQUE"
        )

        for dirpath, dirnames, filenames in os.walk(root):
            # Skip ignored directories
            dirnames[:] = [d for d in dirnames if d not in skip_dirs]

            rel_dir = os.path.relpath(dirpath, root)
            if rel_dir == ".":
                rel_dir = "/"

            # Create directory node
            session.run(
                """
                MERGE (d:Directory {path: $path})
                SET d.name = $name
                """,
                path=rel_dir,
                name=os.path.basename(dirpath) or "root",
            )
            stats["directories"] += 1

            # Create parent relationship
            parent = os.path.relpath(os.path.dirname(dirpath), root)
            if parent == ".":
                parent = "/"
            if rel_dir != "/":
                session.run(
                    """
                    MATCH (parent:Directory {path: $parent})
                    MATCH (child:Directory {path: $child})
                    MERGE (parent)-[:CONTAINS]->(child)
                    """,
                    parent=parent,
                    child=rel_dir,
                )
                stats["relationships"] += 1

            for filename in filenames:
                ext = os.path.splitext(filename)[1]
                axis = AXIS_MAP.get(ext, "D")
                file_path = os.path.join(rel_dir, filename)

                session.run(
                    """
                    MERGE (f:File {path: $path})
                    SET f.name = $name, f.extension = $ext, f.axis = $axis
                    WITH f
                    MATCH (d:Directory {path: $dir})
                    MERGE (d)-[:CONTAINS]->(f)
                    """,
                    path=file_path,
                    name=filename,
                    ext=ext,
                    axis=axis,
                    dir=rel_dir,
                )
                stats["files"] += 1
                stats["relationships"] += 1

    return {"status": "loaded", **stats}


def query_neighbors(file_path: str, depth: int = 2, driver=None) -> list[dict]:
    """Find related files within N hops in the graph."""
    if driver is None:
        driver = get_driver()
    if driver is None:
        return []

    with driver.session() as session:
        result = session.run(
            f"""
            MATCH (f:File {{path: $path}})-[*1..{min(depth, 4)}]-(neighbor)
            WHERE neighbor:File AND neighbor.path <> $path
            RETURN DISTINCT neighbor.path AS path,
                   neighbor.name AS name,
                   neighbor.axis AS axis
            LIMIT 20
            """,
            path=file_path,
        )
        return [dict(record) for record in result]


def query_by_axis(axis: str, limit: int = 50, driver=None) -> list[dict]:
    """Retrieve all files in a given taxonomy axis."""
    if driver is None:
        driver = get_driver()
    if driver is None:
        return []

    with driver.session() as session:
        result = session.run(
            """
            MATCH (f:File {axis: $axis})
            RETURN f.path AS path, f.name AS name
            ORDER BY f.name
            LIMIT $limit
            """,
            axis=axis,
            limit=limit,
        )
        return [dict(record) for record in result]
