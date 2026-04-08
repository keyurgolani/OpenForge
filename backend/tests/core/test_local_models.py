"""Tests for the Ollama integration helpers in local_models.py."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from openforge.services.local_models import (
    OLLAMA_EMBEDDING_FAMILIES,
    _is_ollama_embedding_model,
    fetch_ollama_models,
    get_ollama_url,
    get_unified_models,
    is_ollama_model,
    _MODEL_BY_ID,
)


# ── get_ollama_url ──────────────────────────────────────────────────────────


class TestGetOllamaUrl:
    def test_returns_url_from_settings(self):
        mock_settings = MagicMock(ollama_url="http://ollama:11434")
        with patch("openforge.services.local_models.get_settings", return_value=mock_settings):
            assert get_ollama_url() == "http://ollama:11434"

    def test_strips_trailing_slash(self):
        mock_settings = MagicMock(ollama_url="http://ollama:11434/")
        with patch("openforge.services.local_models.get_settings", return_value=mock_settings):
            assert get_ollama_url() == "http://ollama:11434"


# ── _is_ollama_embedding_model ──────────────────────────────────────────────


class TestIsOllamaEmbeddingModel:
    @pytest.mark.parametrize("name", [
        "nomic-embed-text",
        "nomic-embed-text:latest",
        "mxbai-embed-large",
        "mxbai-embed-large:v2",
        "all-minilm:latest",
        "snowflake-arctic-embed:latest",
        "bge-m3",
        "bge-large:latest",
    ])
    def test_embedding_models_detected(self, name: str):
        assert _is_ollama_embedding_model(name) is True

    @pytest.mark.parametrize("name", [
        "qwen2.5:3b",
        "llama3.2:3b",
        "smolvlm2:latest",
        "qwen2.5-coder:3b",
    ])
    def test_chat_models_not_detected(self, name: str):
        assert _is_ollama_embedding_model(name) is False


# ── is_ollama_model ─────────────────────────────────────────────────────────


class TestIsOllamaModel:
    def test_local_catalog_model_returns_false(self):
        # A model in LOCAL_MODELS should NOT be considered an Ollama model
        assert is_ollama_model("openai/whisper-tiny") is False
        assert is_ollama_model("all-MiniLM-L6-v2") is False

    def test_ollama_model_returns_true(self):
        # A model NOT in LOCAL_MODELS is assumed to be Ollama
        assert is_ollama_model("qwen2.5:3b") is True
        assert is_ollama_model("nomic-embed-text:latest") is True
        assert is_ollama_model("llama3.2:3b") is True


# ── fetch_ollama_models ─────────────────────────────────────────────────────


class TestFetchOllamaModels:
    @pytest.mark.asyncio
    async def test_returns_models_from_ollama(self):
        fake_response = MagicMock()
        fake_response.raise_for_status = MagicMock()
        fake_response.json.return_value = {
            "models": [
                {"name": "qwen2.5:3b", "size": 2_000_000_000},
                {"name": "nomic-embed-text:latest", "size": 275_000_000},
            ]
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=fake_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        mock_settings = MagicMock(ollama_url="http://ollama:11434")
        with patch("openforge.services.local_models.get_settings", return_value=mock_settings), \
             patch("openforge.services.local_models.httpx.AsyncClient", return_value=mock_client):
            models = await fetch_ollama_models()

        assert len(models) == 2

        chat_model = models[0]
        assert chat_model["id"] == "qwen2.5:3b"
        assert chat_model["capability_type"] == "chat"
        assert chat_model["engine"] == "ollama"
        assert chat_model["downloaded"] is True
        assert chat_model["source"] == "ollama"

        embed_model = models[1]
        assert embed_model["id"] == "nomic-embed-text:latest"
        assert embed_model["capability_type"] == "embedding"

    @pytest.mark.asyncio
    async def test_returns_empty_on_connection_error(self):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=Exception("Connection refused"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        mock_settings = MagicMock(ollama_url="http://ollama:11434")
        with patch("openforge.services.local_models.get_settings", return_value=mock_settings), \
             patch("openforge.services.local_models.httpx.AsyncClient", return_value=mock_client):
            models = await fetch_ollama_models()

        assert models == []


# ── get_unified_models ──────────────────────────────────────────────────────


class TestGetUnifiedModels:
    @pytest.mark.asyncio
    async def test_merges_ollama_and_local_models(self):
        fake_ollama = [
            {"id": "qwen2.5:3b", "name": "qwen2.5:3b", "capability_type": "chat",
             "engine": "ollama", "size_mb": 1907, "requires_gpu": False,
             "downloaded": True, "source": "ollama"},
        ]
        mock_settings = MagicMock(ollama_url="http://ollama:11434", models_root="/tmp/models")
        with patch("openforge.services.local_models.fetch_ollama_models", new_callable=AsyncMock, return_value=fake_ollama), \
             patch("openforge.services.local_models.get_settings", return_value=mock_settings):
            models = await get_unified_models()

        ids = [m["id"] for m in models]
        # Ollama model should be present
        assert "qwen2.5:3b" in ids
        # Local catalog models should be present
        assert "openai/whisper-tiny" in ids
        assert "all-MiniLM-L6-v2" in ids

    @pytest.mark.asyncio
    async def test_filters_by_capability_type(self):
        fake_ollama = [
            {"id": "nomic-embed-text:latest", "name": "nomic-embed-text:latest",
             "capability_type": "embedding", "engine": "ollama", "size_mb": 262,
             "requires_gpu": False, "downloaded": True, "source": "ollama"},
            {"id": "qwen2.5:3b", "name": "qwen2.5:3b", "capability_type": "chat",
             "engine": "ollama", "size_mb": 1907, "requires_gpu": False,
             "downloaded": True, "source": "ollama"},
        ]
        mock_settings = MagicMock(ollama_url="http://ollama:11434", models_root="/tmp/models")
        with patch("openforge.services.local_models.fetch_ollama_models", new_callable=AsyncMock, return_value=fake_ollama), \
             patch("openforge.services.local_models.get_settings", return_value=mock_settings):
            models = await get_unified_models(capability_type="embedding")

        # Should include Ollama embedding + local sentence-transformers embeddings
        for m in models:
            assert m["capability_type"] == "embedding"

        ids = [m["id"] for m in models]
        assert "nomic-embed-text:latest" in ids
        assert "all-MiniLM-L6-v2" in ids
        # Chat model should NOT be present
        assert "qwen2.5:3b" not in ids

    @pytest.mark.asyncio
    async def test_ollama_embeddings_alongside_sentence_transformers(self):
        """Ollama embedding models appear alongside sentence-transformers when filtering by embedding."""
        fake_ollama = [
            {"id": "nomic-embed-text:latest", "name": "nomic-embed-text:latest",
             "capability_type": "embedding", "engine": "ollama", "size_mb": 262,
             "requires_gpu": False, "downloaded": True, "source": "ollama"},
            {"id": "mxbai-embed-large:latest", "name": "mxbai-embed-large:latest",
             "capability_type": "embedding", "engine": "ollama", "size_mb": 670,
             "requires_gpu": False, "downloaded": True, "source": "ollama"},
        ]
        mock_settings = MagicMock(ollama_url="http://ollama:11434", models_root="/tmp/models")
        with patch("openforge.services.local_models.fetch_ollama_models", new_callable=AsyncMock, return_value=fake_ollama), \
             patch("openforge.services.local_models.get_settings", return_value=mock_settings):
            models = await get_unified_models(capability_type="embedding")

        sources = {m.get("source") for m in models}
        assert "ollama" in sources
        assert "local" in sources

        ollama_ids = [m["id"] for m in models if m.get("source") == "ollama"]
        assert "nomic-embed-text:latest" in ollama_ids
        assert "mxbai-embed-large:latest" in ollama_ids
