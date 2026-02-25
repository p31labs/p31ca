"""
P31 Semantic Router — AI Mesh Intelligence Layer
Routes developer queries to the optimal model based on domain classification.
Uses semantic-router for embedding-based classification.
"""

import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Override OpenAI config to target local LiteLLM proxy at Port 4000
# NOTE: sk-local-proxy-key is a placeholder for local development with LiteLLM proxy
# In production, set OPENAI_API_KEY and OPENAI_BASE_URL environment variables
os.environ.setdefault("OPENAI_API_KEY", os.getenv("LITELLM_KEY", "sk-local-dev"))
os.environ.setdefault("OPENAI_BASE_URL", os.getenv("LITELLM_URL", "http://localhost:4000/v1"))

router = APIRouter(prefix="/route", tags=["router"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class QueryRequest(BaseModel):
    query: str


class RouteResponse(BaseModel):
    domain: str
    model: str
    confidence: float


# ---------------------------------------------------------------------------
# Route definitions (dense utterance matrices)
# ---------------------------------------------------------------------------

# Model mapping: domain -> LiteLLM model name
MODEL_MAP = {
    "FIRMWARE": "code",
    "BACKEND": "code",
    "FRONTEND": "reasoning",
    "COGNITIVE": "reasoning",
    "DOCS": "multimodal",
    "UNKNOWN": "reasoning",
}

# Lazy initialization to avoid import-time failures
_router_layer = None


def _get_router():
    global _router_layer
    if _router_layer is not None:
        return _router_layer

    try:
        from semantic_router import Route
        from semantic_router.encoders import OpenAIEncoder
        from semantic_router.routers import SemanticRouter

        firmware_route = Route(
            name="FIRMWARE",
            utterances=[
                "How do I configure the ESP32 GPIO pins for output?",
                "Implement COBS encoding for the serial data stream.",
                "Calculate the CRC checksum for the data payload.",
                "Trigger the haptic motor via the I2C interface.",
                "Flash the firmware to the ESP32-S3 board.",
                "Read sensor data from the ADC pin.",
            ],
        )

        frontend_route = Route(
            name="FRONTEND",
            utterances=[
                "Implement a Three.js instanced mesh for rendering.",
                "Apply Tailwind CSS grid layout to the dashboard.",
                "Modify the jitterbug animation logic in the canvas.",
                "Add a React hook for WebSerial communication.",
                "Fix the instanceColor bug on InstancedMesh.",
                "Create a breathing pacer animation component.",
            ],
        )

        backend_route = Route(
            name="BACKEND",
            utterances=[
                "Establish a FastAPI websocket connection for broadcasts.",
                "Write a Neo4j Cypher query to retrieve node neighbors.",
                "Handle graph node CRDT synchronization across the mesh.",
                "Score incoming email for voltage and spoon cost.",
                "Add a new ingestion endpoint to the buffer agent.",
            ],
        )

        cognitive_route = Route(
            name="COGNITIVE",
            utterances=[
                "Update the spoon gauge VS Code extension.",
                "Add progressive disclosure to the interface.",
                "Implement the cognitive shield email batching.",
                "Modify the voltage scoring formula thresholds.",
            ],
        )

        docs_route = Route(
            name="DOCS",
            utterances=[
                "Write documentation for the protocol specification.",
                "Update the architecture diagram in Starlight.",
                "Add a getting started guide for new contributors.",
                "Document the CRDT synchronization strategy.",
            ],
        )

        encoder = OpenAIEncoder()
        routes = [
            firmware_route,
            frontend_route,
            backend_route,
            cognitive_route,
            docs_route,
        ]
        _router_layer = SemanticRouter(encoder=encoder, routes=routes)
        return _router_layer

    except Exception as e:
        print(f"Semantic router initialization failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("", response_model=RouteResponse)
async def route_query(request: QueryRequest):
    """Classify a developer query into a domain and recommended model."""
    layer = _get_router()

    if layer is None:
        # Fallback: keyword-based routing when semantic router unavailable
        return _keyword_fallback(request.query)

    try:
        choice = layer(request.query)
        confidence = (
            choice.similarity_score if choice.similarity_score is not None else 0.0
        )

        if choice.name is None or confidence < 0.5:
            return RouteResponse(domain="UNKNOWN", model="reasoning", confidence=confidence)

        domain = choice.name
        model = MODEL_MAP.get(domain, "reasoning")
        return RouteResponse(domain=domain, model=model, confidence=confidence)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _keyword_fallback(query: str) -> RouteResponse:
    """Simple keyword-based fallback when semantic router is unavailable."""
    q = query.lower()

    keywords = {
        "FIRMWARE": ["esp32", "gpio", "cobs", "crc", "haptic", "serial", "firmware", "pio"],
        "FRONTEND": ["react", "three.js", "vite", "jsx", "tsx", "canvas", "animation"],
        "BACKEND": ["fastapi", "neo4j", "websocket", "cypher", "ingest", "endpoint"],
        "COGNITIVE": ["spoon", "voltage", "shield", "extension", "disclosure"],
        "DOCS": ["document", "starlight", "mdx", "guide", "architecture"],
    }

    for domain, words in keywords.items():
        if any(w in q for w in words):
            return RouteResponse(
                domain=domain,
                model=MODEL_MAP[domain],
                confidence=0.75,
            )

    return RouteResponse(domain="UNKNOWN", model="reasoning", confidence=0.0)
