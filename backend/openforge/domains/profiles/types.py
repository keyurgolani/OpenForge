"""
Profile domain types.

This module defines the core types and enums for Agent Profiles.
"""

from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ProfileRole(str, Enum):
    """Roles that a profile can play."""
    
    ASSISTANT = "assistant"  # General purpose assistant
    SPECIALIST = "specialist"  # Domain-specific expert
    WORKER = "worker"  # Background task worker
    COORDINATOR = "coordinator"  # Orchestrates other profiles
    REVIEWER = "reviewer"  # Reviews and validates outputs


class ProfileStatus(str, Enum):
    """Status of a profile."""
    
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class AgentProfile(BaseModel):
    """
    Agent Profile - a worker abstraction defining capabilities.
    
    An Agent Profile defines the capabilities, prompts, and behaviors of an AI worker.
    It is NOT a standalone deployable product unit - it is used BY Missions.
    
    Attributes:
        id: Unique identifier
        name: Display name
        slug: URL-friendly identifier
        description: Human-readable description
        role: The role this profile plays
        system_prompt_ref: Reference to the system prompt template
        model_policy_id: Reference to the model usage policy
        memory_policy_id: Reference to the memory/context policy
        safety_policy_id: Reference to the safety constraints policy
        capability_bundle_ids: List of capability bundle references
        output_contract_id: Reference to the expected output format
        is_system: Whether this is a system-provided profile
        is_template: Whether this profile can be used as a template
        status: Current status
        icon: Icon identifier for UI
        created_at: Creation timestamp
        updated_at: Last update timestamp
        created_by: User who created this profile
        updated_by: User who last updated this profile
    """
    
    id: UUID = Field(...)
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=2000)
    role: ProfileRole = Field(default=ProfileRole.ASSISTANT)
    system_prompt_ref: Optional[str] = Field(default=None, max_length=500)
    model_policy_id: Optional[UUID] = Field(default=None)
    memory_policy_id: Optional[UUID] = Field(default=None)
    safety_policy_id: Optional[UUID] = Field(default=None)
    capability_bundle_ids: list[UUID] = Field(default_factory=list)
    output_contract_id: Optional[UUID] = Field(default=None)
    is_system: bool = Field(default=False)
    is_template: bool = Field(default=False)
    status: ProfileStatus = Field(default=ProfileStatus.DRAFT)
    icon: Optional[str] = Field(default=None, max_length=100)
    
    created_at: Optional[str] = Field(default=None)
    updated_at: Optional[str] = Field(default=None)
    created_by: Optional[UUID] = Field(default=None)
    updated_by: Optional[UUID] = Field(default=None)
    
    class Config:
        from_attributes = True
