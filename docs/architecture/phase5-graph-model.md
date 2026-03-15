# Phase 5: Knowledge Model and GraphRAG Foundation

**Status: Draft
**date: 2026-03-14**

## Context

Phase 5 establishes the first graph-aware knowledge layer for OpenForge. Instead of treating knowledge only as documents and chunks, the system will now represent:
- **Entities** (people, organizations, concepts, etc.)
- **Relationships** between entities
- **Provenance** from entities/relationships back to source documents and evidence

This phase is **not** about advanced autonomous graph reasoning. It's about creating a high-quality knowledge graph substrate that improves explainability, discoverability, navigation, and evidence grounding for future features.

 **Core Principle**: Every entity and relationship must be traceable to source material. If the system cannot answer "where did this come from?",", the implementation is incomplete.

---

## Architecture Overview

### Key Components
1. **Extraction Pipeline** (`extraction.py`)
   - `GraphExtractionService` - manages extraction jobs
   - `process_extraction_job()` - runs LLM extraction
   - Entity and relationship mention creation

   - Job status tracking (queued → running -> completed/failed/partial)

   - LLM-based extraction with fallback to regex extraction
   - Batch processing support

2. **Normalization Service** (`normalization.py`)
   - `GraphNormalizationService` - canonicalizes mentions
   - Matching rules (in priority):
     1. Exact normalized_key match (confidence = 1.0)
     2. Alias match (confidence = 0.95)
     3. Case-insensitive canonical name match (confidence = 0.85)
     4. Create new entity if no match (confidence = 1.0)
   - Entity merging support with rationale tracking
   - Normalized key generation for entity types

   - Mention resolution status tracking (unresolved → resolved → merged → review_needed)
