"""
Graph API router for Phase 5.

Exposes CRUD, extraction, traversal, provenance, and bounded graph query
surfaces.
"""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.postgres import get_db

from .extraction import GraphExtractionService
from .provenance import ProvenanceService
from .schemas import (
    EntityAliasCreate,
    EntityAliasListResponse,
    EntityAliasResponse,
    EntityCanonicalizationRecordListResponse,
    EntityCreate,
    EntityListResponse,
    EntityResponse,
    EntitySearchParams,
    EntitySourcesResponse,
    EntityUpdate,
    ExtractionJobCreate,
    ExtractionJobListResponse,
    ExtractionJobResponse,
    GraphExtractionResultListResponse,
    GraphExtractionResultResponse,
    GraphQueryRequest,
    GraphQueryResultResponse,
    ProvenanceLinkListResponse,
    RelationshipCreate,
    RelationshipListResponse,
    RelationshipResponse,
)
from .service import GraphService
from .traversal import GraphTraversalService
from .types import (
    EntityStatus,
    EntityType,
    ExtractionJobStatus,
    NeighborResponse,
    PathResponse,
    RelationshipStatus,
    SourceType,
)

router = APIRouter()


def get_graph_service(db: AsyncSession = Depends(get_db)) -> GraphService:
    return GraphService(db)


def get_extraction_service(db: AsyncSession = Depends(get_db)) -> GraphExtractionService:
    return GraphExtractionService(db)


def get_traversal_service(db: AsyncSession = Depends(get_db)) -> GraphTraversalService:
    return GraphTraversalService(db)


def get_provenance_service(db: AsyncSession = Depends(get_db)) -> ProvenanceService:
    return ProvenanceService(db)


@router.get("/entities", response_model=EntityListResponse)
async def list_entities(
    workspace_id: uuid.UUID = Query(..., description="Workspace ID"),
    entity_type: Optional[EntityType] = Query(None, description="Filter by entity type"),
    status: Optional[EntityStatus] = Query(None, description="Filter by status"),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0, description="Minimum confidence"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=200, description="Max results"),
    service: GraphService = Depends(get_graph_service),
):
    return await service.list_entities(
        workspace_id=workspace_id,
        entity_type=entity_type,
        status=status,
        min_confidence=min_confidence,
        skip=skip,
        limit=limit,
    )


@router.get("/entities/search", response_model=EntityListResponse)
async def search_entities(
    workspace_id: uuid.UUID = Query(..., description="Workspace ID"),
    q: Optional[str] = Query(None, description="Search query"),
    entity_type: Optional[EntityType] = Query(None, description="Filter by entity type"),
    status: Optional[EntityStatus] = Query(None, description="Filter by status"),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0, description="Minimum confidence"),
    limit: int = Query(50, ge=1, le=200, description="Max results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    service: GraphService = Depends(get_graph_service),
):
    return await service.search_entities(
        EntitySearchParams(
            workspace_id=workspace_id,
            query=q,
            entity_type=entity_type,
            status=status,
            min_confidence=min_confidence,
            limit=limit,
            offset=offset,
        )
    )


@router.get("/entities/{entity_id}", response_model=EntityResponse)
async def get_entity(entity_id: uuid.UUID, service: GraphService = Depends(get_graph_service)):
    entity = await service.get_entity(entity_id)
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Entity {entity_id} not found")
    return entity


