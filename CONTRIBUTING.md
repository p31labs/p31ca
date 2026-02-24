# Contributing to P31 EDE

Thank you for your interest in contributing to P31 Labs. This project builds
assistive technology for neurodivergent individuals — every contribution matters.

## Getting Started

1. Fork the repository
2. Clone and set up the devcontainer (see README.md)
3. Create a feature branch: `git checkout -b feat/your-feature`
4. Make your changes
5. Run tests: `just test && just lint`
6. Submit a pull request

## Development Workflow

### Commands

```bash
just setup      # Initial setup
just dev        # Start infrastructure services
just frontend   # Start Vite dev server (:3031)
just backend    # Start FastAPI dev server (:8031)
just docs       # Start Astro docs (:4321)
just firmware   # Build ESP32-S3 firmware
just test       # Run all tests
just lint       # Run ESLint + Ruff
```

### File Ownership (Delta Topology)

Different parts of the codebase have primary owners in the AI mesh:

| Domain | Primary Agent | Files |
|--------|--------------|-------|
| Architecture | Claude (Opus) | docker-compose, configs, .github/ |
| Cognitive Layer | Gemini | extensions/, docs/, backend/router.py |
| Firmware/Tests | DeepSeek | firmware/, tests/, serial.ts |

When contributing, match the style conventions of the domain you're working in.

### Canonical Protocol Constants

These values are immutable. Do not change them:

- Magic byte: `0x31`
- CRC8 polynomial: `0x31` (CRC8-MAXIM), init: `0xFF`
- Serial baud: `115200`
- Frame encoding: COBS

### Ports

Do not reassign these ports:

| Port | Service |
|------|---------|
| 3031 | Frontend |
| 8031 | Backend |
| 7474 | Neo4j Browser |
| 7687 | Neo4j Bolt |
| 11434 | Ollama |
| 4000 | LiteLLM |
| 4321 | Astro Docs |

## Code Style

- **Python:** Ruff for linting and formatting
- **TypeScript/JavaScript:** ESLint with flat config
- **C/C++:** PlatformIO defaults
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`)

## Accessibility

This project serves neurodivergent users. When contributing UI changes:

- Respect the progressive disclosure layers (0-3)
- Use the canonical font stack (Atkinson Hyperlegible for UI)
- Maintain high contrast with the P31 color palette
- Avoid unnecessary animations or sensory friction
- Test with reduced-motion preferences enabled

## Reporting Issues

Use the issue templates in `.github/ISSUE_TEMPLATE/`.

## License

By contributing, you agree that your contributions will be licensed under AGPL-3.0.
