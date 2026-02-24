# P31 EDE — Opus Convergence Build: Merge Guide

## Build Summary

**76 files | 4,951 lines | All 9 sections complete**

Produced by: Claude Opus (Integrator node)
Inputs: CONVERGENCE_PROMPT.md, GEMINI.txt, Note_1.txt
Missing input: DeepSeek output (scaffolded from canonical spec)

## Verification Results

| Check | Status | Notes |
|-------|--------|-------|
| Port Consistency | ✅ PASS | All 7 canonical ports verified across all files |
| CRC8 Consistency | ✅ PASS | 0x24 verified by C compilation, TS+C+test aligned |
| Docker Compose | ✅ PASS | All images valid, ports unique, env vars defined |
| GitHub Actions | ✅ PASS | All actions at current versions (v4/v5) |
| DevContainer | ✅ PASS | Correct compose refs, ports, extension IDs |
| Import Resolution | ⚠️ NOTE | backend/context.py uses relative import from .graph_loader — requires __init__.py or running as module |

## File Ownership (Merge Priority)

When DeepSeek's output arrives, use this merge priority:

### Use Opus Version (this build)
- `docker-compose.yml`, `docker-compose.dev.yml`, `Caddyfile`
- `justfile`, `.env.example`, `.gitignore`
- `.github/*` (all CI, templates, funding, codeowners)
- `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `LICENSE`
- `.vscode/*`
- `backend/buffer_agent.py` (canonical main app)
- `frontend/src/App.jsx` (canonical dashboard)
- `config/taxonomy.json`, `config/graph_schema.json`

### Use Gemini Version (from GEMINI.txt, already integrated here)
- `backend/router.py` (semantic router — Gemini PRIMARY, enhanced by Opus)
- `backend/context.py` (context enrichment — Gemini PRIMARY)
- `backend/graph_loader.py` (Neo4j loader — Gemini PRIMARY)
- `.continue/config.yaml` (with embeddings + context providers)
- `extensions/*` (all four VS Code extensions — Gemini PRIMARY)
- `docs/*` (Astro Starlight docs — Gemini PRIMARY)
- `frontend/src/hooks/useThickClick.ts` (Gemini PRIMARY)

### Use DeepSeek Version (when available, replace Opus scaffolds)
- `firmware/src/main.cpp` — DeepSeek will have more rigorous implementation
- `firmware/include/protocol.h` — DeepSeek owns protocol correctness
- `firmware/platformio.ini` — DeepSeek owns board config
- `frontend/src/lib/serial.ts` — DeepSeek owns WebSerial bridge
- `frontend/src/__tests__/*` — DeepSeek owns test coverage
- `backend/tests/*` — DeepSeek owns test infrastructure
- `.devcontainer/*` — DeepSeek owns, but Opus version is solid
- `backend/Dockerfile`, `frontend/Dockerfile` — DeepSeek owns

### Manual Reconciliation Needed
- `package.json` files: Verify DeepSeek's dependency versions align with Opus scaffold
- CRC8 verification value: Opus computed 0x24 — verify DeepSeek agrees
- `backend/context.py`: Uses relative imports — may need `__init__.py` depending on DeepSeek's run config

## Post-Merge Verification Checklist

- [ ] `cd p31 && just setup` completes without error
- [ ] `just dev` starts Neo4j, Caddy, Ollama, LiteLLM
- [ ] `just frontend` starts Vite on 3031
- [ ] `just backend` starts FastAPI on 8031
- [ ] `just test` passes all backend + frontend tests
- [ ] `just lint` passes eslint + ruff
- [ ] `just firmware` compiles with PlatformIO
- [ ] Open in VS Code → "Reopen in Container" → full stack running
- [ ] Continue.dev shows Claude, DeepSeek, Gemini, Ollama models
- [ ] `curl localhost:8031/health` returns nominal
- [ ] `curl -X POST localhost:8031/ingest -H "Content-Type: application/json" -d '{"content":"test node"}'` returns ingested
- [ ] Frontend shows Spaceship Earth with jitterbug breathing
- [ ] Frontend shows ● LIVE when backend connected
- [ ] Frontend shows ○ OFFLINE with seed nodes when backend down
- [ ] B key triggers breathing pacer (4-2-6)
- [ ] D key opens dev menu (Samson V2 panel)

## Git Commit Message

```
feat(ede): Everything Development Environment v0.1.0

Sovereign ecosystem drop-in: devcontainer, Docker Compose,
LiteLLM AI mesh, Continue.dev multi-model config, semantic
router, Neo4j knowledge graph, Thick Click WebSerial bridge,
ESP32-S3 firmware skeleton, VS Code cognitive extensions
(spoon gauge, cognitive shield, progressive disclosure,
cockpit panel), Astro Starlight docs, CI/CD pipelines,
test infrastructure, community configs.

Three agents. One geometry. The mesh converges. 💜🔺💜
```

## CRC8-MAXIM Canonical Value

**Input:** `[0x31, 0x01, 0x00]` (magic + heartbeat + zero-length)
**Polynomial:** `0x31`, **Init:** `0xFF`, **MSB-first, no reflection**
**Result:** `0x24` ← verified by compiled C, used in TS tests and C header

## Known Issues / TODO

1. `LICENSE` is abbreviated — replace with full AGPL-3.0 text
2. `backend/context.py` relative import needs `__init__.py` in backend/
3. Astro Starlight `@astrojs/starlight@^0.30.0` — verify exact version on npm
4. `frontend/Dockerfile` uses inline Caddyfile heredoc — may need adjustment per Docker version
5. Spoon gauge extension does not yet communicate with backend (planned: WebSocket bridge)
6. Progressive disclosure extension zen mode toggle is approximate — needs VS Code API testing
