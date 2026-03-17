"""
Graph domain package for the Knowledge Model.

This package provides entity and relationship management for the knowledge graph.
"""

from .types import (
    EntityType,
    EntityStatus,
    RelationshipStatus,
    RelationshipDirectionality,
    ExtractionJobStatus,
    ExtractionMethod,
    MentionResolutionStatus,
    CanonicalizationState,
    SourceType,
    GraphObjectType,
    AliasType,
    GraphQueryType,
    EntityMentionData,
    RelationshipMentionData,
    ExtractionResult,
    CanonicalizationRecord,
    NormalizationResult,
    NeighborEntry,
    NeighborResponse,
    PathHop,
    PathResponse,
    ProvenanceLinkRef,
    GraphObjectReference,
    DocumentReference,
    EvidenceReference,
    GraphQuery,
    GraphQueryResult,
)
from .schemas import (
    EntityCreate,
    EntityUpdate,
    EntityResponse,
    EntityListResponse,
    RelationshipCreate,
    RelationshipUpdate,
    RelationshipResponse,
    RelationshipListResponse,
    EntityAliasCreate,
    EntityAliasResponse,
    ExtractionJobCreate,
    ExtractionJobResponse,
    GraphExtractionResultResponse,
    GraphExtractionResultListResponse,
    ProvenanceLinkCreate,
    ProvenanceLinkResponse,
    EntityCanonicalizationRecordResponse,
    EntityCanonicalizationRecordListResponse,
    GraphQueryRequest,
    GraphQueryResultResponse,
)
from .service import GraphService
from .extraction import GraphExtractionService
from .normalization import GraphNormalizationService
from .provenance import ProvenanceService
from .traversal import GraphTraversalService
from .router import router as graph_router

__all__ = [
    # Enums
    "EntityType",
    "EntityStatus",
    "RelationshipStatus",
    "RelationshipDirectionality",
    "ExtractionJobStatus",
    "ExtractionMethod",
    "MentionResolutionStatus",
    "CanonicalizationState",
    "SourceType",
    "GraphObjectType",
    "AliasType",
    "GraphQueryType",
    # Data models
    "EntityMentionData",
    "RelationshipMentionData",
    "ExtractionResult",
    "CanonicalizationRecord",
    "NormalizationResult",
    # Response models
    "NeighborEntry",
    "NeighborResponse",
    "PathHop",
    "PathResponse",
    "ProvenanceLinkRef",
    "GraphObjectReference",
    "DocumentReference",
    "EvidenceReference",
    "GraphQuery",
    "GraphQueryResult",
    # Schemas
    "EntityCreate",
    "EntityUpdate",
    "EntityResponse",
    "EntityListResponse",
    "RelationshipCreate",
    "RelationshipUpdate",
    "RelationshipResponse",
    "RelationshipListResponse",
    "EntityAliasCreate",
    "EntityAliasResponse",
    "ExtractionJobCreate",
    "ExtractionJobResponse",
    "GraphExtractionResultResponse",
    "GraphExtractionResultListResponse",
    "ProvenanceLinkCreate",
    "ProvenanceLinkResponse",
    "EntityCanonicalizationRecordResponse",
    "EntityCanonicalizationRecordListResponse",
    "GraphQueryRequest",
    "GraphQueryResultResponse",
    # Services
    "GraphService",
    "GraphExtractionService",
    "GraphNormalizationService",
    "ProvenanceService",
    "GraphTraversalService",
    # Router
    "graph_router",
]
