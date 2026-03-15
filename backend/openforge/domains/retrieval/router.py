"""Retrieval API endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from openforge.db.postgres import get_db

from .schemas import (
    ConversationSummaryResponse,
    EvidencePacketBuildRequest,
    EvidencePacketResponse,
    RetrievalQueryResponse,
    RetrievalReadRequest,
    RetrievalReadResponse,
    RetrievalSearchRequest,
    RetrievalSearchResponse,
)
from .service import RetrievalService

router = APIRouter()


def get_retrieval_service(db=Depends(get_db)) -> RetrievalService:
    return RetrievalService(db)


@router.post("/search", response_model=RetrievalSearchResponse, status_code=status.HTTP_201_CREATED)
async def search_retrieval(
    body: RetrievalSearchRequest,
    service: RetrievalService = Depends(get_retrieval_service),
):
    return await service.search(body)


@router.post("/read", response_model=RetrievalReadResponse)
async def read_retrieval(
    body: RetrievalReadRequest,
    service: RetrievalService = Depends(get_retrieval_service),
):
    return await service.read(body)


@router.post("/evidence", response_model=EvidencePacketResponse, status_code=status.HTTP_201_CREATED)
async def build_evidence_packet(
    body: EvidencePacketBuildRequest,
    service: RetrievalService = Depends(get_retrieval_service),
):
    return await service.build_evidence_packet(body)


@router.get("/evidence/{packet_id}", response_model=EvidencePacketResponse)
async def get_evidence_packet(
    packet_id: UUID,
    service: RetrievalService = Depends(get_retrieval_service),
):
    packet = await service.get_evidence_packet(packet_id)
    if packet is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence packet not found")
    return packet


@router.get("/queries/{query_id}", response_model=RetrievalQueryResponse)
async def get_retrieval_query(
    query_id: UUID,
    service: RetrievalService = Depends(get_retrieval_service),
):
    payload = await service.get_query(query_id)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retrieval query not found")
    return payload


@router.post("/conversations/{conversation_id}/summary", response_model=ConversationSummaryResponse)
async def summarize_conversation(
    conversation_id: UUID,
    workspace_id: UUID,
    service: RetrievalService = Depends(get_retrieval_service),
):
    return await service.summarize_conversation(
        workspace_id=workspace_id,
        conversation_id=conversation_id,
    )


@router.get("/conversations/{conversation_id}/summary", response_model=ConversationSummaryResponse)
async def get_latest_conversation_summary(
    conversation_id: UUID,
    service: RetrievalService = Depends(get_retrieval_service),
):
    summary = await service.get_latest_conversation_summary(conversation_id=conversation_id)
    if summary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation summary not found")
    return summary