@router.post("/entities", response_model=EntityResponse, status_code=status.HTTP_201_CREATED)
async def create_entity(
    data: EntityCreate,
    provenance_source_type: Optional[SourceType] = Query(None, description="Source type for provenance"),
    provenance_source_id: Optional[uuid.UUID] = Query(None, description="Source ID for provenance"),
    service: GraphService = Depends(get_graph_service),
):
    try:
        return await service.create_entity(
            data=data,
            provenance_source_type=provenance_source_type,
            provenance_source_id=provenance_source_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/entities/{entity_id}", response_model=EntityResponse)
async def update_entity(
    entity_id: uuid.UUID,
    data: EntityUpdate,
    service: GraphService = Depends(get_graph_service),
):
    entity = await service.update_entity(entity_id, data)
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Entity {entity_id} not found")
    return entity


@router.delete("/entities/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entity(
    entity_id: uuid.UUID,
    soft: bool = Query(True, description="Soft delete"),
    service: GraphService = Depends(get_graph_service),
):
    deleted = await service.delete_entity(entity_id, soft=soft)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Entity {entity_id} not found")


@router.get("/entities/{entity_id}/relationships", response_model=RelationshipListResponse)
async def get_entity_relationships(
    entity_id: uuid.UUID,
    workspace_id: uuid.UUID = Query(..., description="Workspace ID"),
    predicate: Optional[str] = Query(None, description="Filter by predicate"),
    relationship_type: Optional[str] = Query(None, description="Filter by relationship type"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    service: GraphService = Depends(get_graph_service),
):
    return await service.list_relationships(
        workspace_id=workspace_id,
        entity_id=entity_id,
        predicate=predicate,
        relationship_type=relationship_type,
        skip=skip,
        limit=limit,
    )


@router.get("/entities/{entity_id}/aliases", response_model=EntityAliasListResponse)
async def get_entity_aliases(
    entity_id: uuid.UUID,
    service: GraphService = Depends(get_graph_service),
):
    return await service.list_entity_aliases(entity_id)


@router.post("/entities/{entity_id}/aliases", response_model=EntityAliasResponse, status_code=status.HTTP_201_CREATED)
async def add_entity_alias(
    entity_id: uuid.UUID,
    data: EntityAliasCreate,
    service: GraphService = Depends(get_graph_service),
):
    data.entity_id = entity_id
    try:
        return await service.add_entity_alias(data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/entities/{entity_id}/neighbors", response_model=NeighborResponse)
async def get_entity_neighbors(
    entity_id: uuid.UUID,
    relationship_types: Optional[str] = Query(None, description="Comma-separated relationship predicates"),
    direction: str = Query("both", pattern="^(incoming|outgoing|both)$"),
    max_depth: int = Query(1, ge=1, le=3),
    limit: int = Query(50, ge=1, le=200),
    traversal: GraphTraversalService = Depends(get_traversal_service),
):
    try:
        return await traversal.get_entity_neighbors(
            entity_id=entity_id,
            relationship_types=relationship_types.split(",") if relationship_types else None,
            direction=direction,
            max_depth=max_depth,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/entities/{entity_id}/provenance", response_model=ProvenanceLinkListResponse)
async def get_entity_provenance(
    entity_id: uuid.UUID,
    provenance: ProvenanceService = Depends(get_provenance_service),
):
    return await provenance.get_entity_provenance(entity_id)


@router.get("/entities/{entity_id}/sources", response_model=EntitySourcesResponse)
async def get_entity_sources(
    entity_id: uuid.UUID,
    provenance: ProvenanceService = Depends(get_provenance_service),
):
    return await provenance.get_entity_sources(entity_id)


@router.get("/relationships", response_model=RelationshipListResponse)
async def list_relationships(
    workspace_id: uuid.UUID = Query(..., description="Workspace ID"),
    entity_id: Optional[uuid.UUID] = Query(None, description="Filter by entity involvement"),
    predicate: Optional[str] = Query(None, description="Filter by predicate"),
    relationship_type: Optional[str] = Query(None, description="Filter by relationship type"),
    status: Optional[RelationshipStatus] = Query(None, description="Filter by status"),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    service: GraphService = Depends(get_graph_service),
):
    return await service.list_relationships(
        workspace_id=workspace_id,
        entity_id=entity_id,
        predicate=predicate,
        relationship_type=relationship_type,
        status=status,
        min_confidence=min_confidence,
        skip=skip,
        limit=limit,
    )


@router.get("/relationships/{relationship_id}", response_model=RelationshipResponse)
async def get_relationship(
    relationship_id: uuid.UUID,
    service: GraphService = Depends(get_graph_service),
):
    relationship = await service.get_relationship(relationship_id)
    if not relationship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Relationship {relationship_id} not found",
        )
    return relationship


@router.post("/relationships", response_model=RelationshipResponse, status_code=status.HTTP_201_CREATED)
async def create_relationship(
    data: RelationshipCreate,
    provenance_source_type: Optional[SourceType] = Query(None, description="Source type for provenance"),
    provenance_source_id: Optional[uuid.UUID] = Query(None, description="Source ID for provenance"),
    service: GraphService = Depends(get_graph_service),
):
    try:
        return await service.create_relationship(
            data=data,
            provenance_source_type=provenance_source_type,
            provenance_source_id=provenance_source_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/relationships/{relationship_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_relationship(
    relationship_id: uuid.UUID,
    soft: bool = Query(True, description="Soft delete"),
    service: GraphService = Depends(get_graph_service),
):
    deleted = await service.delete_relationship(relationship_id, soft=soft)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Relationship {relationship_id} not found",
        )


@router.get("/relationships/{relationship_id}/provenance", response_model=ProvenanceLinkListResponse)
async def get_relationship_provenance(
    relationship_id: uuid.UUID,
    provenance: ProvenanceService = Depends(get_provenance_service),
):
    return await provenance.get_relationship_provenance(relationship_id)


@router.get("/path", response_model=PathResponse)
async def find_path(
    from_entity_id: uuid.UUID = Query(..., description="Starting entity ID"),
    to_entity_id: uuid.UUID = Query(..., description="Target entity ID"),
    max_depth: int = Query(3, ge=1, le=5, description="Maximum hops"),
    traversal: GraphTraversalService = Depends(get_traversal_service),
):
    return await traversal.find_path(
        from_entity_id=from_entity_id,
        to_entity_id=to_entity_id,
        max_depth=max_depth,
    )


@router.post("/extraction-jobs", response_model=ExtractionJobResponse, status_code=status.HTTP_201_CREATED)
async def create_extraction_job(
    data: ExtractionJobCreate,
    extraction: GraphExtractionService = Depends(get_extraction_service),
):
    return await extraction.queue_extraction_job(
        workspace_id=data.workspace_id,
        source_type=data.source_type,
        source_id=data.source_id,
        metadata=data.metadata,
    )


@router.get("/extraction-jobs/{job_id}", response_model=ExtractionJobResponse)
async def get_extraction_job(
    job_id: uuid.UUID,
    extraction: GraphExtractionService = Depends(get_extraction_service),
):
    job = await extraction.get_extraction_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Extraction job {job_id} not found",
        )
    return job


@router.get("/extraction-jobs", response_model=ExtractionJobListResponse)
async def list_extraction_jobs(
    workspace_id: uuid.UUID = Query(..., description="Workspace ID"),
    status: Optional[ExtractionJobStatus] = Query(None, description="Filter by status"),
    source_type: Optional[SourceType] = Query(None, description="Filter by source type"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    extraction: GraphExtractionService = Depends(get_extraction_service),
):
    jobs, total = await extraction.list_extraction_jobs(
        workspace_id=workspace_id,
        status=status,
        source_type=source_type,
        limit=limit,
        offset=offset,
    )
    return ExtractionJobListResponse(jobs=jobs, total=total)


@router.post("/extraction-jobs/{job_id}/process", response_model=GraphExtractionResultResponse)
async def process_extraction_job(
    job_id: uuid.UUID,
    llm_provider_id: Optional[uuid.UUID] = Query(None, description="LLM provider ID"),
    extraction: GraphExtractionService = Depends(get_extraction_service),
):
    try:
        return await extraction.process_extraction_job(job_id=job_id, llm_provider_id=llm_provider_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/extraction-jobs/{job_id}/result", response_model=GraphExtractionResultResponse)
async def get_extraction_job_result(
    job_id: uuid.UUID,
    extraction: GraphExtractionService = Depends(get_extraction_service),
):
    result = await extraction.get_extraction_result(job_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Extraction result for job {job_id} not found",
        )
    return result


@router.get("/extraction-results", response_model=GraphExtractionResultListResponse)
async def list_extraction_results(
    workspace_id: uuid.UUID = Query(..., description="Workspace ID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    extraction: GraphExtractionService = Depends(get_extraction_service),
):
    results, total = await extraction.list_extraction_results(
        workspace_id=workspace_id,
        limit=limit,
        offset=offset,
    )
    return GraphExtractionResultListResponse(results=results, total=total)


@router.get("/canonicalization-records", response_model=EntityCanonicalizationRecordListResponse)
async def list_canonicalization_records(
    workspace_id: uuid.UUID = Query(..., description="Workspace ID"),
    mention_id: Optional[uuid.UUID] = Query(None, description="Filter by mention"),
    canonical_entity_id: Optional[uuid.UUID] = Query(None, description="Filter by canonical entity"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    service: GraphService = Depends(get_graph_service),
):
    return await service.list_canonicalization_records(
        workspace_id=workspace_id,
        mention_id=mention_id,
        canonical_entity_id=canonical_entity_id,
        limit=limit,
        offset=offset,
    )


@router.post("/query", response_model=GraphQueryResultResponse)
async def query_graph(
    data: GraphQueryRequest,
    service: GraphService = Depends(get_graph_service),
):
    try:
        return await service.query_graph(data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/sources/{source_type}/{source_id}/objects")
async def get_source_graph_objects(
    source_type: SourceType,
    source_id: uuid.UUID,
    provenance: ProvenanceService = Depends(get_provenance_service),
):
    return await provenance.get_source_graph_objects(source_type=source_type.value, source_id=source_id)


@router.post("/validate-provenance")
async def validate_provenance(
    workspace_id: uuid.UUID = Query(..., description="Workspace ID"),
    provenance: ProvenanceService = Depends(get_provenance_service),
):
    return await provenance.validate_provenance(workspace_id)
