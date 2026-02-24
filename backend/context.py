"""
P31 Context Enrichment Middleware
Enriches incoming AI queries with relevant context from the Neo4j knowledge graph,
spoon state, and taxonomy classification before routing to the AI mesh.
"""

from typing import Optional

from pydantic import BaseModel, Field

try:
    from graph_loader import query_by_axis, query_neighbors
except ImportError:
    from .graph_loader import query_by_axis, query_neighbors

# Canonical taxonomy
TAXONOMY = {
    "A": {"name": "Identity", "color": "#ff6b6b"},
    "B": {"name": "Health", "color": "#4ecdc4"},
    "C": {"name": "Legal", "color": "#ffe66d"},
    "D": {"name": "Technical", "color": "#a29bfe"},
}


class EnrichedContext(BaseModel):
    """Context bundle passed to the AI mesh alongside the user query."""

    original_query: str
    active_file: Optional[str] = None
    axis: str = "D"
    axis_name: str = "Technical"
    related_files: list[str] = Field(default_factory=list)
    spoon_level: Optional[str] = None
    spoon_count: Optional[float] = None
    disclosure_layer: int = 2
    system_prompt_suffix: str = ""


def classify_axis(query: str, active_file: Optional[str] = None) -> str:
    """Determine which taxonomy axis a query belongs to.

    Uses file path heuristics first, then keyword matching.
    """
    # File path heuristics
    if active_file:
        path_lower = active_file.lower()
        if any(k in path_lower for k in ["identity", "auth", "user", "profile"]):
            return "A"
        if any(k in path_lower for k in ["health", "spoon", "voltage", "wellness"]):
            return "B"
        if any(k in path_lower for k in ["legal", "license", "compliance", "court"]):
            return "C"

    # Keyword heuristics on query
    q = query.lower()
    if any(k in q for k in ["identity", "authentication", "profile", "user"]):
        return "A"
    if any(k in q for k in ["health", "spoon", "energy", "wellness", "breathing"]):
        return "B"
    if any(k in q for k in ["legal", "license", "compliance", "agpl"]):
        return "C"

    return "D"


def enrich(
    query: str,
    active_file: Optional[str] = None,
    spoon_state: Optional[dict] = None,
) -> EnrichedContext:
    """Build an enriched context bundle for the AI mesh.

    Args:
        query: The user's natural language query
        active_file: Currently open file path (if known)
        spoon_state: Current spoon engine state dict

    Returns:
        EnrichedContext with graph neighbors, taxonomy classification,
        and progressive disclosure layer.
    """
    axis = classify_axis(query, active_file)
    axis_info = TAXONOMY.get(axis, TAXONOMY["D"])

    # Fetch related files from graph
    related = []
    if active_file:
        neighbors = query_neighbors(active_file, depth=2)
        related = [n["path"] for n in neighbors[:10]]

    # Determine disclosure layer from spoon state
    layer = 2  # default: BUILD
    spoon_level = None
    spoon_count = None
    if spoon_state:
        spoon_count = spoon_state.get("current", 12.0)
        spoon_level = spoon_state.get("level", "BUILD")
        layer = spoon_state.get("layer", 2)

    # Build system prompt suffix based on disclosure layer
    suffix = _build_suffix(layer, axis, axis_info["name"])

    return EnrichedContext(
        original_query=query,
        active_file=active_file,
        axis=axis,
        axis_name=axis_info["name"],
        related_files=related,
        spoon_level=spoon_level,
        spoon_count=spoon_count,
        disclosure_layer=layer,
        system_prompt_suffix=suffix,
    )


def _build_suffix(layer: int, axis: str, axis_name: str) -> str:
    """Generate a system prompt suffix appropriate for the current state."""
    base = f"Context axis: {axis} ({axis_name}). "

    if layer == 0:
        return base + (
            "The operator is in BREATHE mode (very low energy). "
            "Keep responses minimal, calming, and actionable. "
            "Do not introduce new concepts or complexity."
        )
    elif layer == 1:
        return base + (
            "The operator is in FOCUS mode (low energy). "
            "Keep responses concise and focused on the immediate task. "
            "Avoid tangents."
        )
    elif layer == 2:
        return base + (
            "The operator is in BUILD mode (normal energy). "
            "Full technical depth is appropriate."
        )
    else:
        return base + (
            "The operator is in COMMAND mode (high energy). "
            "Full system access. Deep technical discussion welcome."
        )
