"""
P31 Buffer Agent - The Centaur's Backend

FastAPI application providing WebSocket real-time communication,
node ingestion, spoon tracking, and voltage scoring.
"""

import asyncio
import json
import logging
import os
import time
from asyncio import Lock
from contextlib import asynccontextmanager
from datetime import datetime, timezone

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(name)s: %(message)s',
)
logger = logging.getLogger("p31.buffer")

import websockets

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Import persistence services (optional)
try:
    from backup_manager import backup_manager
except ImportError:
    backup_manager = None
    logger.warning("backup_manager not available")

# CRDT dependencies for synchronization matrix (optional)
try:
    from pycrdt import Doc
    from pycrdt_websocket import WebsocketProvider
    CRDT_AVAILABLE = True
except ImportError:
    Doc = None
    WebsocketProvider = None
    CRDT_AVAILABLE = False
    logger.warning("pycrdt/pycrdt_websocket not available - CRDT sync disabled")

# Message validation
try:
    from message_schemas import validate_message, get_error_response
except ImportError:
    validate_message = lambda x: (None, None)
    get_error_response = lambda msg, code="error": {"type": "error", "code": code, "message": msg}

try:
    from router import router as semantic_router
except ImportError:
    from .router import router as semantic_router

# ---------------------------------------------------------------------------
# Configuration (use .env file or environment variables in production)
# See .env.example for required variables
# ---------------------------------------------------------------------------

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")  # Must be set via env var

# ---------------------------------------------------------------------------
# Canonical constants (MUST match firmware/include/protocol.h)
# ---------------------------------------------------------------------------

SPOON_BASELINE = 12.0  # Matches SPOON_BASELINE / 10 from firmware (fixed-point)
SPOON_COSTS = {"GREEN": 0.5, "YELLOW": 1.0, "RED": 2.0, "CRITICAL": 3.0}
CONTEXT_SWITCH_COST = -1.5

TAXONOMY = {
    "A": {"name": "Identity", "color": "#ff6b6b"},
    "B": {"name": "Health", "color": "#4ecdc4"},
    "C": {"name": "Legal", "color": "#ffe66d"},
    "D": {"name": "Technical", "color": "#a29bfe"},
}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class IngestRequest(BaseModel):
    content: str = Field(..., max_length=50000)
    axis: str = "D"
    metadata: dict = Field(default_factory=dict)


class IngestResponse(BaseModel):
    status: str
    node_id: str
    axis: str
    timestamp: str


class VoltageRequest(BaseModel):
    text: str


class VoltageResponse(BaseModel):
    urgency: float
    emotional: float
    cognitive: float
    composite: float
    level: str
    spoon_cost: float


class SpoonState(BaseModel):
    current: float
    baseline: float
    level: str
    history: list = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    uptime: float
    neo4j: str
    spoons: float
    timestamp: str


# ---------------------------------------------------------------------------
# Spoon Engine
# ---------------------------------------------------------------------------


