"""Ollama management API — status, model listing, pull, delete, recommended catalog."""
from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from openforge.common.config import get_settings
from openforge.db.redis_client import get_redis
from openforge.schemas.ollama import (
    OllamaModel,
    OllamaPullRequest,
    OllamaStatus,
    RecommendedOllamaModel,
)

logger = logging.getLogger("openforge.api.ollama")

router = APIRouter()

# ── Recommended models catalog ────────────────────────────────────────────────
# Curated April 2026.  Every entry must exist in the official Ollama library.
# Organised by capability, then roughly by resource tier (light → heavy).
RECOMMENDED_MODELS: list[dict] = [
    # ── Chat (8 GB RAM tier) ─────────────────────────────────────────────
    {
        "name": "qwen3.5:4b",
        "capability": "chat",
        "size_label": "~3.4 GB",
        "description": "Qwen 3.5 4B — multimodal, thinking, 256K context, great on 8 GB RAM",
    },
    {
        "name": "lfm2.5-thinking:1.2b",
        "capability": "chat",
        "size_label": "~731 MB",
        "description": "Liquid AI 1.2B — ultra-fast hybrid model with thinking, ideal for edge",
    },
    {
        "name": "gemma4:e4b",
        "capability": "chat",
        "size_label": "~9.6 GB",
        "description": "Google Gemma 4 E4B — frontier multimodal, vision + audio, 128K context",
    },
    # ── Chat (16 GB RAM tier) ────────────────────────────────────────────
    {
        "name": "qwen3.5:9b",
        "capability": "chat",
        "size_label": "~6.6 GB",
        "description": "Qwen 3.5 9B — best quality at this size, multimodal + thinking",
    },
    {
        "name": "llama3.2:3b",
        "capability": "chat",
        "size_label": "~2 GB",
        "description": "Meta Llama 3.2 3B — fast, reliable general-purpose chat",
    },
    # ── Code ─────────────────────────────────────────────────────────────
    {
        "name": "qwen2.5-coder:7b",
        "capability": "code",
        "size_label": "~4.7 GB",
        "description": "Qwen 2.5 Coder 7B — top coding model for Python, JS, Go, Rust, SQL",
    },
    {
        "name": "qwen2.5-coder:3b",
        "capability": "code",
        "size_label": "~2 GB",
        "description": "Qwen 2.5 Coder 3B — lightweight code assistant for 8 GB machines",
    },
    # ── Vision ───────────────────────────────────────────────────────────
    {
        "name": "qwen3-vl:2b",
        "capability": "vision",
        "size_label": "~2.2 GB",
        "description": "Qwen3-VL 2B — lightweight vision-language model with thinking",
    },
    {
        "name": "qwen3-vl:8b",
        "capability": "vision",
        "size_label": "~5.5 GB",
        "description": "Qwen3-VL 8B — strong vision understanding, tool use, 3M+ pulls",
    },
    {
        "name": "gemma4:e4b",
        "capability": "vision",
        "size_label": "~9.6 GB",
        "description": "Google Gemma 4 E4B — frontier vision + audio, 128K context",
    },
    # ── Embedding ────────────────────────────────────────────────────────
    {
        "name": "nomic-embed-text",
        "capability": "embedding",
        "size_label": "~275 MB",
        "description": "Nomic Embed Text — 8K context, best balance of speed and accuracy",
    },
    {
        "name": "snowflake-arctic-embed2",
        "capability": "embedding",
        "size_label": "~353 MB",
        "description": "Snowflake Arctic Embed 2 — multilingual, strong retrieval performance",
    },
]


def _ollama_base_url() -> str:
    """Return the Ollama base URL from settings, stripped of trailing slashes."""
    return get_settings().ollama_url.rstrip("/")


# ── GET /status ───────────────────────────────────────────────────────────────

@router.get("/status", response_model=OllamaStatus)
async def get_ollama_status():
    """Return Ollama connection health and installed model count.

    Reads from Redis cache first (set by the background health task),
    falls back to a live check if the cache is missing.
    """
    # Try cached status first
    try:
        redis = await get_redis()
        cached = await redis.get("ollama:health")
        if cached:
            return OllamaStatus(**json.loads(cached))
    except Exception:
        pass

    # Live check fallback
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{_ollama_base_url()}/api/tags")
            resp.raise_for_status()
            models = resp.json().get("models", [])
            return OllamaStatus(connected=True, model_count=len(models))
    except Exception:
        return OllamaStatus(connected=False, model_count=0)


# ── GET /models ───────────────────────────────────────────────────────────────

@router.get("/models", response_model=list[OllamaModel])
async def list_ollama_models():
    """List models currently installed in the Ollama instance."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{_ollama_base_url()}/api/tags")
            resp.raise_for_status()
    except Exception as exc:
        raise HTTPException(502, f"Cannot reach Ollama: {exc}")

    result: list[OllamaModel] = []
    for m in resp.json().get("models", []):
        details = m.get("details") or {}
        result.append(OllamaModel(
            name=m.get("name", ""),
            size=m.get("size", 0),
            modified_at=m.get("modified_at", ""),
            parameter_size=details.get("parameter_size"),
            quantization=details.get("quantization_level"),
        ))
    return result


# ── GET /models/recommended ───────────────────────────────────────────────────

@router.get("/models/recommended", response_model=list[RecommendedOllamaModel])
async def list_recommended_models(
    capability: str | None = Query(None, description="Filter by capability: chat, vision, embedding, code"),
):
    """Return the curated catalog of recommended Ollama models, optionally filtered."""
    if capability:
        return [
            RecommendedOllamaModel(**m)
            for m in RECOMMENDED_MODELS
            if m["capability"] == capability
        ]
    return [RecommendedOllamaModel(**m) for m in RECOMMENDED_MODELS]


# ── POST /pull ────────────────────────────────────────────────────────────────

async def _stream_pull(model_name: str) -> AsyncGenerator[str, None]:
    """Proxy Ollama's NDJSON pull stream as server-sent events."""
    base = _ollama_base_url()
    async with httpx.AsyncClient(timeout=600.0) as client:
        async with client.stream(
            "POST",
            f"{base}/api/pull",
            json={"name": model_name, "stream": True},
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.strip():
                    yield f"data: {line}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/pull")
async def pull_ollama_model(body: OllamaPullRequest):
    """Pull (download) a model from the Ollama registry. Returns a streaming response."""
    return StreamingResponse(
        _stream_pull(body.model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── DELETE /models/{name} ────────────────────────────────────────────────────

@router.delete("/models/{name:path}", status_code=204)
async def delete_ollama_model(name: str):
    """Delete a model from the Ollama instance."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(
                "DELETE",
                f"{_ollama_base_url()}/api/delete",
                json={"name": name},
            )
            if resp.status_code == 404:
                raise HTTPException(404, f"Model '{name}' not found in Ollama")
            resp.raise_for_status()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Cannot reach Ollama: {exc}")
