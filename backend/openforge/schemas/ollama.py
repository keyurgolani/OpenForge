"""Pydantic schemas for the Ollama management API."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class OllamaStatus(BaseModel):
    connected: bool
    model_count: int = 0


class OllamaModel(BaseModel):
    name: str
    size: int  # bytes
    modified_at: str
    parameter_size: str | None = None
    quantization: str | None = None


class OllamaPullRequest(BaseModel):
    model: str


class RecommendedOllamaModel(BaseModel):
    name: str
    capability: Literal["chat", "vision", "embedding", "code"]
    size_label: str
    description: str
    min_ram_gb: int = 2
