"""Shared test fixtures for the P31 backend."""

import pytest
from fastapi.testclient import TestClient

from buffer_agent import app, spoons, SpoonEngine


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture(autouse=True)
def reset_spoons():
    """Reset spoon state before each test."""
    spoons.current = spoons.baseline
    spoons.history.clear()
    yield
