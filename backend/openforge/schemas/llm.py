from pydantic import BaseModel, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime


class LLMProviderCreate(BaseModel):
    provider_name: str
    display_name: str
    api_key: Optional[str] = None
    endpoint_id: str = "default"
    base_url: Optional[str] = None
    default_model: Optional[str] = None
    enabled_models: list[dict] = []


class LLMProviderUpdate(BaseModel):
    display_name: Optional[str] = None
    api_key: Optional[str] = None
    endpoint_id: Optional[str] = None
    base_url: Optional[str] = None
    default_model: Optional[str] = None
    enabled_models: Optional[list[dict]] = None


class LLMProviderResponse(BaseModel):
    id: UUID
    provider_name: str
    display_name: str
    endpoint_id: str
    base_url: Optional[str] = None
    default_model: Optional[str] = None
    enabled_models: list[dict] = []
    is_system_default: bool
    is_system: bool = False
    has_api_key: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ModelInfo(BaseModel):
    id: str
    name: str
    capability_type: Optional[str] = None
    engine: Optional[str] = None
    size_mb: Optional[int] = None
    requires_gpu: Optional[bool] = None
    downloaded: Optional[bool] = None


class ConnectionTestResult(BaseModel):
    success: bool
    message: str
    models_count: Optional[int] = None
