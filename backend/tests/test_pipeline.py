"""Tests for the buffer agent ingestion pipeline and spoon engine."""

import pytest
from fastapi.testclient import TestClient

from buffer_agent import app, score_voltage, spoons, SpoonEngine, SPOON_BASELINE


@pytest.fixture
def client():
    return TestClient(app)


class TestHealth:
    def test_health_returns_nominal(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "nominal"
        assert "uptime" in data
        assert "spoons" in data

    def test_health_spoons_at_baseline(self, client):
        resp = client.get("/health")
        assert resp.json()["spoons"] == SPOON_BASELINE


class TestIngest:
    def test_ingest_valid_node(self, client):
        resp = client.post(
            "/ingest",
            json={"content": "test node", "axis": "D"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ingested"
        assert data["axis"] == "D"
        assert "node_id" in data

    def test_ingest_invalid_axis(self, client):
        resp = client.post(
            "/ingest",
            json={"content": "test", "axis": "Z"},
        )
        assert resp.status_code == 400

    def test_ingest_deducts_spoons(self, client):
        initial = spoons.current
        client.post("/ingest", json={"content": "simple test", "axis": "D"})
        assert spoons.current < initial


class TestVoltage:
    def test_green_score(self):
        result = score_voltage("Hello, how are you?")
        assert result["level"] == "GREEN"
        assert result["composite"] < 3

    def test_red_score(self):
        result = score_voltage("URGENT blocker critical emergency")
        assert result["level"] in ("RED", "CRITICAL")
        assert result["composite"] >= 6

    def test_emotional_scoring(self):
        result = score_voltage("This is angry and unacceptable and frustrated")
        assert result["emotional"] > 0

    def test_canonical_formula(self):
        """Verify: composite = urgency*0.4 + emotional*0.3 + cognitive*0.3"""
        result = score_voltage("urgent review")
        expected = (result["urgency"] * 0.4) + (result["emotional"] * 0.3) + (result["cognitive"] * 0.3)
        assert abs(result["composite"] - round(min(10.0, expected), 2)) < 0.01


class TestSpoonEngine:
    def test_baseline(self):
        engine = SpoonEngine()
        assert engine.current == 12.0
        assert engine.level == "COMMAND"

    def test_deduct(self):
        engine = SpoonEngine()
        engine.deduct(5.0, "test")
        assert engine.current == 7.0

    def test_deduct_floor_zero(self):
        engine = SpoonEngine()
        engine.deduct(20.0, "test")
        assert engine.current == 0.0

    def test_restore(self):
        engine = SpoonEngine()
        engine.deduct(5.0)
        engine.restore(2.0)
        assert engine.current == 9.0

    def test_restore_ceiling(self):
        engine = SpoonEngine()
        engine.restore(5.0)
        assert engine.current == 12.0

    def test_context_switch(self):
        engine = SpoonEngine()
        engine.context_switch()
        assert engine.current == 10.5

    def test_levels(self):
        engine = SpoonEngine()
        assert engine.level == "COMMAND"  # 12

        engine.current = 8.0
        assert engine.level == "BUILD"

        engine.current = 4.0
        assert engine.level == "FOCUS"

        engine.current = 1.0
        assert engine.level == "BREATHE"

    def test_layer_mapping(self):
        engine = SpoonEngine()
        engine.current = 1.0
        assert engine.layer == 0
        engine.current = 4.0
        assert engine.layer == 1
        engine.current = 7.0
        assert engine.layer == 2
        engine.current = 10.0
        assert engine.layer == 3


class TestTaxonomy:
    def test_taxonomy_endpoint(self, client):
        resp = client.get("/taxonomy")
        assert resp.status_code == 200
        data = resp.json()
        assert "A" in data
        assert data["A"]["name"] == "Identity"
        assert data["B"]["color"] == "#4ecdc4"
