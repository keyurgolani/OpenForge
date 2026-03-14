"""
Profiles domain package.

This package contains the domain logic for Agent Profiles - worker abstractions
that define capabilities, prompts, and behaviors.
"""

from .types import (
    AgentProfile,
    ProfileRole,
    ProfileStatus,
)
from .schemas import (
    ProfileCreate,
    ProfileListResponse,
    ProfileResponse,
    ProfileUpdate,
)
from .router import router

__all__ = [
    "AgentProfile",
    "ProfileRole",
    "ProfileStatus",
    "ProfileCreate",
    "ProfileUpdate",
    "ProfileResponse",
    "ProfileListResponse",
    "router",
]
