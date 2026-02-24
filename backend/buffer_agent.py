"""
P31 Buffer Agent — The Centaur's Backend
FastAPI application providing WebSocket real-time communication,
node ingestion, spoon tracking, and voltage scoring.
"""

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "p31delta")

# ---------------------------------------------------------------------------
# Canonical constants
# ---------------------------------------------------------------------------

SPOON_BASELINE = 12.0
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
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, message: dict):
        data = json.dumps(message)
        dead: list[WebSocket] = []
        for ws in self.active:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active.remove(ws)


manager = ConnectionManager()
spoons = SpoonEngine()
start_time = time.time()


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"P31 Buffer Agent starting on :8031")
    print(f"Neo4j: {NEO4J_URI}")
    yield
    # Shutdown
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
    allow_origins=["http://localhost:3031", "http://localhost:80"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
            print(f"Neo4j write error: {e}")

    # Score voltage and deduct spoons
    voltage = score_voltage(req.content)
    spoons.deduct(voltage["spoon_cost"], f"ingest:{node_id}")

    # Broadcast to connected clients
    await manager.broadcast(
        {
            "type": "node_ingested",
            "node_id": node_id,
            "axis": req.axis,
            "voltage": voltage,
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
            }
        )
    )
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "heartbeat":
                await ws.send_text(
                    json.dumps({"type": "heartbeat_ack", "timestamp": time.time()})
                )
            elif msg.get("type") == "thick_click":
                # Hardware totem interaction — restore spoons
                spoons.restore(0.5, "thick_click")
                await manager.broadcast(
                    {"type": "spoon_update", "spoons": spoons.state()}
                )
    except WebSocketDisconnect:
        manager.disconnect(ws)
