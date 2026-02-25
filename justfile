set windows-shell := ["C:/Program Files/Git/bin/bash.exe", "-c"]

default:
    @just --list

setup:
    cp -n .env.example .env || true
    docker compose build
    cd frontend && npm install
    cd docs && npm install
    cd backend && python -m pip install -r requirements.txt
    @echo "✓ Setup complete. Run 'just dev' to start services."

dev:
    docker compose up -d neo4j caddy
    docker compose --profile ai up -d
    @echo "Neo4j:   http://localhost:7474 (neo4j/p31delta)"
    @echo "LiteLLM: http://localhost:4000"

frontend:
    cd frontend && npm run dev

backend:
    cd backend && python -m uvicorn buffer_agent:app --reload --port 8031

docs:
    cd docs && npm run dev

firmware:
    cd firmware && pio run

test:
    cd backend && python -m pytest tests/ -v
    cd frontend && npm test

lint:
    cd backend && ruff check . && ruff format --check .
    cd frontend && npx eslint .

all:
    @just dev
    @just frontend & @just backend & @just docs &

down:
    docker compose --profile ai down

clean:
    docker compose down -v --remove-orphans
