"""
Graph domain types and enums.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Optional
from uuid import UUID
from datetime import datetime, timezone

from pydantic import BaseModel, Field


class EntityType(StrEnum):
    """Types of entities in the knowledge graph."""
    PERSON = "person"
    ORGANIZATION = "organization"
    PROJECT = "project"
    DOCUMENT = "document"
    CONCEPT = "concept"
    TOOL = "tool"
    LOCATION = "location"
    EVENT = "event"
    ARTIFACT = "artifact"
    GENERIC = "generic"


class EntityStatus(StrEnum):
    """Status of a canonical entity."""
    ACTIVE = "active"
    MERGED = "merged"
    DEPRECATED = "deprecated"
    PENDING_REVIEW = "pending_review"


class RelationshipStatus(StrEnum):
    """Status of a canonical relationship."""
    ACTIVE = "active"
    MERGED = "merged"
    DEPRECATED = "deprecated"
    PENDING_REVIEW = "pending_review"


class RelationshipDirectionality(StrEnum):
    """Directionality of relationships."""
    DIRECTED = "directed"
    UNDIRECTED = "undirected"
    BIDIRECTIONAL = "bidirectional"


class ExtractionJobStatus(StrEnum):
    """Status of an extraction job."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class ExtractionMethod(StrEnum):
    """How graph data was extracted or created."""
    LLM = "llm"
    REGEX = "regex"
    MANUAL = "manual"
    IMPORT = "import"
    INFERRED = "inferred"


class MentionResolutionStatus(StrEnum):
    """Resolution status of entity/relationship mentions."""
    UNRESOLVED = "unresolved"
    RESOLVED = "resolved"
    MERGED = "merged"
    REVIEW_NEEDED = "review_needed"


class CanonicalizationState(StrEnum):
    """Outcome of a canonicalization decision."""
    RESOLVED = "resolved"
    CREATED_NEW = "created_new"
    MERGED = "merged"
    REVIEW_NEEDED = "review_needed"


class SourceType(StrEnum):
    """Types of sources for extraction."""
    KNOWLEDGE = "knowledge"
    CHUNK = "chunk"
    EVIDENCE_PACKET = "evidence_packet"
    EVIDENCE_ITEM = "evidence_item"
    DOCUMENT = "document"
    GRAPH_EXTRACTION_JOB = "graph_extraction_job"
    GRAPH_EXTRACTION_RESULT = "graph_extraction_result"


class GraphObjectType(StrEnum):
    """Types of graph objects for provenance."""
    ENTITY = "entity"
    RELATIONSHIP = "relationship"


class AliasType(StrEnum):
    """Types of entity aliases."""
    ABBREVIATION = "abbreviation"
    ALTERNATE_NAME = "alternate_name"
    TRANSLATION = "translation"
    ACRONYM = "acronym"
    NICKNAME = "nickname"


class GraphQueryType(StrEnum):
    """Supported graph query modes."""
    ENTITY_LOOKUP = "entity_lookup"
    RELATIONSHIP_LOOKUP = "relationship_lookup"
    NEIGHBORHOOD = "neighborhood"
    PATH = "path"
    PROVENANCE = "provenance"


# --- Extraction Data Models ---


class EntityMentionData(BaseModel):
    """Data for an extracted entity mention."""
    mention_text: str = Field(..., min_length=1, max_length=500)
    entity_type: EntityType = Field(default=EntityType.GENERIC)
    context_snippet: Optional[str] = None
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class RelationshipMentionData(BaseModel):
    """Data for an extracted relationship mention."""
    subject_text: str = Field(..., min_length=1, max_length=500)
    object_text: str = Field(..., min_length=1, max_length=500)
    predicate: str = Field(..., min_length=1, max_length=200)
    source_snippet: Optional[str] = None
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class ExtractionResult(BaseModel):
    """Result of an extraction job."""
    entity_mentions: list[EntityMentionData] = Field(default_factory=list)
    relationship_mentions: list[RelationshipMentionData] = Field(default_factory=list)
    canonicalization_records: list["CanonicalizationRecord"] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


# --- Normalization Models ---


class CanonicalizationRecord(BaseModel):
    """Record of a mention being canonicalized."""
    state: CanonicalizationState = CanonicalizationState.RESOLVED
    mention_id: UUID
    canonical_id: UUID
    match_type: str  # exact_key, alias, case_insensitive, new_entity, fuzzy
    match_confidence: float = Field(ge=0.0, le=1.0)
    rationale: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NormalizationResult(BaseModel):
    """Result of normalizing mentions to canonical objects."""
    total_mentions: int = 0
    resolved_count: int = 0
    new_created_count: int = 0
    review_needed_count: int = 0
    records: list[CanonicalizationRecord] = Field(default_factory=list)


# --- Graph Traversal Models ---


class NeighborEntry(BaseModel):
    """A neighboring entity in the graph."""
    entity_id: UUID
    entity_name: str
    entity_type: EntityType
    relationship_id: UUID
    predicate: str
    direction: str  # incoming, outgoing


class NeighborResponse(BaseModel):
    """Response for entity neighbors query."""
    entity_id: UUID
    neighbors: list[NeighborEntry] = Field(default_factory=list)
    total: int = 0


class PathHop(BaseModel):
    """A single hop in a graph path."""
    from_entity_id: UUID
    to_entity_id: UUID
    relationship_id: UUID
    predicate: str


class PathResponse(BaseModel):
    """Response for a path between entities."""
    from_entity_id: UUID
    to_entity_id: UUID
    hops: list[PathHop] = Field(default_factory=list)
    total_hops: int = 0
    found: bool = False


# --- Provenance Models ---


class ProvenanceLinkRef(BaseModel):
    """Reference to a provenance link."""
    id: UUID
    source_type: SourceType
    source_id: UUID
    excerpt: Optional[str] = None
    citation: Optional[dict] = None  # {start, end}
    confidence: float = 1.0
    extraction_method: str = "llm"
    created_at: datetime


class GraphObjectReference(BaseModel):
    """Reference to a graph object from a source."""
    graph_object_type: GraphObjectType
    graph_object_id: UUID
    object_name: str
    confidence: float = 1.0


class DocumentReference(BaseModel):
    """Reference to a document mentioning an entity."""
    id: UUID
    title: str
    mention_count: int = 0
    last_mentioned_at: datetime


class EvidenceReference(BaseModel):
    """Reference to evidence supporting an entity."""
    packet_id: UUID
    item_count: int = 0
    confidence: float = 1.0


class GraphQuery(BaseModel):
    """Top-level graph query contract."""
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


class GraphQueryResult(BaseModel):
    """Normalized graph query result."""
    query_type: GraphQueryType
    entities: list[dict[str, Any]] = Field(default_factory=list)
    relationships: list[dict[str, Any]] = Field(default_factory=list)
    provenance: list[dict[str, Any]] = Field(default_factory=list)
    path: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0
