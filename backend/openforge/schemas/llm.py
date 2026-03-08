from pydantic import BaseModel, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime


# ── Standard Providers ────────────────────────────────────────────────────────

class LLMProviderCreate(BaseModel):
    provider_name: str
    display_name: str
    api_key: Optional[str] = None
    endpoint_id: str = "default"
    base_url: Optional[str] = None
    enabled_models: list[dict] = []  # [{"id": "gpt-4o", "name": "GPT-4o", "capabilities": ["chat","vision"]}]


class LLMProviderUpdate(BaseModel):
    display_name: Optional[str] = None
    api_key: Optional[str] = None
    endpoint_id: Optional[str] = None
    base_url: Optional[str] = None


class LLMProviderResponse(BaseModel):
    id: UUID
    provider_name: str
    display_name: str
    endpoint_id: str
    base_url: Optional[str] = None
    has_api_key: bool
    models: list[dict] = []  # [{"id": "...", "model_id": "...", "display_name": "...", "capabilities": [...], "is_enabled": bool}]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ModelInfo(BaseModel):
    id: str
    name: str


class ConnectionTestResult(BaseModel):
    success: bool
    message: str
    models_count: Optional[int] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

class EndpointCreate(BaseModel):
    endpoint_type: str  # "standard" or "virtual"
    display_name: Optional[str] = None
    # Standard
    provider_id: Optional[UUID] = None
    model_id: Optional[str] = None
    # Virtual
    virtual_provider_id: Optional[UUID] = None


class EndpointResponse(BaseModel):
    id: UUID
    endpoint_type: str
    display_name: Optional[str] = None
    provider_id: Optional[UUID] = None
    model_id: Optional[str] = None
    virtual_provider_id: Optional[UUID] = None
    is_default_chat: bool = False
    is_default_vision: bool = False
    is_default_tts: bool = False
    is_default_stt: bool = False
    # Resolved display info (populated by service)
    provider_name: Optional[str] = None
    provider_display_name: Optional[str] = None
    virtual_type: Optional[str] = None
    virtual_display_name: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Virtual Providers ─────────────────────────────────────────────────────────

class VirtualProviderCreate(BaseModel):
    virtual_type: str  # "router", "council", "optimizer"
    display_name: str
    description: Optional[str] = None


class VirtualProviderUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None


class VirtualProviderResponse(BaseModel):
    id: UUID
    virtual_type: str
    display_name: str
    description: Optional[str] = None
    endpoint_id: Optional[UUID] = None  # The auto-created endpoint for this VP
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Router Config ─────────────────────────────────────────────────────────────

class RouterTierData(BaseModel):
    complexity_level: str
    endpoint_id: UUID
    priority: int = 0


class RouterConfigCreate(BaseModel):
    routing_endpoint_id: UUID
    routing_prompt: Optional[str] = None
    tiers: list[RouterTierData] = []


class RouterConfigResponse(BaseModel):
    id: UUID
    virtual_provider_id: UUID
    routing_endpoint_id: UUID
    routing_prompt: Optional[str] = None
    tiers: list[dict] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Council Config ────────────────────────────────────────────────────────────

class CouncilMemberData(BaseModel):
    endpoint_id: UUID
    display_label: Optional[str] = None


class CouncilConfigCreate(BaseModel):
    chairman_endpoint_id: UUID
    judging_prompt: Optional[str] = None
    parallel_execution: bool = True
    members: list[CouncilMemberData] = []


class CouncilConfigResponse(BaseModel):
    id: UUID
    virtual_provider_id: UUID
    chairman_endpoint_id: UUID
    judging_prompt: Optional[str] = None
    parallel_execution: bool = True
    members: list[dict] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Optimizer Config ──────────────────────────────────────────────────────────

class OptimizerConfigCreate(BaseModel):
    optimizer_endpoint_id: UUID
    target_endpoint_id: UUID
    optimization_prompt: Optional[str] = None
    additional_context: Optional[str] = None


class OptimizerConfigResponse(BaseModel):
    id: UUID
    virtual_provider_id: UUID
    optimizer_endpoint_id: UUID
    target_endpoint_id: UUID
    optimization_prompt: Optional[str] = None
    additional_context: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Embedding Config ───────────────────────────────────────────────────────────

class EmbeddingConfigUpdate(BaseModel):
    mode: str  # "native" or "provider"
    native_model: Optional[str] = None
    provider_endpoint_id: Optional[UUID] = None


class EmbeddingConfigResponse(BaseModel):
    mode: str  # "native" or "provider"
    native_model: str = "all-MiniLM-L6-v2"
    provider_endpoint_id: Optional[UUID] = None