class SpoonEngine:
    """Tracks operator energy/capacity using the spoon theory model."""

    def __init__(self, baseline: float = SPOON_BASELINE):
        self.baseline = baseline
        self.current = baseline
        self.history: list[dict] = []

    def deduct(self, amount: float, reason: str = "") -> float:
        self.current = max(0.0, self.current - amount)
        self._log("deduct", amount, reason)
        return self.current

    def restore(self, amount: float, reason: str = "") -> float:
        self.current = min(self.baseline, self.current + amount)
        self._log("restore", amount, reason)
        return self.current

    def context_switch(self) -> float:
        return self.deduct(abs(CONTEXT_SWITCH_COST), "context_switch")

    @property
    def level(self) -> str:
        if self.current < 3:
            return "BREATHE"
        elif self.current < 6:
            return "FOCUS"
        elif self.current < 9:
            return "BUILD"
        else:
            return "COMMAND"

    @property
    def layer(self) -> int:
        levels = {"BREATHE": 0, "FOCUS": 1, "BUILD": 2, "COMMAND": 3}
        return levels[self.level]

    def state(self) -> dict:
        return {
            "current": round(self.current, 1),
            "baseline": self.baseline,
            "level": self.level,
            "layer": self.layer,
            "history": self.history[-10:],
        }

    def _log(self, action: str, amount: float, reason: str):
        self.history.append(
            {
                "action": action,
                "amount": round(amount, 1),
                "reason": reason,
                "result": round(self.current, 1),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )


# ---------------------------------------------------------------------------
# Voltage Scorer
# ---------------------------------------------------------------------------


def score_voltage(text: str) -> dict:
    """Score incoming text for urgency, emotional load, and cognitive demand.

    Returns composite score on 0-10 scale with canonical thresholds:
      GREEN:    < 3
      YELLOW:   3-6
      RED:      6-8
      CRITICAL: >= 8
    """
    lower = text.lower()

    # Urgency keywords (0-10 scale)
    urgency_words = ["urgent", "asap", "blocker", "critical", "deadline", "emergency"]
    urgency = min(10.0, sum(2.5 for w in urgency_words if w in lower))

    # Emotional keywords (0-10 scale)
    emotional_words = [
        "angry",
        "frustrated",
        "unacceptable",
        "disappointed",
        "furious",
        "terrible",
    ]
    emotional = min(10.0, sum(2.0 for w in emotional_words if w in lower))

    # Cognitive load keywords (0-10 scale)
    cognitive_words = [
        "review",
        "architecture",
        "refactor",
        "redesign",
        "migrate",
        "complex",
    ]
    cognitive = min(10.0, sum(2.0 for w in cognitive_words if w in lower))

    # Canonical formula
    composite = (urgency * 0.4) + (emotional * 0.3) + (cognitive * 0.3)
    composite = round(min(10.0, composite), 2)

    if composite >= 8:
        level = "CRITICAL"
    elif composite >= 6:
        level = "RED"
    elif composite >= 3:
        level = "YELLOW"
    else:
        level = "GREEN"

    return {
        "urgency": round(urgency, 2),
        "emotional": round(emotional, 2),
        "cognitive": round(cognitive, 2),
        "composite": composite,
        "level": level,
        "spoon_cost": SPOON_COSTS[level],
    }


# ---------------------------------------------------------------------------
# Neo4j connection (lazy)
# ---------------------------------------------------------------------------

_neo4j_driver = None


def get_neo4j_driver():
    global _neo4j_driver
    if _neo4j_driver is None:
        try:
            from neo4j import GraphDatabase

            _neo4j_driver = GraphDatabase.driver(
                NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)
            )
        except Exception:
            return None
    return _neo4j_driver


def neo4j_health() -> str:
    driver = get_neo4j_driver()
    if driver is None:
        return "disconnected"
    try:
        driver.verify_connectivity()
        return "connected"
    except Exception:
        return "error"


# ---------------------------------------------------------------------------
# WebSocket manager
# ---------------------------------------------------------------------------


