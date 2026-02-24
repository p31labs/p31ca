# P31 EDE — Everything Development Environment

> The Centaur's cockpit. Three agents. One geometry. The mesh converges. 💜🔺💜

**P31 Labs** builds open-source assistive technology for neurodivergent individuals.
The EDE is our sovereign development ecosystem — a drop-in devcontainer that
orchestrates hardware, firmware, AI mesh networking, and cognitive interface tools
into a single coherent environment.

## Quick Start

```bash
git clone https://github.com/p31labs/p31.git
cd p31
cp .env.example .env    # Fill in your API keys
just setup
just dev
```

Then open in VS Code → **Reopen in Container** → full stack running.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Caddy (Reverse Proxy)           │
│                  :80 / :443                      │
├────────────────┬────────────────┬────────────────┤
│ Frontend :3031 │ Backend :8031  │ Docs :4321     │
│ React + Three  │ FastAPI + WS   │ Astro Starlight│
├────────────────┴────────────────┴────────────────┤
│              AI Mesh (LiteLLM :4000)             │
│  Claude (reasoning) │ DeepSeek (code) │ Ollama   │
├──────────────────────────────────────────────────┤
│           Neo4j Knowledge Graph :7474            │
├──────────────────────────────────────────────────┤
│        ESP32-S3 Firmware (Thick Click)           │
│        WebSerial ↔ COBS/CRC8 @ 115200           │
└──────────────────────────────────────────────────┘
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Frontend (Vite) | 3031 | Spaceship Earth dashboard |
| Backend (FastAPI) | 8031 | Buffer agent, WebSocket, ingestion |
| Neo4j | 7474 / 7687 | Knowledge graph |
| LiteLLM | 4000 | AI model routing proxy |
| Ollama | 11434 | Local model inference |
| Astro Docs | 4321 | Documentation site |

## Cognitive Layer

The EDE includes four VS Code extensions designed for neurodivergent operators:

- **Spoon Gauge** — real-time energy/capacity tracking (12 spoon baseline)
- **Cognitive Shield** — email voltage scoring with 60s batching
- **Progressive Disclosure** — UI complexity adapts to spoon level (Layers 0-3)
- **Cockpit Panel** — unified status dashboard

## Protocol

All hardware communication uses the P31 serial protocol:

- Magic byte: `0x31` (Phosphorus-31)
- CRC8-MAXIM polynomial: `0x31`, init: `0xFF`
- Frame encoding: COBS with `0x00` delimiter
- Baud: 115200 over USB CDC (GPIO19/20)

## AI Mesh (Delta Topology)

The `.continue/config.yaml` routes queries to the optimal model:

- **Claude** → reasoning, architecture, integration
- **DeepSeek** → code generation, firmware, tests
- **Gemini** → vision, documentation, long context
- **Ollama (local)** → offline summarization, privacy-sensitive tasks

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[AGPL-3.0](LICENSE) — P31 Labs (phosphorus31.org)

Built with 💜 by the Centaur.
