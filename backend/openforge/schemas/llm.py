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


class LLMProviderUpdate(BaseModel):
    display_name: Optional[str] = None
    api_key: Optional[str] = None
    endpoint_id: Optional[str] = None
    base_url: Optional[str] = None
    default_model: Optional[str] = None


class LLMProviderResponse(BaseModel):
    id: UUID
    provider_name: str
    display_name: str
    endpoint_id: str
    base_url: Optional[str] = None
    default_model: Optional[str] = None
    is_system_default: bool
    has_api_key: bool
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