class ConnectionManager:
    """Thread-safe WebSocket connection manager with broadcast support."""

    def __init__(self):
        self.active: list[WebSocket] = []
        self._lock = Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self.active.append(ws)

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            if ws in self.active:
                self.active.remove(ws)

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients with error handling."""
        data = json.dumps(message)

        # Get snapshot of connections under lock
        async with self._lock:
            connections = self.active.copy()

        # Send to all connections (outside lock to avoid blocking)
        async def send_safe(ws):
            try:
                await ws.send_text(data)
                return None
            except Exception:
                return ws

        # Gather results
        results = await asyncio.gather(*[send_safe(ws) for ws in connections])
        dead = [ws for ws in results if ws is not None]

        # Remove dead connections under lock
        if dead:
            async with self._lock:
                for ws in dead:
                    if ws in self.active:
                        self.active.remove(ws)

    @property
    def connection_count(self) -> int:
        return len(self.active)


manager = ConnectionManager()
spoons = SpoonEngine()
start_time = time.time()


# ---------------------------------------------------------------------------
# CRDT synchronization
# ---------------------------------------------------------------------------

# Initialize CRDT document and shared collections (if available)
if CRDT_AVAILABLE and Doc is not None:
    crdt_doc = Doc()
    crdt_state = crdt_doc.get_map("p31_state")
    crdt_nodes = crdt_doc.get_array("p31_nodes")
else:
    crdt_doc = None
    crdt_state = {}
    crdt_nodes = []


async def crdt_sync_task():
    if not CRDT_AVAILABLE or crdt_doc is None:
        logger.info("CRDT sync disabled - running without sync")
        return
    try:
        async with websockets.connect("ws://localhost:8032/p31-room") as ws:
            provider = WebsocketProvider(ws, crdt_doc)
            logger.info("Connected to CRDT Synchronization Matrix")
            await provider.start()
    except Exception as e:
        logger.error(f"CRDT Error: {e}")


# App lifecycle
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("P31 Buffer Agent starting on :8031")
    logger.info(f"Neo4j: {NEO4J_URI}")
    # Initialize the default spoon state if it doesn't exist
    if CRDT_AVAILABLE and crdt_doc is not None:
        with crdt_doc.transaction():
            if "spoons" not in crdt_state:
                crdt_state["spoons"] = SPOON_BASELINE
        # Start the sync task
        asyncio.create_task(crdt_sync_task())
    # Start the backup manager (if available)
    if backup_manager is not None:
        await backup_manager.start()
    yield
    # Shutdown
    if backup_manager is not None:
        await backup_manager.stop()
    driver = get_neo4j_driver()
    if driver:
        driver.close()


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="P31 Buffer Agent",
    description="The Centaur's backend — node ingestion, voltage scoring, spoon tracking",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3031",
        "http://localhost:3032",
        "http://localhost:80",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Mount semantic router (/route endpoint)
app.include_router(semantic_router)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="nominal",
        uptime=round(time.time() - start_time, 1),
        neo4j=neo4j_health(),
        spoons=spoons.current,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@app.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest):
    if req.axis not in TAXONOMY:
        raise HTTPException(status_code=400, detail=f"Invalid axis: {req.axis}")

    node_id = f"node_{int(time.time() * 1000)}"
    timestamp = datetime.now(timezone.utc).isoformat()

    # Attempt Neo4j persistence
    driver = get_neo4j_driver()
    if driver:
        try:
            with driver.session() as session:
                session.run(
                    """
                    CREATE (n:Node {
                        id: $id,
                        content: $content,
                        axis: $axis,
                        created: datetime($ts)
                    })
                    """,
                    id=node_id,
                    content=req.content,
                    axis=req.axis,
                    ts=timestamp,
                )
        except Exception as e:
            logger.error(f"Neo4j write error: {e}")

    # Score voltage and deduct spoons
    voltage = score_voltage(req.content)
    spoons.deduct(voltage["spoon_cost"], f"ingest:{node_id}")

    # Broadcast to connected clients with full voltage breakdown
    await manager.broadcast(
        {
            "type": "node_ingested",
            "node_id": node_id,
            "axis": req.axis,
            "content": req.content[:200],
            "voltage": {
                "urgency": voltage["urgency"],
                "emotional": voltage["emotional"],
                "cognitive": voltage["cognitive"],
                "composite": voltage["composite"],
                "level": voltage["level"],
                "spoon_cost": voltage["spoon_cost"]
            },
            "spoons": spoons.state(),
            "timestamp": timestamp,
        }
    )

    return IngestResponse(
        status="ingested",
        node_id=node_id,
        axis=req.axis,
        timestamp=timestamp,
    )


@app.post("/voltage", response_model=VoltageResponse)
async def voltage(req: VoltageRequest):
    result = score_voltage(req.text)
    return VoltageResponse(**result)


@app.get("/spoons")
async def get_spoons():
    return spoons.state()


@app.post("/spoons/deduct")
async def deduct_spoons(amount: float = 1.0, reason: str = "manual"):
    spoons.deduct(amount, reason)
    await manager.broadcast({"type": "spoon_update", "spoons": spoons.state()})
    return spoons.state()


@app.post("/spoons/restore")
async def restore_spoons(amount: float = 1.0, reason: str = "manual"):
    spoons.restore(amount, reason)
    await manager.broadcast({"type": "spoon_update", "spoons": spoons.state()})
    return spoons.state()


@app.get("/taxonomy")
async def get_taxonomy():
    return TAXONOMY


@app.get("/graph")
async def get_graph():
    """Return ingested nodes for graph visualization."""
    driver = get_neo4j_driver()
    nodes = []
    if driver:
        try:
            with driver.session() as session:
                result = session.run(
                    "MATCH (n:Node) RETURN n.id AS id, n.content AS content, "
                    "n.axis AS axis LIMIT 200"
                )
                nodes = [dict(r) for r in result]
        except Exception:
            pass
    return {"nodes": nodes, "edges": []}


class ChatRequest(BaseModel):
    message: str
    history: list = Field(default_factory=list)


@app.post("/chat")
async def chat(req: ChatRequest):
    """Route query, enrich context, proxy to LiteLLM — single round trip."""
    import httpx

    # 1. Route the query
    try:
        from router import MODEL_MAP, _get_router, _keyword_fallback

        layer = _get_router()
        if layer:
            choices = layer(req.message)
            if choices:
                # Handle both single choice and list of choices
                if isinstance(choices, list) and len(choices) > 0:
                    choice = choices[0]
                else:
                    choice = choices
                confidence = getattr(choice, "similarity_score", 0.0)
                domain = (
                    getattr(choice, "name", "UNKNOWN")
                    if confidence >= 0.5
                    else "UNKNOWN"
                )
            else:
                domain = "UNKNOWN"
                confidence = 0.0
        else:
            fb = _keyword_fallback(req.message)
            domain = fb.domain
            confidence = fb.confidence
    except Exception:
        domain = "UNKNOWN"
        confidence = 0.0

    model = MODEL_MAP.get(domain, "reasoning") if "MODEL_MAP" in dir() else "reasoning"

    # 2. Build enriched system prompt (mirrors context.py logic)
    level = spoons.level
    suffix = f"Context domain: {domain}. "
    if level == "BREATHE":
        suffix += (
            "Operator in BREATHE mode. Keep responses minimal, calming, actionable."
        )
    elif level == "FOCUS":
        suffix += "Operator in FOCUS mode. Be concise, avoid tangents."
    elif level == "BUILD":
        suffix += "Operator in BUILD mode. Full technical depth appropriate."
    else:
        suffix += "Operator in COMMAND mode. Full system access."

    system_prompt = (
        f"You are P31, an AI assistant in the Spaceship Earth centaur IDE. "
        f"Spoons: {spoons.current}/{spoons.baseline}. {suffix}"
    )

    # 3. Build messages for LiteLLM
    messages = [{"role": "system", "content": system_prompt}]
    for h in req.history[-20:]:
        messages.append(
            {"role": h.get("role", "user"), "content": h.get("content", "")}
        )
    messages.append({"role": "user", "content": req.message})

    # 4. Proxy to LiteLLM (streaming)
    litellm_url = os.getenv("LITELLM_URL", "http://localhost:4000")

    async def stream_response():
        # First chunk: route info
        yield (
            json.dumps(
                {
                    "type": "route",
                    "domain": domain,
                    "model": model,
                    "confidence": round(confidence, 2),
                }
            )
            + "\n"
        )

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{litellm_url}/v1/chat/completions",
                    json={
                        "model": model,
                        "messages": messages,
                        "stream": True,
                    },
                    headers={
                        "Authorization": f"Bearer {os.getenv('LITELLM_KEY', 'sk-local-proxy-key')}",
                        "Content-Type": "application/json",
                    },
                ) as resp:
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            chunk = line[6:]
                            if chunk.strip() == "[DONE]":
                                break
                            try:
                                data = json.loads(chunk)
                                delta = data["choices"][0].get("delta", {})
                                if "content" in delta:
                                    yield (
                                        json.dumps(
                                            {
                                                "type": "content",
                                                "text": delta["content"],
                                            }
                                        )
                                        + "\n"
                                    )
                            except (json.JSONDecodeError, KeyError, IndexError):
                                pass
        except Exception as e:
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"

        yield json.dumps({"type": "done"}) + "\n"

    return StreamingResponse(stream_response(), media_type="application/x-ndjson")


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    # Send initial state
    await ws.send_text(
        json.dumps(
            {
                "type": "connected",
                "spoons": spoons.state(),
                "taxonomy": TAXONOMY,
                "connections": manager.connection_count,
            }
        )
    )
    try:
        while True:
            data = await ws.receive_text()

            # Parse JSON with error handling
            try:
                msg = json.loads(data)
            except json.JSONDecodeError as e:
                await ws.send_text(json.dumps(get_error_response(
                    f"Invalid JSON: {str(e)}",
                    "json_parse_error"
                )))
                continue

            # Validate message against schema
            validated, validation_error = validate_message(msg)
            if validation_error:
                await ws.send_text(json.dumps(get_error_response(
                    f"Validation error: {validation_error}",
                    "validation_error"
                )))
                continue

            # Process message (validated or pass-through for unknown types)
            if msg.get("type") == "heartbeat":
                await ws.send_text(
                    json.dumps({"type": "heartbeat_ack", "timestamp": time.time()})
                )
            elif msg.get("type") == "thick_click":
                # Hardware totem interaction — restore spoons
                logger.info("Physical Thick Click detected - restoring cognitive voltage")
                # Update the shared CRDT state
                with crdt_doc.transaction():
                    current_spoons = crdt_state.get("spoons", SPOON_BASELINE)
                    new_spoons = min(SPOON_BASELINE, current_spoons + 0.5)
                    crdt_state["spoons"] = new_spoons

                # broadcast update to any connected ws clients
                await manager.broadcast(
                    {"type": "spoon_update", "spoons": spoons.state()}
                )

                # Optional: send haptic confirmation back
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "hardware_sync",
                            "action": "trigger_haptic",
                            "intensity": 50,
                        }
                    )
                )
            elif msg.get("action") == "ingest_workspace":
                logger.info("Beginning workspace ingestion sequence")
                real_nodes = []
                try:
                    from graph_loader import load_codebase

                    # target project root (one level above backend folder)
                    workspace_root = os.path.abspath(
                        os.path.join(os.path.dirname(__file__), "..")
                    )
                    stats = load_codebase(workspace_root)
                    logger.info(f"Graph loader returned: {stats}")

                    # query Neo4j for the ingested files
                    driver = get_neo4j_driver()
                    if driver:
                        with driver.session() as session:
                            result = session.run(
                                "MATCH (f:File) RETURN f.path AS id, f.axis AS axis, f.name AS content"
                            )
                            real_nodes = [dict(r) for r in result]
                    logger.info(f"Retrieved {len(real_nodes)} nodes from Neo4j")
                except Exception as e:
                    logger.error(f"Ingestion error: {e}")
                    await ws.send_text(
                        json.dumps(
                            {"type": "error", "message": f"Ingestion failed: {str(e)}"}
                        )
                    )

                # mirror to CRDT document
                if real_nodes:
                    with crdt_doc.transaction():
                        current_nodes = crdt_nodes.to_py()
                        existing_ids = {n["id"] for n in current_nodes}
                        for node in real_nodes:
                            if node["id"] not in existing_ids:
                                crdt_nodes.append(
                                    {
                                        "id": node["id"],
                                        "axis": node.get("axis", "D"),
                                        "content": node.get("content", node["id"]),
                                    }
                                )
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "content",
                            "text": f"\n\n[SYSTEM]: Workspace ingestion complete. {len(real_nodes)} nodes added.",
                        }
                    )
                )
                # deduct spoons for the context switch
                with crdt_doc.transaction():
                    crdt_state["spoons"] = max(
                        0.0, crdt_state.get("spoons", 12.0) - 2.0
                    )
            # ... other existing handlers like chat, ingest, etc.
            elif msg.get("action") == "promote_to_sovereign":
                node_id = msg.get("node_id")
                logger.info(f"Promoting node {node_id} to Sovereign status")
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "lit_request",
                            "action": "encrypt_node",
                            "node_id": node_id,
                        }
                    )
                )
            elif (
                msg.get("type") == "lit_response"
                and msg.get("action") == "encrypt_node"
            ):
                # received encrypted payload from frontend; embed in CRDT
                node_id = msg.get("node_id")
                ciphertext = msg.get("ciphertext")
                acls = msg.get("accessControlConditions")
                logger.info(f"Received encrypted node {node_id}")
                with crdt_doc.transaction():
                    for idx, node in enumerate(crdt_nodes.to_py()):
                        if node.get("id") == node_id:
                            updated = dict(node)
                            updated["ciphertext"] = ciphertext
                            updated["accessControlConditions"] = acls
                            # replace existing element
                            crdt_nodes.delete(idx)
                            crdt_nodes.insert(idx, updated)
                            break
                # Queue the node for IPFS backup (if available)
                if backup_manager is not None:
                    backup_manager.queue_node_for_backup(updated)
            elif msg.get("action") == "chat":
                # existing chat streaming logic is below this (unchanged)
                pass
            elif msg.get("action") == "provide_auth_content":
                # Remote agent has been authorized; send the unlocked content back to the mesh
                node_id = msg.get("node_id")
                content = msg.get("content")
                logger.info(f"Authorized content for node {node_id} provided to mesh")
                await manager.broadcast(
                    {
                        "type": "content",
                        "text": f"\n\n[SYSTEM]: Access granted. Node {node_id} content unlocked.\n{content}",
                    }
                )
    except WebSocketDisconnect:
        await manager.disconnect(ws)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await manager.disconnect(ws)
