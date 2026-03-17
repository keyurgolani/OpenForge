"""
Graph domain request/response schemas.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

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
    AliasType,
    GraphObjectType,
    GraphQueryType,
)


# =============================================================================
# Extraction Job Schemas
# =============================================================================


class ExtractionJobCreate(BaseModel):
    """Schema for creating an extraction job."""
    workspace_id: UUID = Field(..., description="Workspace ID")
    source_type: SourceType = Field(..., description="Type of source to extract from")
    source_id: UUID = Field(..., description="ID of the source")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Job metadata")


class ExtractionJobResponse(BaseModel):
    """Schema for extraction job response."""
    id: UUID
    workspace_id: UUID
    source_type: SourceType
    source_id: UUID
    status: ExtractionJobStatus
    entity_count: int = 0
    relationship_count: int = 0
    error_message: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExtractionJobListResponse(BaseModel):
    """Schema for listing extraction jobs."""
    jobs: list[ExtractionJobResponse]
    total: int


class GraphExtractionResultResponse(BaseModel):
    """Durable extraction result for a graph extraction job."""
    id: UUID
    workspace_id: UUID
    extraction_job_id: UUID
    entity_mentions: list[dict[str, Any]] = Field(default_factory=list)
    relationship_mentions: list[dict[str, Any]] = Field(default_factory=list)
    canonicalization_records: list[dict[str, Any]] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GraphExtractionResultListResponse(BaseModel):
    """Schema for listing durable extraction results."""
    results: list[GraphExtractionResultResponse]
    total: int


# =============================================================================
# Entity Schemas
# =============================================================================


class EntityCreate(BaseModel):
    """Schema for creating a canonical entity."""
    workspace_id: UUID = Field(..., description="Workspace ID")
    canonical_name: str = Field(..., min_length=1, max_length=500, description="Canonical name")
    entity_type: EntityType = Field(default=EntityType.GENERIC, description="Entity type")
    description: Optional[str] = Field(default=None, description="Entity description")
    attributes: dict[str, Any] = Field(default_factory=dict, description="Entity attributes")


class EntityUpdate(BaseModel):
    """Schema for updating an entity."""
    canonical_name: Optional[str] = Field(default=None, min_length=1, max_length=500)
    entity_type: Optional[EntityType] = None
    description: Optional[str] = None
    attributes: Optional[dict[str, Any]] = None
    status: Optional[EntityStatus] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class EntityResponse(BaseModel):
    """Schema for entity response."""
    id: UUID
    workspace_id: UUID
    canonical_name: str
    normalized_key: str
    entity_type: EntityType
    description: Optional[str] = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    status: EntityStatus
    confidence: float = 1.0
    source_count: int = 1
    last_seen_at: datetime
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EntityListResponse(BaseModel):
    """Schema for listing entities."""
    entities: list[EntityResponse]
    total: int


class EntitySearchParams(BaseModel):
    """Parameters for searching entities."""
    workspace_id: UUID
    query: Optional[str] = None
    entity_type: Optional[EntityType] = None
    status: Optional[EntityStatus] = None
    min_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


# =============================================================================
# Entity Mention Schemas
# =============================================================================


class EntityMentionResponse(BaseModel):
    """Schema for entity mention response."""
    id: UUID
    workspace_id: UUID
    extraction_job_id: UUID
    canonical_entity_id: Optional[UUID] = None
    mention_text: str
    entity_type: EntityType
    context_snippet: Optional[str] = None
    source_type: SourceType
    source_id: UUID
    extraction_method: ExtractionMethod
    confidence: float = 1.0
    resolution_status: MentionResolutionStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EntityMentionListResponse(BaseModel):
    """Schema for listing entity mentions."""
    mentions: list[EntityMentionResponse]
    total: int


class EntityCanonicalizationRecordResponse(BaseModel):
    """Recorded decision linking a mention to a canonical entity."""
    id: UUID
    workspace_id: UUID
    mention_id: UUID
    canonical_entity_id: UUID
    canonicalization_state: CanonicalizationState
    match_type: str
    match_confidence: float
    rationale: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EntityCanonicalizationRecordListResponse(BaseModel):
    """Schema for listing canonicalization records."""
    records: list[EntityCanonicalizationRecordResponse]
    total: int


# =============================================================================
# Entity Alias Schemas
# =============================================================================


class EntityAliasCreate(BaseModel):
    """Schema for creating an entity alias."""
    entity_id: UUID = Field(..., description="Entity ID")
    alias: str = Field(..., min_length=1, max_length=500, description="Alias text")
    alias_type: AliasType = Field(default=AliasType.ALTERNATE_NAME, description="Type of alias")


class EntityAliasResponse(BaseModel):
    """Schema for entity alias response."""
    id: UUID
    entity_id: UUID
    alias: str
    alias_type: AliasType
    source_mention_id: Optional[UUID] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EntityAliasListResponse(BaseModel):
    """Schema for listing entity aliases."""
    aliases: list[EntityAliasResponse]
    total: int


# =============================================================================
# Relationship Schemas
# =============================================================================


class RelationshipCreate(BaseModel):
    """Schema for creating a canonical relationship."""
    workspace_id: UUID = Field(..., description="Workspace ID")
    subject_entity_id: UUID = Field(..., description="Subject entity ID")
    object_entity_id: UUID = Field(..., description="Object entity ID")
    predicate: str = Field(..., min_length=1, max_length=200, description="Relationship predicate")
    relationship_type: str = Field(default="generic", description="Relationship type")
    attributes: dict[str, Any] = Field(default_factory=dict, description="Relationship attributes")
    directionality: RelationshipDirectionality = Field(
        default=RelationshipDirectionality.DIRECTED, description="Directionality"
    )


class RelationshipUpdate(BaseModel):
    """Schema for updating a relationship."""
    predicate: Optional[str] = Field(default=None, min_length=1, max_length=200)
    relationship_type: Optional[str] = None
    attributes: Optional[dict[str, Any]] = None
    status: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    directionality: Optional[RelationshipDirectionality] = None


class RelationshipResponse(BaseModel):
    """Schema for relationship response."""
    id: UUID
    workspace_id: UUID
    subject_entity_id: UUID
    object_entity_id: UUID
    predicate: str
    relationship_type: str
    attributes: dict[str, Any] = Field(default_factory=dict)
    status: RelationshipStatus
    confidence: float = 1.0
    support_count: int = 1
    directionality: RelationshipDirectionality
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RelationshipListResponse(BaseModel):
    """Schema for listing relationships."""
    relationships: list[RelationshipResponse]
    total: int


class RelationshipSearchParams(BaseModel):
    """Parameters for searching relationships."""
    workspace_id: UUID
    entity_id: Optional[UUID] = None  # Filter by subject or object
    predicate: Optional[str] = None
    status: Optional[RelationshipStatus] = None
    relationship_type: Optional[str] = None
    min_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


# =============================================================================
# Relationship Mention Schemas
# =============================================================================


class RelationshipMentionResponse(BaseModel):
    """Schema for relationship mention response."""
    id: UUID
    workspace_id: UUID
    extraction_job_id: UUID
    canonical_relationship_id: Optional[UUID] = None
    subject_mention_id: UUID
    object_mention_id: UUID
    predicate: str
    source_snippet: Optional[str] = None
    source_type: SourceType
    source_id: UUID
    extraction_method: ExtractionMethod
    confidence: float = 1.0
    resolution_status: MentionResolutionStatus
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RelationshipMentionListResponse(BaseModel):
    """Schema for listing relationship mentions."""
    mentions: list[RelationshipMentionResponse]
    total: int


# =============================================================================
# Provenance Schemas
# =============================================================================


class ProvenanceLinkCreate(BaseModel):
    """Schema for creating a provenance link."""
    workspace_id: UUID = Field(..., description="Workspace ID")
    graph_object_type: GraphObjectType = Field(..., description="Type of graph object")
    graph_object_id: UUID = Field(..., description="ID of graph object")
    source_type: SourceType = Field(..., description="Type of source")
    source_id: UUID = Field(..., description="ID of source")
    excerpt: Optional[str] = Field(default=None, description="Excerpt from source")
    char_start: Optional[int] = Field(default=None, ge=0, description="Start character position")
    char_end: Optional[int] = Field(default=None, ge=0, description="End character position")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence score")
    extraction_method: ExtractionMethod = Field(default=ExtractionMethod.LLM, description="Extraction method")


class ProvenanceLinkResponse(BaseModel):
    """Schema for provenance link response."""
    id: UUID
    workspace_id: UUID
    graph_object_type: GraphObjectType
    graph_object_id: UUID
    source_type: SourceType
    source_id: UUID
    excerpt: Optional[str] = None
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    confidence: float = 1.0
    extraction_method: ExtractionMethod
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProvenanceLinkListResponse(BaseModel):
    """Schema for listing provenance links."""
    links: list[ProvenanceLinkResponse]
    total: int


# =============================================================================
# Traversal Schemas
# =============================================================================


class NeighborQueryParams(BaseModel):
    """Parameters for querying entity neighbors."""
    entity_id: UUID
    relationship_types: Optional[list[str]] = None
    direction: str = Field(default="both", pattern="^(incoming|outgoing|both)$")
    max_depth: int = Field(default=1, ge=1, le=3)
    limit: int = Field(default=50, ge=1, le=200)


class PathQueryParams(BaseModel):
    """Parameters for finding a path between entities."""
    from_entity_id: UUID
    to_entity_id: UUID
    max_depth: int = Field(default=3, ge=1, le=5)


class EntityWithRelationshipsResponse(BaseModel):
    """Entity response with its relationships."""
    entity: EntityResponse
    outgoing_relationships: list[RelationshipResponse] = Field(default_factory=list)
    incoming_relationships: list[RelationshipResponse] = Field(default_factory=list)
    aliases: list[EntityAliasResponse] = Field(default_factory=list)
    provenance: list[ProvenanceLinkResponse] = Field(default_factory=list)


class RelationshipWithEntitiesResponse(BaseModel):
    """Relationship response with full entity details."""
    relationship: RelationshipResponse
    subject_entity: EntityResponse
    object_entity: EntityResponse
    provenance: list[ProvenanceLinkResponse] = Field(default_factory=list)


# =============================================================================
# Document/Evidence Linkage Schemas
# =============================================================================


class EntityDocumentReference(BaseModel):
    """Reference to a document mentioning an entity."""
    document_id: UUID
    title: str
    mention_count: int = 1
    last_mentioned_at: datetime


class EntityEvidenceReference(BaseModel):
    """Reference to evidence supporting an entity."""
    evidence_packet_id: UUID
    item_count: int = 1
    confidence: float = 1.0


class EntitySourcesResponse(BaseModel):
    """Response for entity sources (documents and evidence)."""
    entity_id: UUID
    documents: list[EntityDocumentReference] = Field(default_factory=list)
    evidence_packets: list[EntityEvidenceReference] = Field(default_factory=list)


class GraphQueryRequest(BaseModel):
    """Request contract for graph queries."""
    workspace_id: UUID
    query_type: GraphQueryType
    query: Optional[str] = None
    entity_id: Optional[UUID] = None
    from_entity_id: Optional[UUID] = None
    to_entity_id: Optional[UUID] = None
    relationship_id: Optional[UUID] = None
    entity_type: Optional[EntityType] = None
    predicate: Optional[str] = None
    max_depth: int = Field(default=1, ge=1, le=5)
    limit: int = Field(default=50, ge=1, le=200)


class GraphQueryResultResponse(BaseModel):
    """Unified graph query response contract."""
    query_type: GraphQueryType
    entities: list[dict[str, Any]] = Field(default_factory=list)
    relationships: list[dict[str, Any]] = Field(default_factory=list)
    provenance: list[dict[str, Any]] = Field(default_factory=list)
    path: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0
