"""
Graph domain model exports.

Re-exports SQLAlchemy models from the central models file for use in the graph domain.
"""

from openforge.db.models import (
    GraphExtractionJobModel,
    GraphExtractionResultModel,
    EntityModel,
    EntityMentionModel,
    EntityAliasModel,
    EntityCanonicalizationRecordModel,
    RelationshipModel,
    RelationshipMentionModel,
    GraphProvenanceLinkModel,
)

__all__ = [
    "GraphExtractionJobModel",
    "GraphExtractionResultModel",
    "EntityModel",
    "EntityMentionModel",
    "EntityAliasModel",
    "EntityCanonicalizationRecordModel",
    "RelationshipModel",
    "RelationshipMentionModel",
    "GraphProvenanceLinkModel",
]

# Note: Import these models from db.models after running migration 005_graph_foundation
# The models are defined in: backend/openforge/db/models.py
