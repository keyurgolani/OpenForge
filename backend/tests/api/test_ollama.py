"""Tests for the Ollama management API endpoints."""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch, MagicMock

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from openforge.api import ollama as ollama_api
from openforge.schemas.ollama import OllamaStatus


def _make_client() -> TestClient:
    app = FastAPI()
    app.include_router(ollama_api.router)
    return TestClient(app)


def _mock_httpx_client(get_return=None, get_side_effect=None):
    """Create a mock httpx.AsyncClient that works as an async context manager."""
    mock_client = AsyncMock()
    if get_side_effect:
        mock_client.get = AsyncMock(side_effect=get_side_effect)
    else:
        mock_client.get = AsyncMock(return_value=get_return)

    @asynccontextmanager
    async def _fake_client(*args, **kwargs):
        yield mock_client

    return _fake_client


# ── GET /status ───────────────────────────────────────────────────────────────


class TestGetOllamaStatus:
    """Tests for GET /status endpoint."""

    def test_status_returns_connected_from_redis_cache(self):
        """When Redis has a cached health entry, return it without hitting Ollama."""
        cached = json.dumps({"connected": True, "model_count": 3})
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=cached)

        with patch.object(ollama_api, "get_redis", new=AsyncMock(return_value=mock_redis)):
            client = _make_client()
            r = client.get("/status")

        assert r.status_code == 200
        body = r.json()
        assert body["connected"] is True
        assert body["model_count"] == 3

    def test_status_returns_disconnected_from_redis_cache(self):
        """When Redis cache says disconnected, return that."""
        cached = json.dumps({"connected": False, "model_count": 0})
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=cached)

        with patch.object(ollama_api, "get_redis", new=AsyncMock(return_value=mock_redis)):
            client = _make_client()
            r = client.get("/status")

        assert r.status_code == 200
        body = r.json()
        assert body["connected"] is False
        assert body["model_count"] == 0

    def test_status_falls_back_to_live_check_when_cache_empty(self):
        """When Redis cache is empty, hit Ollama directly."""
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=None)

        ollama_response = httpx.Response(
            200,
            json={"models": [{"name": "qwen2.5:3b"}, {"name": "llama3.2:3b"}]},
            request=httpx.Request("GET", "http://ollama:11434/api/tags"),
        )

        with (
            patch.object(ollama_api, "get_redis", new=AsyncMock(return_value=mock_redis)),
            patch("httpx.AsyncClient", side_effect=_mock_httpx_client(get_return=ollama_response)),
        ):
            client = _make_client()
            r = client.get("/status")

        assert r.status_code == 200
        body = r.json()
        assert body["connected"] is True
        assert body["model_count"] == 2

    def test_status_returns_disconnected_when_ollama_unreachable(self):
        """When both Redis and Ollama fail, return disconnected."""
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(side_effect=Exception("Redis down"))

        with (
            patch.object(ollama_api, "get_redis", new=AsyncMock(return_value=mock_redis)),
            patch("httpx.AsyncClient", side_effect=_mock_httpx_client(
                get_side_effect=httpx.ConnectError("Connection refused"),
            )),
        ):
            client = _make_client()
            r = client.get("/status")

        assert r.status_code == 200
        body = r.json()
        assert body["connected"] is False
        assert body["model_count"] == 0

    def test_status_falls_back_when_redis_unavailable(self):
        """When get_redis itself raises, fall through to live check."""
        ollama_response = httpx.Response(
            200,
            json={"models": [{"name": "nomic-embed-text"}]},
            request=httpx.Request("GET", "http://ollama:11434/api/tags"),
        )

        with (
            patch.object(ollama_api, "get_redis", new=AsyncMock(side_effect=Exception("No Redis"))),
            patch("httpx.AsyncClient", side_effect=_mock_httpx_client(get_return=ollama_response)),
        ):
            client = _make_client()
            r = client.get("/status")

        assert r.status_code == 200
        body = r.json()
        assert body["connected"] is True
        assert body["model_count"] == 1


# ── GET /models ───────────────────────────────────────────────────────────────


class TestListOllamaModels:
    """Tests for GET /models endpoint."""

    def test_models_returns_empty_list_when_no_models(self):
        """When Ollama returns no models, endpoint returns an empty list."""
        ollama_response = httpx.Response(
            200,
            json={"models": []},
            request=httpx.Request("GET", "http://ollama:11434/api/tags"),
        )

        with patch("httpx.AsyncClient", side_effect=_mock_httpx_client(get_return=ollama_response)):
            client = _make_client()
            r = client.get("/models")

        assert r.status_code == 200
        assert r.json() == []

    def test_models_returns_model_list_with_details(self):
        """When Ollama returns models with full details, all fields are correctly mapped."""
        ollama_response = httpx.Response(
            200,
            json={
                "models": [
                    {
                        "name": "qwen2.5:3b",
                        "size": 1_928_000_000,
                        "modified_at": "2025-01-15T10:30:00Z",
                        "details": {
                            "parameter_size": "3B",
                            "quantization_level": "Q4_K_M",
                        },
                    },
                    {
                        "name": "nomic-embed-text:latest",
                        "size": 274_000_000,
                        "modified_at": "2025-02-01T08:00:00Z",
                        "details": {
                            "parameter_size": "137M",
                            "quantization_level": "F16",
                        },
                    },
                ]
            },
            request=httpx.Request("GET", "http://ollama:11434/api/tags"),
        )

        with patch("httpx.AsyncClient", side_effect=_mock_httpx_client(get_return=ollama_response)):
            client = _make_client()
            r = client.get("/models")

        assert r.status_code == 200
        body = r.json()
        assert len(body) == 2

        assert body[0]["name"] == "qwen2.5:3b"
        assert body[0]["size"] == 1_928_000_000
        assert body[0]["modified_at"] == "2025-01-15T10:30:00Z"
        assert body[0]["parameter_size"] == "3B"
        assert body[0]["quantization"] == "Q4_K_M"

        assert body[1]["name"] == "nomic-embed-text:latest"
        assert body[1]["size"] == 274_000_000
        assert body[1]["modified_at"] == "2025-02-01T08:00:00Z"
        assert body[1]["parameter_size"] == "137M"
        assert body[1]["quantization"] == "F16"

    def test_models_returns_502_when_ollama_unreachable(self):
        """When Ollama is unreachable, endpoint returns 502."""
        with patch("httpx.AsyncClient", side_effect=_mock_httpx_client(
            get_side_effect=httpx.ConnectError("Connection refused"),
        )):
            client = _make_client()
            r = client.get("/models")

        assert r.status_code == 502
