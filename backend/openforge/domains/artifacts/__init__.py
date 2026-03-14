"""
Artifacts domain package.

Artifacts - outputs produced by mission runs.
"""

from .types import Artifact, ArtifactStatus
from .schemas import ArtifactCreate, ArtifactListResponse, ArtifactResponse, ArtifactUpdate
from .router import router

__all__ = [
    "Artifact",
    "ArtifactStatus",
    "ArtifactCreate",
    "ArtifactUpdate",
    "ArtifactResponse",
    "ArtifactListResponse",
    "router",
]
