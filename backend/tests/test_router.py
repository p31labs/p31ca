"""Tests for the semantic router keyword fallback."""

from router import _keyword_fallback


class TestKeywordFallback:
    def test_firmware_routing(self):
        result = _keyword_fallback("How do I configure ESP32 GPIO?")
        assert result.domain == "FIRMWARE"
        assert result.model == "code"

    def test_frontend_routing(self):
        result = _keyword_fallback("Fix the Three.js animation")
        assert result.domain == "FRONTEND"
        assert result.model == "reasoning"

    def test_backend_routing(self):
        result = _keyword_fallback("Add a FastAPI endpoint")
        assert result.domain == "BACKEND"
        assert result.model == "code"

    def test_cognitive_routing(self):
        result = _keyword_fallback("Update the spoon gauge")
        assert result.domain == "COGNITIVE"
        assert result.model == "reasoning"

    def test_docs_routing(self):
        result = _keyword_fallback("Write architecture documentation")
        assert result.domain == "DOCS"
        assert result.model == "multimodal"

    def test_unknown_fallback(self):
        result = _keyword_fallback("What is the meaning of life?")
        assert result.domain == "UNKNOWN"
        assert result.model == "reasoning"
        assert result.confidence == 0.0
