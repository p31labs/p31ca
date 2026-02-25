# P31 Centaur IDE — Full Project Handoff

**Date:** 2026-02-24
**Prepared by:** Claude Code (Opus 4.6), across 2 sessions
**For:** Gemini (or any AI/developer picking this up)

---

## 1. WHAT IS P31

P31 ("Phosphorus-31") is a neurodivergent-focused development environment that merges cognitive science (spoon theory), knowledge graphs, AI model orchestration, hardware haptics, and 3D visualization into a unified "Everything Development Environment." Named after the phosphorus-31 isotope — the only stable isotope, the backbone of ATP energy transfer in biology.

The core metaphor: **your energy is finite and measurable.** Every task has a cognitive voltage. Every context switch costs spoons. The system tracks this, adapts the UI complexity to your current capacity, routes AI queries to the right model, and gives you a physical totem (ESP32-S3 "Thick Click") that restores energy through tactile interaction.

**Stack:**
- **Frontend:** React 18 + Three.js r128 + Vite (geodesic dome 3D visualization + HUD)
- **Backend:** Python FastAPI + WebSocket (buffer agent, voltage scoring, spoon engine)
- **Database:** Neo4j knowledge graph (with SQLite fallback)
- **AI Mesh:** LiteLLM proxy routing to Claude/DeepSeek/Gemini/Ollama
- **Firmware:** ESP32-S3 Arduino (USB CDC, COBS/CRC8 protocol, DRV2605L haptics)
- **Extensions:** 4 VS Code extensions (spoon gauge, cognitive shield, progressive disclosure, cockpit)
- **Docs:** Astro + Starlight
- **Infra:** Docker Compose (Neo4j, Ollama, LiteLLM, Caddy reverse proxy)

---

## 2. WHERE WE WERE (Before These Sessions)

The project had all the scaffolding but was functionally hollow:

- **Frontend was a spectator.** It received WebSocket events but couldn't DO anything. No ingestion, no AI chat, no graph visualization, no data export. The 3D dome existed but was basic — monotone green, tiny nodes, no bloom, no animation, flat background.
- **Backend had 9 API endpoints that the frontend never called.** The semantic router (`router.py`) was written but never mounted in the FastAPI app. Node content wasn't included in WebSocket broadcasts.
- **Firmware had 3 known DRV2605L bugs** identified in a hardware audit: missing LRA feedback register, no waveform stop before new playback, no I2C error handling.
- **No command system.** No keyboard shortcuts beyond `B` for breathing. No way to open panels, trigger actions, or navigate without mouse.
- **Breathing pacer was a CSS circle with a number.** For a project about cognitive load management, this was embarrassing.

---

## 3. WHERE WE ARE NOW (After These Sessions)

### What Was Built (Session 1: Visual Upgrade)

