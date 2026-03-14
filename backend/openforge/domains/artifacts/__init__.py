"""
Artifacts domain package.

Artifacts - outputs produced by mission runs.
"""

from backend.openforge.domains.artifacts.types import Artifact, ArtifactStatus

__all__ = [
    "Artifact",
    "ArtifactStatus",
]