3. **Provenance Service** (`provenance.py`)
   - `ProvenanceService` - manages source provenance
   - Create provenance links ( graph objects → sources
   - Retrieve provenance for entities/relationships
   - Source-to-graph-object queries
   - Provenance chain traversal
   - Validation (all objects have provenance)
4. **Traversal Service** (`traversal.py`)
   - `GraphTraversalService` - graph navigation
   - Neighbor queries (1-3 hops)
   - Path finding (BFS algorithm)
   - Subgraph extraction
   - Entity statistics
5. **Graph Service** (`service.py`)
   - `GraphService` - main coordination layer
   - Entity CRUD operations
   - Relationship CRUD operations
   - Alias management
   - Search functionality
   - Integration with other services
6. **API Router** (`router.py`)
   - REST endpoints for all graph operations
   - Entity endpoints
   - Relationship endpoints
   - Traversal endpoints
   - Provenance endpoints
   - Extraction job endpoints

### Domain Package Structure
```
backend/openforge/domains/graph/
├── __init__.py       # Package exports
├── types.py              # Enums, domain types, Pydantic models
├── models.py            # Model exports (aliases)
├── schemas.py           # Request/response schemas
├── service.py           # Main graph service
├── router.py            # API endpoints
├── extraction.py        # Extraction pipeline
├── normalization.py    # Canonicalization service
├── provenance.py        # Provenance management
└── traversal.py        # Graph traversal algorithms
```

### Database Tables
1. **extraction_jobs** - Tracks extraction operations
2. **entities** - Canonical entities
3. **entity_mentions** - Raw entity extractions
4. **entity_aliases** - Alternative names for entities
5. **relationships** - Canonical relationships
6. **relationship_mentions** - Raw relationship extractions
7. **graph_provenance_links** - Provenance tracking

---

## Entity/Mention Distinction
### EntityMentionModel (Raw Extraction)
- `mention_text`: The exact text of the the entity appears
- `entity_type`: Inferred type (person, organization, etc.)
- `context_snippet`: Surrounding context
- `extraction_job_id`: Links to extraction job
- `canonical_entity_id`: Links to resolved entity (nullable)
- `resolution_status`: unresolved | resolved | merged | review_needed

- **Source tracking**: `source_type`, `source_id`

### EntityModel (Canonical Entity)
- `canonical_name`: The official/cprimary name
- `normalized_key`: For matching (lowercase, no punctuation, normalized whitespace)
- `entity_type`: Type classification
- `description`: Optional description
- `attributes_json`: Flexible attributes (JSONB)
- `status`: active | merged | deprecated | pending_review
- `confidence`: Quality score (0.0-1.0)
- `source_count`: Number of sources supporting this entity
- `last_seen_at`: Last time entity was mentioned
- **Aliases**: `entity_aliases` table

- **Support tracking**: `relationships` table

  - `support_count`: Number of mentions supporting this relationship
  - `directionality`: directed | undirected | bidirectional

- **Provenance**: `graph_provenance_links` table

### RelationshipMentionModel (Raw Extraction)
- `subject_mention_id`: Links to subject entity mention
- `object_mention_id`: Links to object entity mention
- `predicate`: The relationship type (works_for, located_in, etc.)
- `canonical_relationship_id`: Links to resolved relationship (nullable)
- `resolution_status`: unresolved | resolved | review_needed
- Similar to entity mentions, source and snippet tracking

- Similar to entity mentions, source tracking (source_type, source_id)
- `extraction_job_id` links to extraction job

- Similar to entity mentions, `resolution_status` tracking
- `confidence` and extraction confidence

- `source_snippet`: The text snippet showing the relationship
- **Source Types**:
  - `knowledge`: Documents in the knowledge base
  - `chunk`: Chunked document sections
  - `evidence_packet`: Assembled evidence packets
  - `evidence_item`: Individual evidence items
  - `document`: Documents (alias for knowledge)
  - `extraction_job`: Extraction job references

- **Graph Object Types**:
  - `entity`: Canonical entities
  - `relationship`: Canonical relationships

---

## Extraction Flow
```
┌─────────────────────────────────────┐   Extraction Job Created      │
│                                 │
│                                 ▼──┐
│                                 │
│                          ┌──────┘ Load Source Content
│                                 │
│                                 ▼──┐
│                                 │
│                          │ LLM Extraction
│                                 │
│                                 ▼──┐
│                                 │
│                          ┌──────┘ Entity Mentions Created
│                                 │
│                                 ┼──┐
│                                 │
│                          │ LLM Extraction
│                                 │
│                                 ▼──┐
│                                 │
│                          ┌──────┘ Relationship Mentions Created
│                                 │
│                                 │
└─────────────────────────────────────┘
```

## Normalization Flow
```
┌─────────────────────────────────────┐
│    EntityMentionModel           │
│                                 │
│          ┌──────┐ Generate normalized_key
│                                 │
│                                 ┼──┐
│                                 │
│                          │ Search for matching entity
│                                 │
│                                 │
│     ┌───────┐───────┐───────┐───────┐
│     │           │           │           │           │
│   Found        │  Alias    │  Case-     │  Not       │
│     │           │  Match     │  Insens.   │  Found     │
│     │           │           │  Match     │           │
│     └───────┘───────┘───────┘───────┘
│           │               │               │               │
│           │ Link to        │ Add Alias    │ Create New  │
│           │ Existing      │               │ Entity        │
│           └───────────────┴───────────────┴───────────────┘
│                           │
│                           ▼
│                           │
│                    EntityModel Created/Updated
│                           │
│                           │
│                    Provenance Links Created
│                           │
│                           │
└─────────────────────────────────────┘
```

## Provenance Requirements
Every canonical entity and relationship **must** have at least one provenance link. This is enforced by:

1. **Service Layer Validation**: The `GraphService.create_entity()` method requires provenance parameters
2. **Database Constraints**: Foreign key constraints ensure referential integrity
3. **Validation Endpoint**: `POST /api/v1/graph/validate-provenance` endpoint checks all objects
4. **Error Messages**: Missing provenance results in clear error messages

5. **No Silent Failures**: Operations fail fast rather than silently succeeding
5. **Audit Trail**: Provenance links are tracked with timestamps and confidence scores, and extraction methods

```

## What This Phase Does NOT Do
1. **Autonomous Graph Reasoning**: No automatic inference or graph traversal
2. **Graph-Aware Retrieval**: Explicit opt-in only (requires `GraphExpansionConfig.enabled=True`)
3. **Entity Merging**: Requires explicit rationale (no silent merges)
4. **Forced Canonicalization**: Mentions are resolved conservatively (better unresolved than wrong match)
5. **Bulk Operations**: No batch canonicalization without job tracking

### Graph-Aware Retrieval
Graph-aware retrieval is **explicitly opt-in**:

```python
# Standard retrieval (graph expansion disabled - default)
results = await retrieval_service.search(request)

# With graph expansion enabled
config = GraphExpansionConfig(
    enabled=True,
    expand_depth=2,
    max_entities=10,
    min_confidence=0.5,
)
results, entities = await retrieval_service.search_with_graph_expansion(
    request,
    graph_expansion=config,
)
```

When graph expansion is enabled:
1. **Entity Extraction**: Query is analyzed for potential entity mentions
2. **Entity Matching**: Extracted entities are matched against the knowledge graph
3. **Document Discovery**: Documents linked to matched entities are retrieved
4. **Result Augmentation**: Related documents are added to search results with metadata
5. **Expansion Metadata**: Results include `GraphExpansionResult` with matched/related entities

6. **Opt-In Only**: Default retrieval behavior is unchanged

```

## Future Considerations
### Potential Enhancements
1. **Graph Visualization**: D3.js or Cytoscape.js integration
2. **Advanced Traversal**: Weighted path finding, subgraph matching
3. **Temporal Analysis**: Entity/relationship evolution over time
4. **Confidence Propagation**: Uncertainty quantification across the graph
5. **Community Detection**: Clustering related entities
6. **Cross-Document Coreference**: Entity resolution across documents
7. **Graph Embeddings**: Vector representations for similarity search

8. **Incremental Updates**: Real-time graph updates as new documents arrive

9. **Graph Analytics**: Statistical analysis and trending
10. **Export Formats**: GraphML, JSON-LD, RDF export
11. **Import Pipelines**: Bulk import from external sources
12. **Federation**: Cross-workspace entity linking