The frontend went from "basic bitch type shit" (user's words) to a living, breathing 3D visualization:

- **Three.js r128 geodesic dome** with 42 icosahedron vertices as instanced sphere nodes
- **UnrealBloom post-processing** (strength 2.2, radius 0.8, threshold 0.3) — aggressive glow that catches bright axis-colored nodes
- **Custom GLSL wireframe shader** that pulses with breathing pattern and dims as spoons deplete
- **Per-node bobbing animation** — each node floats at its own phase: `sin(elapsed * 1.2 + i * 1.7) * 0.04`
- **400-point starfield** with RGB color variation and slow drift
- **Axis connection lines** with additive blending connecting same-axis nodes
- **Ingestion particle bursts** — 15 particles per node click/add
- **OrbitControls** with auto-rotate, damping, zoom constraints
- **Raycasting** for node hover (1.8x scale) and click → inspector
- **Vignette shader** (offset 0.95, darkness 1.1) for cinematic framing
- **Emissive white material** (intensity 0.6) so per-instance axis colors bloom correctly (solved r128 bug #21786 where emissive was washing out instanceColor)
- **Voltage-driven brightness** — nodes push above 1.0 scalar so bloom catches them: `brightness = 1.0 + 0.8 * min(voltage/10, 1)`
- **CSS grid HUD layout** — header (spoon gauge), sidebar (inspector, activity, status), footer (shortcuts)
- **Progressive disclosure** — 4 layers (BREATHE/FOCUS/BUILD/COMMAND) that show/hide UI based on spoon count

### What Was Built (Session 2: Functional Depth)

The frontend went from spectator to fully interactive:

**Backend Fixes:**
- Mounted semantic router: `app.include_router(semantic_router)` — one line that unlocks the entire AI mesh
- Added `content` field to WebSocket `node_ingested` broadcast (was missing, nodes had no content on frontend)
- Added CORS for port 3032 (dev server was running there)
- New `GET /graph` endpoint returning Neo4j nodes for visualization
- New `POST /chat` endpoint — single round-trip architecture: routes query via semantic router, builds enriched system prompt with spoon-level disclosure, streams response from LiteLLM as NDJSON

**New Frontend Files (8):**

| File | Lines | What It Does |
|------|-------|--------------|
| `frontend/src/api.js` | ~100 | Fetch wrapper for all 10 backend endpoints + `streamChat()` async generator for NDJSON streaming |
| `frontend/src/ui/CommandMenu.jsx` | 81 | Ctrl+K command palette with filterable actions, arrow-key navigation, Enter to activate |
| `frontend/src/ui/IngestForm.jsx` | 124 | Node ingestion modal: textarea + 4-axis picker (colored pills) + live voltage preview (debounced 500ms via `POST /voltage`) showing urgency/emotional/cognitive bars + level badge + spoon cost |
| `frontend/src/ui/AiChat.jsx` | 108 | Streaming AI chat sidebar: progressive message rendering, route badge (domain/model), graceful offline fallback |
| `frontend/src/ui/GraphBrain.jsx` | 185 | 2D force-directed graph on Canvas 2D (NOT Three.js — avoids double WebGL context): repulsion + spring attraction + center gravity + damping. Merges backend graph + live nodesRef for local-first operation |
| `frontend/src/ui/ExportPanel.jsx` | 69 | 4 JSON export buttons: Activity Log, All Nodes + Voltage, Spoon History, Full Dump. Uses Blob + createObjectURL + click-to-download |
| `frontend/src/ui/BreathingPacer.jsx` | 245 | **Canvas 2D "Quantum Breath"** — 180-particle ring that expands/contracts with 4-2-6 breathing. Color shifts teal→gold→purple across phases. 8-frame particle trails, central radial glow orb, ripple rings on phase transitions, 50 ambient dust particles. Cosine-eased expansion with smooth radius/color lerp. Replaced the embarrassing CSS circle. |
| `frontend/src/ui/NodeInspector.jsx` | 102 | Rewritten with voltage breakdown bars (urgency=coral, emotional=gold, cognitive=purple 0-10), level badge (GREEN/YELLOW/RED/CRITICAL with color), composite + spoon cost, content preview (120 chars), timestamp, graceful "No voltage data" for seed nodes |

**Modified Frontend Files:**

| File | Changes |
|------|---------|
| `App.jsx` | Added imports for all 8 new components + `deductSpoons`/`restoreSpoons` from api.js. Added `showCommandMenu` + `activePanel` state. Keyboard shortcuts: Ctrl+K (command menu), single-key I/C/G/E/B (ingest/chat/graph/export/breathe), Escape closes whatever's open. Shortcuts suppressed in inputs/textareas. `handleAction` routes command menu selections. `handleDeductSpoon`/`handleRestoreSpoon` hit backend API. Removed inline BreathingPacer (moved to separate file). Updated footer to show all shortcut keys. |
| `SpoonGauge.jsx` | Added `onDeduct`/`onRestore` callback props, renders +/- buttons flanking the number when callbacks provided |
| `styles.css` | +350 lines: spoon buttons, inspector content, voltage bars/summary/badge, command overlay/palette/input/list/items, ingest modal/textarea/axis pills, all button variants (primary/secondary/close/sm/export), AI chat panel/messages/input/streaming/route-badge, graph brain overlay, export modal, breathing canvas/HUD/timer/label/hint, responsive overrides. Chat panel positioned `right: calc(var(--sidebar-w) + 24px)` to avoid sidebar overlap. |
| `vite.config.js` | Added `/v1` proxy to LiteLLM at port 4000 |

**Firmware Fixes (3 DRV2605L issues from hardware audit):**

| Fix | Location | What It Does |
|-----|----------|--------------|
| LRA feedback register | `setup()` after `setMode()` | Writes 0xB6 to register 0x1A via raw I2C. Enables back-EMF sensing for LRA actuators — prevents voltage overdrive. Checks `Wire.endTransmission()` return, sets `hapticReady = false` on failure. |
| Waveform stop | `CMD_HAPTIC` handler + `checkButton()` | Calls `haptic.stop()` before every `setWaveform()` + `go()` sequence. Prevents waveform queue conflicts. |
| I2C error handling | LRA register write | Checks `Wire.endTransmission() != 0` and gracefully disables haptics if I2C communication fails |

---

## 4. COMPLETE FILE MAP

```
p31ca/
├── HANDOFF.md                     ← YOU ARE HERE
├── README.md                      Project overview & quick-start
├── LICENSE                        AGPL-3.0
├── justfile                       Task runner (just backend, just frontend, etc.)
├── .env.example                   API keys template
├── docker-compose.yml             Neo4j + Ollama + LiteLLM + Caddy
├── docker-compose.dev.yml         Dev overrides
├── Caddyfile                      Reverse proxy config
│
├── config/
│   ├── taxonomy.json              4-axis taxonomy + voltage + disclosure layers
│   └── graph_schema.json          Neo4j node/relationship schema
│
├── backend/                       Python FastAPI
│   ├── buffer_agent.py            Main app: 10 endpoints + WS + SpoonEngine + voltage scoring (579 lines)
│   ├── router.py                  Semantic router: 5 domains + keyword fallback (184 lines)
│   ├── context.py                 Context enrichment: axis classification + disclosure (141 lines) **NOT INTEGRATED**
│   ├── graph_loader.py            Neo4j driver + queries (177 lines)
│   ├── graph_sqlite.py            SQLite fallback graph store (164 lines)
│   ├── requirements.txt           FastAPI, Neo4j, semantic-router, LiteLLM
│   ├── Dockerfile
│   └── tests/
│       ├── test_pipeline.py
│       └── test_router.py
│
├── frontend/                      React + Vite + Three.js
│   ├── index.html                 Entry HTML (JetBrains Mono font)
│   ├── vite.config.js             Port 3031, proxies: /api→8031, /ws→ws:8031, /v1→4000
│   ├── package.json               react 18.3, three 0.128.0, vite 5.4, vitest 2.1
│   ├── src/
│   │   ├── main.jsx               React entry
│   │   ├── App.jsx                Spaceship Earth: Three.js scene + HUD + all panel wiring (669 lines)
│   │   ├── api.js                 Fetch wrappers for all backend endpoints + streamChat
│   │   ├── constants.js           Colors, axes, spoon baseline, seed nodes, WS URL
│   │   ├── styles.css             All component styles (~740 lines)
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js    WS connection, node/voltage/activity state management
│   │   │   └── useThickClick.ts   Hardware totem hook (TypeScript)
│   │   ├── lib/
│   │   │   └── serial.ts          COBS/CRC8 protocol implementation (TypeScript)
│   │   ├── ui/
│   │   │   ├── BreathingPacer.jsx Canvas 2D particle breathing (245 lines)
│   │   │   ├── CommandMenu.jsx    Ctrl+K command palette (81 lines)
│   │   │   ├── IngestForm.jsx     Node ingestion + voltage preview (124 lines)
│   │   │   ├── AiChat.jsx         Streaming AI chat (108 lines)
│   │   │   ├── GraphBrain.jsx     2D force-directed graph (185 lines)
│   │   │   ├── ExportPanel.jsx    JSON data export (69 lines)
│   │   │   ├── SpoonGauge.jsx     Spoon meter + ±buttons (36 lines)
│   │   │   ├── NodeInspector.jsx  Node details + voltage bars (102 lines)
│   │   │   ├── ActivityFeed.jsx   Ingestion activity log (56 lines)
│   │   │   └── StatusBar.jsx      System status (23 lines)
│   │   └── __tests__/
│   │       ├── serial.test.ts     Protocol tests
│   │       └── spoons.test.ts     Spoon logic tests
│   └── dist/                      Build output
│
├── firmware/                      ESP32-S3 Arduino
│   ├── platformio.ini             Board config, USB CDC flags, DRV2605 library
│   ├── include/
│   │   └── protocol.h             Magic 0x31, CRC8-MAXIM, COBS, command IDs, haptic effects
│   └── src/
│       └── main.cpp               Main firmware: setup, loop, commands, haptics, button (290 lines)
│
├── extensions/                    VS Code Extensions (TypeScript)
│   ├── p31-spoon-gauge/           Status bar energy tracker
│   ├── p31-cognitive-shield/      Email voltage scoring via IMAP
│   ├── p31-progressive-disclosure/ UI complexity adaptation
│   └── p31-cockpit-panel/         Unified webview dashboard
│
├── docs/                          Astro + Starlight documentation site
│   └── src/content/docs/          MDX documentation pages
│
├── scripts/bin/                   Shell scripts: p31-start, p31-status, p31-stop
│
├── .github/                       CI/CD, issue templates, CodeRabbit, Dependabot
├── .devcontainer/                 Dev container config + LiteLLM routes
├── .vscode/                       Workspace settings + recommended extensions
└── .continue/                     Continue IDE extension config
```

---

## 5. BACKEND API REFERENCE

### All Endpoints (buffer_agent.py)

| Route | Method | Purpose | Request | Response |
|-------|--------|---------|---------|----------|
| `/health` | GET | Health check | — | `{status, uptime, neo4j, spoons, timestamp}` |
| `/ingest` | POST | Create node | `{content, axis, metadata}` | `{status, node_id, axis, timestamp}` + WS broadcast + spoon deduction |
| `/voltage` | POST | Score text | `{text}` | `{urgency, emotional, cognitive, composite, level, spoon_cost}` |
| `/spoons` | GET | Spoon state | — | `{current, baseline, level, layer, history[-10]}` |
| `/spoons/deduct` | POST | Manual deduct | `?amount=X&reason=Y` | Updated spoon state + WS broadcast |
| `/spoons/restore` | POST | Manual restore | `?amount=X&reason=Y` | Updated spoon state + WS broadcast |
| `/taxonomy` | GET | Axis definitions | — | `{A: {name, color}, B: ..., C: ..., D: ...}` |
| `/graph` | GET | Graph data | — | `{nodes: [{id, content, axis}], edges: []}` |
| `/chat` | POST | AI chat | `{message, history[]}` | Streaming NDJSON: `{type:"route"}` → `{type:"content"}` → `{type:"done"}` |
| `/route` | POST | Query classification | `{query}` | `{domain, model, confidence}` (from mounted semantic_router) |
| `/ws` | WS | Real-time | — | Bi-directional events |

### WebSocket Messages

| Type | Direction | Payload |
|------|-----------|---------|
| `connected` | server→client | `{spoons: {current, baseline}, taxonomy}` |
| `node_ingested` | server→client | `{node_id, axis, content, voltage: {urgency, emotional, cognitive, composite, level, spoon_cost}}` |
| `spoon_update` | server→client | `{spoons: {current, baseline, level, layer}}` |
| `heartbeat` | client→server | `{}` |
| `heartbeat_ack` | server→client | `{}` |
| `thick_click` | client→server | `{}` → restores 0.5 spoons |

### Voltage Scoring (inline in buffer_agent.py)

Keyword-counting heuristic (NOT ML):
- **Urgency** (0-10): `["urgent", "asap", "blocker", "critical", "deadline", "emergency"]` — +2.5 per match
- **Emotional** (0-10): `["angry", "frustrated", "unacceptable", "disappointed", "furious", "terrible"]` — +2.0 per match
- **Cognitive** (0-10): `["review", "architecture", "refactor", "redesign", "migrate", "complex"]` — +2.0 per match
- **Composite**: `urgency * 0.4 + emotional * 0.3 + cognitive * 0.3`
- **Level**: GREEN (<3) = 0.5 spoons, YELLOW (3-6) = 1.0, RED (6-8) = 2.0, CRITICAL (>=8) = 3.0

### Spoon Engine (inline in buffer_agent.py)

- Baseline: 12.0 spoons
- Levels: BREATHE (<3), FOCUS (3-6), BUILD (6-9), COMMAND (9-12)
- Layers: 0 (minimal UI), 1 (reduced), 2 (full), 3 (everything)
- Operations: deduct(amount, reason), restore(amount, reason), context_switch() = -1.5
- History: last 10 transactions, in-memory only (no persistence)

### Semantic Router (router.py)

5 domains: FIRMWARE, FRONTEND, BACKEND, COGNITIVE, DOCS → maps to model type (code/reasoning/multimodal).
Uses `semantic-router` library with embedding classification, falls back to keyword matching if unavailable.
Keyword fallback returns confidence=0.75 on match, 0.0 on miss.

### Chat Endpoint Architecture (`POST /chat`)

Single round-trip design (user requested this over two-step route+proxy):
1. Routes query via semantic router (keyword fallback if unavailable)
2. Builds enriched system prompt with spoon-level disclosure context
3. Constructs messages array with system prompt + history + user message
4. Streams response from LiteLLM via httpx as NDJSON chunks
5. First chunk: `{type: "route", domain, model}` (metadata)
6. Content chunks: `{type: "content", text}` (streaming tokens)
7. Final chunk: `{type: "done"}`

---

## 6. FRONTEND ARCHITECTURE

### Component Tree

```
App.jsx (root)
├── <canvas> — Three.js WebGLRenderer + EffectComposer
├── .hud-layout (CSS grid overlay, pointer-events: none)
│   ├── .hud-header
│   │   ├── P31 SPACESHIP EARTH title
│   │   ├── SpoonGauge (current, onDeduct, onRestore)
│   │   └── LIVE/OFFLINE indicator
│   ├── .hud-sidebar (layer >= 2)
│   │   ├── NodeInspector (node, voltage)
│   │   ├── ActivityFeed (activity[])
│   │   └── StatusBar (nodeCount, connected)
│   └── .hud-footer (layer >= 1)
│       └── Shortcut hints
├── BreathingPacer (active, onClose)          — Canvas 2D fullscreen overlay z:1000
├── CommandMenu (open, onClose, onAction)     — Modal overlay z:100
├── IngestForm (open, onClose)                — Modal overlay z:100
├── AiChat (open, onClose)                    — Fixed sidebar panel z:50
├── GraphBrain (open, onClose, nodesRef)      — Canvas 2D fullscreen overlay z:100
└── ExportPanel (open, onClose, nodesRef, voltageMapRef, activity) — Modal z:100
```

### State Flow

```
useWebSocket() hook
├── nodesRef (ref) — array of {id, content, axis}
├── voltageMapRef (ref) — {nodeId: {urgency, emotional, cognitive, composite, level}}
├── activity (state) — last 50 ingestion events
├── spoonCount (state) — current spoon level
├── nodeCount (state) — total nodes
├── connected (state) — WS connection status
└── onNodeAdded (ref callback) — triggers mesh update in App

App state:
├── showBreathing — boolean
├── showCommandMenu — boolean
├── activePanel — 'ingest'|'chat'|'brain'|'export'|null
├── selectedNode — clicked node object
└── selectedVoltage — voltage data for selected node

Data flow:
  WS broadcast → useWebSocket → nodesRef/voltageMapRef → updateInstancedMesh → Three.js colors
  WS broadcast → activity state → ActivityFeed component
  Click node → raycaster → setSelectedNode → NodeInspector
  Keyboard → state toggles → conditional rendering
  SpoonGauge ±buttons → api.js → backend → WS broadcast → spoonCount update
```

### Three.js Scene Details

- **Camera**: PerspectiveCamera(60, aspect, 0.1, 1000), position(0, 1.2, 7)
- **Renderer**: WebGLRenderer, ACES Filmic tone mapping, exposure 1.3, pixel ratio max 2
- **Lights**: Ambient(0x1a2a3a, 0.8) + KeyPoint(0xffe4c4, 1.2) + RimPoint(0x2dffa0, 0.8) + FillPoint(0xa29bfe, 0.4) + Hemisphere(0x1a3a5a, 0.050510, 0.4)
- **Dome**: IcosahedronGeometry(radius=3, subdivisions=2) → 42 unique vertices
- **Nodes**: InstancedMesh with SphereGeometry(0.15, 16, 16), MeshStandardMaterial(metalness=0.4, roughness=0.3, emissive=0xffffff, emissiveIntensity=0.6)
- **Wireframe**: Custom ShaderMaterial — pulses with `sin(time * 0.524)`, fades with `0.3 + 0.7 * spoonPct`
- **Bloom**: UnrealBloomPass(strength=2.2+stress, radius=0.8, threshold=0.3)
- **Vignette**: ShaderPass(VignetteShader, offset=0.95, darkness=1.1)
- **Particles**: 80 PointsMaterial particles with age-based decay, additive blending

### CRITICAL: Three.js r128 Bug #21786

`instanceColor` must be set via `setColorAt()` BEFORE the first render call. If you add instances after first render without pre-initializing all slots, colors will be wrong. The code pre-initializes all 42 slots with `AXIS_COLORS.D` in the scene setup, then overwrites with real data via `updateInstancedMesh()`.

### Keyboard Shortcuts

| Key | Action | Condition |
|-----|--------|-----------|
| Ctrl+K | Toggle command menu | Always (even in modals) |
| I | Open Ingest Form | No modal open |
| C | Open AI Chat | No modal open |
| G | Open Graph Brain | No modal open |
| E | Open Export Panel | No modal open |
| B | Open Breathing Pacer | No modal open |
| Escape | Close topmost overlay | Anything open |

Shortcuts are suppressed when focus is in `<input>` or `<textarea>` elements.

---

## 7. FIRMWARE PROTOCOL

### Frame Structure

```
[MAGIC=0x31] [CMD] [PAYLOAD...] [CRC8] → COBS encode → [ENCODED...] [DELIMITER=0x00]
```

- **Magic byte**: 0x31 (Phosphorus-31)
- **CRC8-MAXIM**: poly=0x31, init=0xFF, no reflection, no output XOR
- **COBS framing**: Eliminates 0x00 bytes from encoded data, 0x00 is frame delimiter
- **Max frame**: 256 bytes raw, 240 bytes payload
- **Baud**: 115200 over USB CDC

### Command IDs

| ID | Name | Direction | Payload |
|----|------|-----------|---------|
| 0x01 | CMD_HEARTBEAT | Both | None |
| 0x02 | CMD_HAPTIC | Host→Device | 1 byte (DRV2605L effect ID) |
| 0x03 | CMD_LED | Host→Device | 1 byte (brightness 0-255) |
| 0x10 | CMD_SPOON_REPORT | Device→Host | 2 bytes (uint16 big-endian, fixed-point *10) |
| 0x20 | CMD_CLICK_EVENT | Device→Host | None |
| 0x30 | CMD_BREATHING_SYNC | Host→Device | (future, currently no-op) |
| 0xA0 | CMD_ACK | Device→Host | None |
| 0xA1 | CMD_NACK | Device→Host | None |

### Haptic Effects (DRV2605L Library 1)

| ID | Name | Usage |
|----|------|-------|
| 1 | HAPTIC_CLICK | Button press feedback |
| 6 | HAPTIC_DOUBLE_CLICK | (available, unused) |
| 7 | HAPTIC_SOFT_BUMP | Startup feedback |
| 15 | HAPTIC_ALERT | (available, unused) |

### DRV2605L Initialization Sequence

1. `haptic.begin()` — I2C handshake at 0x5A
2. `haptic.selectLibrary(1)` — standard effect library
3. `haptic.setMode(DRV2605_MODE_INTTRIG)` — internal trigger mode
4. Raw I2C write: register 0x1A = 0xB6 (LRA feedback control, back-EMF sensing)
5. Error check: `Wire.endTransmission() != 0` → disable haptics
6. Startup bump: effect 7 (HAPTIC_SOFT_BUMP)

### Spoon Tracking (Firmware-Side)

- Fixed-point: value * 10 (so 12.0 = 120, 0.5 = 5)
- Baseline: 120 (12.0 spoons)
- Click restore: +5 (0.5 spoons), capped at baseline
- Reports every 10 seconds as 2-byte big-endian uint16

---

## 8. KNOWN BUGS & ARCHITECTURAL DEBT

### Critical

1. **`context.py` is dead code.** The `enrich()` function is defined but NEVER called anywhere in `buffer_agent.py`. The `/chat` endpoint manually builds its own system prompt instead of using the context module. This means the full axis classification, graph neighbor lookup, and layer-aware prompt suffix are all bypassed.

2. **Voltage scoring and spoon engine are inline in `buffer_agent.py`**, not separate modules. Makes testing and reuse harder. Should be extracted to `voltage.py` and `spoon_engine.py`.

3. **Spoon state is not persistent.** In-memory only, lost on server restart. History limited to last 10 transactions.

4. **Neo4j connection is lazy-loaded**, not initialized at startup. If Neo4j is down, the first endpoint call discovers this, not the health check.

### Medium

5. **Graph brain edge calculation is O(n^2) every frame.** `getEdges()` iterates all node pairs on every `requestAnimationFrame`. Should be cached and only rebuilt when nodes change.

6. **Axis connection lines in App.jsx are built once at scene init** from the initial seed nodes, never updated when new nodes are ingested via WebSocket.

7. **Chat panel history is lost on page reload.** No localStorage or session persistence.

8. **CORS origins are hardcoded.** No env var override. Will break in production.

9. **LiteLLM endpoint hardcoded to `localhost:4000`** in both router.py and buffer_agent.py. No env var configuration.

10. **`/v1` Vite proxy to LiteLLM exists but is unused.** Chat routes through `/api/chat` (server-side proxy), not directly to `/v1`. The proxy could be removed or repurposed.

### Low

11. **No error boundaries** for Three.js failures. A WebGL crash takes down the entire React app.

12. **No toast/notification system.** Ingest success, spoon changes, WS reconnect — all silent.

13. **Breathing pacer has no mobile touch optimization.** Click-to-close works but gestures would be better.

14. **StatusBar shows hardcoded "r128" and "bloom"** instead of dynamic values.

15. **No FPS counter or performance monitoring** in the 3D scene.

---

## 9. WHERE WE WANT TO BE (Roadmap)

### Immediate Priority (What Should Be Done Next)

1. **Integrate `context.py`** into the `/chat` endpoint. The enrichment module exists and does exactly what's needed — axis classification, graph neighbor lookup, spoon-level system prompt suffixes. Currently the chat endpoint manually approximates this. Wire it in properly.

2. **Extract `voltage.py` and `spoon_engine.py`** from `buffer_agent.py` into their own modules. Add proper unit tests.

3. **Persist spoon state** to SQLite (graph_sqlite.py already exists as precedent). Survive server restarts.

4. **Add toast notifications** on the frontend. Ingest success ("Node ingested to axis D"), spoon changes, WS reconnect events. Small floating toasts in the bottom-left, auto-dismiss after 3 seconds.

5. **Cache graph edges** in GraphBrain.jsx. Rebuild only when `simNodes` changes, not every frame.

6. **Make CORS and LiteLLM endpoints configurable** via environment variables.

### Short-Term (Next Sprint)

7. **Node search/filter** in the sidebar. Quick-find by content or axis.

8. **Markdown rendering in AI Chat.** Assistant messages currently use `white-space: pre-wrap` — should render markdown (code blocks, links, lists).

9. **Graph Brain interactivity** — click node for details, zoom/pan controls, node dragging.

10. **Spoon recharge mechanics** — time-based passive recovery (e.g., +0.1 per minute of non-context-switching).

11. **Dynamic axis connection lines** that update when new nodes are ingested.

12. **Breathing sync with firmware** — the `CMD_BREATHING_SYNC` command is defined but currently a no-op. Wire it so the totem's haptic pulses match the breathing pacer phases.

### Medium-Term (Architecture)

13. **Replace keyword voltage scoring with semantic scoring** using embeddings via LiteLLM. The current keyword counter is brittle.

14. **Real-time graph updates** — when a node is ingested, it should appear in GraphBrain without reopening the panel. WebSocket-driven graph mutations.

15. **Multi-user spoon tracking** — the current single global SpoonEngine doesn't support multiple concurrent users.

16. **VS Code extension integration** — the 4 extensions exist but the frontend dashboard doesn't communicate with them. WebSocket bridge or shared state.

17. **PWA offline support** — service worker for the frontend, local node cache for offline ingestion that syncs when reconnected.

### Long-Term (Vision)

18. **Full Neo4j knowledge graph visualization** with real relationships (not just same-axis edges). CONTAINS, RELATES_TO, TAGGED relationships from graph_schema.json.

19. **Hardware totem authentication** — `totem_auth.h` mentioned in the firmware audit as future work. Physical device attestation for privilege escalation.

20. **CRDT sync** — distributed conflict-free replication for multi-device operation (docs/architecture/crdt.mdx exists as spec).

21. **Email cognitive shield integration** — the `p31-cognitive-shield` VS Code extension scores email voltage via IMAP. Bridge this to the main dashboard.

---

## 10. DEVELOPMENT SETUP

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker (for Neo4j, LiteLLM, Ollama)
- PlatformIO (for firmware)

### Quick Start
```bash
# Clone
git clone <repo>
cd p31ca

# Backend
cd backend
pip install -r requirements.txt
uvicorn buffer_agent:app --host 0.0.0.0 --port 8031

# Frontend (separate terminal)
cd frontend
npm install
npm run dev  # runs on port 3031 (or 3032)

# Optional: Docker services
docker-compose up -d  # Neo4j :7474, LiteLLM :4000, Ollama :11434

# Optional: Firmware
cd firmware
pio run  # compile
pio run -t upload  # flash to ESP32-S3
```

### Environment Variables (.env.example)
```
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=
GOOGLE_API_KEY=
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=
LITELLM_MASTER_KEY=
```

### Key Ports
| Service | Port | Notes |
|---------|------|-------|
| Frontend (Vite) | 3031 (or 3032) | Dev server with HMR |
| Backend (FastAPI) | 8031 | REST + WebSocket |
| Neo4j Browser | 7474 | Graph visualization |
| Neo4j Bolt | 7687 | Driver protocol |
| LiteLLM | 4000 | AI model proxy |
| Ollama | 11434 | Local LLM |

---

## 11. DESIGN SYSTEM

### Color Palette
| Name | Hex | Usage |
|------|-----|-------|
| Void | #050510 | Background, deep space |
| Background | #0a0f1a | Panel backgrounds |
| Phosphorus | #2dffa0 | Primary accent, status indicators, user messages |
| Teal | #4ecdc4 | Axis B (Health), breathing inhale |
| Coral | #ff6b6b | Axis A (Identity), urgency voltage |
| Gold | #ffe66d | Axis C (Legal), emotional voltage, breathing hold |
| Purple | #a29bfe | Axis D (Technical), cognitive voltage, breathing exhale |
| Text | #e0e6ed | Body text |

### Typography
- Font: JetBrains Mono (fallback: Fira Code, monospace)
- Sizes: 9px (labels) → 72px (breathing timer)
- Letter-spacing: 1-6px for headers, 0 for body

### Z-Index Layers
| Z | Usage |
|---|-------|
| 0 | Three.js canvas |
| 10 | HUD grid overlay |
| 50 | AI Chat panel |
| 100 | Modals (CommandMenu, IngestForm, ExportPanel, GraphBrain) |
| 1000 | Breathing Pacer |

---

## 12. CORE CONCEPTS GLOSSARY

| Term | Meaning |
|------|---------|
| **Spoon Theory** | Disability/neurodivergent framework: finite daily energy units ("spoons") that deplete with activity |
| **Voltage** | Cognitive load score (0-10) calculated from urgency/emotional/cognitive keyword analysis |
| **Axis** | 4-way taxonomy: A=Identity, B=Health, C=Legal, D=Technical |
| **Layer** | Progressive disclosure level (0-3) driven by spoon count. Lower spoons = simpler UI |
| **Thick Click** | Physical ESP32-S3 totem that restores 0.5 spoons per button press via haptic feedback |
| **Buffer Agent** | The backend FastAPI service that buffers, scores, and routes all data |
| **Dome** | The 3D geodesic icosahedron visualization in the frontend |
| **Quantum Breath** | The Canvas 2D breathing pacer with particle ring animation |
| **AI Mesh** | Multi-model routing via LiteLLM (Claude for reasoning, DeepSeek for code, Gemini for vision) |
| **Semantic Router** | Embedding-based query classifier that routes developer questions to optimal AI model |

---

*This handoff represents the complete state of P31 as of 2026-02-24. The project is functional end-to-end: backend serves data, frontend visualizes it, firmware handles haptics, all connected via WebSocket. The main gaps are integration (context.py dead code, persistence) and polish (toasts, markdown, search). The bones are solid.*
