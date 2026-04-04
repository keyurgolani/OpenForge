import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from openforge.db.postgres import get_db
from openforge.db.models import (
    Knowledge, Conversation, AgentExecution,
    ArtifactModel, RunModel,
    TriggerDefinitionModel,
    HITLRequest, ToolCallLog, TaskLog,
    Workspace,
    RetrievalQueryModel, EvidencePacketModel, ConversationSummaryModel,
    ToolOutputSummaryModel,
    UsageRecordModel, FailureEventModel,
)
from openforge.services.workspace_service import workspace_service
from openforge.schemas.workspace import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse

logger = logging.getLogger("openforge.workspaces")

router = APIRouter()


@router.get("", response_model=list[WorkspaceResponse])
async def list_workspaces(
    ownership_type: str | None = Query(None, description="Filter by ownership type (user, deployment, mission)"),
    db: AsyncSession = Depends(get_db),
):
    return await workspace_service.list_workspaces(db, ownership_type=ownership_type)


@router.post("", response_model=WorkspaceResponse, status_code=201)
async def create_workspace(body: WorkspaceCreate, db: AsyncSession = Depends(get_db)):
    return await workspace_service.create_workspace(db, body)


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    return await workspace_service.get_workspace(db, workspace_id)


@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: UUID, body: WorkspaceUpdate, db: AsyncSession = Depends(get_db)
):
    return await workspace_service.update_workspace(db, workspace_id, body)


@router.delete("/{workspace_id}", status_code=204)
async def delete_workspace(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    await workspace_service.delete_workspace(db, workspace_id)


# ── Workspace merge ─────────────────────────────────────────────────────

class WorkspaceMergeRequest(BaseModel):
    source_workspace_id: UUID
    delete_source: bool = True


class WorkspaceMergeResponse(BaseModel):
    target_workspace_id: str
    source_workspace_id: str
    tables_updated: int
    source_deleted: bool


# All models that have a workspace_id column to reassign
_WORKSPACE_SCOPED_MODELS = [
    Knowledge,
    Conversation,
    AgentExecution,
    ArtifactModel,
    RunModel,
    TriggerDefinitionModel,
    HITLRequest,
    ToolCallLog,
    TaskLog,
    RetrievalQueryModel,
    EvidencePacketModel,
    ConversationSummaryModel,
    ToolOutputSummaryModel,
    UsageRecordModel,
    FailureEventModel,
]


@router.post("/{workspace_id}/merge", response_model=WorkspaceMergeResponse)
async def merge_workspace(
    workspace_id: UUID,
    body: WorkspaceMergeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Merge all entities from source_workspace_id into target workspace_id."""
    target_id = workspace_id
    source_id = body.source_workspace_id

    if target_id == source_id:
        raise HTTPException(status_code=400, detail="Source and target workspaces must be different.")

    # Verify both workspaces exist
    target = await db.get(Workspace, target_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Target workspace not found.")
    source = await db.get(Workspace, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source workspace not found.")

    tables_updated = 0
    for model in _WORKSPACE_SCOPED_MODELS:
        if not hasattr(model, "workspace_id"):
            continue
        try:
            result = await db.execute(
                update(model)
                .where(model.workspace_id == source_id)
                .values(workspace_id=target_id)
            )
            if result.rowcount > 0:
                tables_updated += 1
        except Exception as exc:
            logger.warning("Merge: failed to update %s: %s", model.__tablename__, exc)

    source_deleted = False
    if body.delete_source:
        try:
            await db.delete(source)
            source_deleted = True
        except Exception as exc:
            logger.warning("Merge: failed to delete source workspace: %s", exc)

    await db.commit()

    return WorkspaceMergeResponse(
        target_workspace_id=str(target_id),
        source_workspace_id=str(source_id),
        tables_updated=tables_updated,
        source_deleted=source_deleted,
    )
