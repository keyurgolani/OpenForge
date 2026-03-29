from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from uuid import UUID
import os
import shutil
import logging

from openforge.db.models import Workspace, Knowledge, Conversation
from openforge.db.qdrant_client import get_qdrant
from openforge.schemas.workspace import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse
from openforge.utils.insights import DEFAULT_INTELLIGENCE_CATEGORIES, get_workspace_categories
from openforge.config import get_settings
from fastapi import HTTPException
from qdrant_client.models import Filter, FieldCondition, MatchValue

logger = logging.getLogger("openforge.workspace")


def _to_response(workspace: Workspace, knowledge_count: int = 0, conv_count: int = 0) -> WorkspaceResponse:
    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        icon=workspace.icon,
        color=workspace.color,
        llm_provider_id=workspace.llm_provider_id,
        llm_model=workspace.llm_model,
        knowledge_intelligence_provider_id=workspace.knowledge_intelligence_provider_id,
        knowledge_intelligence_model=workspace.knowledge_intelligence_model,
        intelligence_categories=get_workspace_categories(workspace.intelligence_categories),
        vision_provider_id=workspace.vision_provider_id,
        vision_model=workspace.vision_model,
        default_agent_id=workspace.default_agent_id,
        sort_order=workspace.sort_order,
        agent_enabled=workspace.agent_enabled,
        agent_tool_categories=list(workspace.agent_tool_categories or []),
        agent_max_tool_loops=workspace.agent_max_tool_loops,
        knowledge_count=knowledge_count,
        conversation_count=conv_count,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
    )


class WorkspaceService:
    async def create_workspace(self, db: AsyncSession, data: WorkspaceCreate) -> WorkspaceResponse:
        settings = get_settings()

        # Get current max sort_order
        result = await db.execute(select(func.max(Workspace.sort_order)))
        max_order = result.scalar() or 0

        import copy
        workspace = Workspace(
            name=data.name,
            description=data.description,
            icon=data.icon,
            color=data.color,
            llm_provider_id=data.llm_provider_id,
            llm_model=data.llm_model,
            intelligence_categories=data.intelligence_categories or copy.deepcopy(DEFAULT_INTELLIGENCE_CATEGORIES),
            sort_order=max_order + 1,
        )
        db.add(workspace)
        await db.commit()
        await db.refresh(workspace)

        # Create default agent for this workspace
        try:
            from openforge.domains.agents.service import AgentService
            agent_service = AgentService(db)
            agent = await agent_service.ensure_default_agent(data.name)
            workspace.default_agent_id = agent["id"]
            await db.commit()
            await db.refresh(workspace)
        except Exception as e:
            logger.warning("Default agent creation failed for workspace %s: %s", workspace.id, e)

        # Create workspace directory
        ws_dir = os.path.join(settings.workspace_root, str(workspace.id))
        os.makedirs(ws_dir, exist_ok=True)
        uploads_dir = os.path.join(ws_dir, "uploads")
        os.makedirs(uploads_dir, exist_ok=True)

        return _to_response(workspace)

    async def list_workspaces(self, db: AsyncSession) -> list[WorkspaceResponse]:
        result = await db.execute(select(Workspace).order_by(Workspace.sort_order))
        workspaces = result.scalars().all()

        responses = []
        for ws in workspaces:
            knowledge_count_r = await db.execute(
                select(func.count(Knowledge.id)).where(Knowledge.workspace_id == ws.id)
            )
            conv_count_r = await db.execute(
                select(func.count(Conversation.id)).where(
                    Conversation.workspace_id == ws.id,
                    Conversation.is_archived == False,  # noqa: E712
                )
            )
            responses.append(_to_response(
                ws,
                knowledge_count=knowledge_count_r.scalar() or 0,
                conv_count=conv_count_r.scalar() or 0,
            ))
        return responses

    async def get_workspace(self, db: AsyncSession, workspace_id: UUID) -> WorkspaceResponse:
        result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        ws = result.scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        knowledge_count_r = await db.execute(select(func.count(Knowledge.id)).where(Knowledge.workspace_id == ws.id))
        conv_count_r = await db.execute(
            select(func.count(Conversation.id)).where(
                Conversation.workspace_id == ws.id,
                Conversation.is_archived == False,  # noqa: E712
            )
        )
        return _to_response(ws, knowledge_count_r.scalar() or 0, conv_count_r.scalar() or 0)

    async def update_workspace(self, db: AsyncSession, workspace_id: UUID, data: WorkspaceUpdate) -> WorkspaceResponse:
        result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        ws = result.scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        categories_changed = False

        if data.name is not None:
            ws.name = data.name
        if data.description is not None:
            ws.description = data.description
        if data.icon is not None:
            ws.icon = data.icon
        if data.color is not None:
            ws.color = data.color
        if data.llm_provider_id is not None:
            ws.llm_provider_id = data.llm_provider_id
        if data.llm_model is not None:
            ws.llm_model = data.llm_model
        if data.knowledge_intelligence_provider_id is not None:
            ws.knowledge_intelligence_provider_id = data.knowledge_intelligence_provider_id
        if data.knowledge_intelligence_model is not None:
            ws.knowledge_intelligence_model = data.knowledge_intelligence_model
        if data.intelligence_categories is not None:
            old_cats = get_workspace_categories(ws.intelligence_categories)
            old_keys = {c["key"] for c in old_cats}
            new_keys = {c["key"] for c in data.intelligence_categories}
            old_descs = {c["key"]: c.get("description", "") for c in old_cats}
            new_descs = {c["key"]: c.get("description", "") for c in data.intelligence_categories}
            old_types = {c["key"]: c.get("type", "text") for c in old_cats}
            new_types = {c["key"]: c.get("type", "text") for c in data.intelligence_categories}
            if old_keys != new_keys or old_descs != new_descs or old_types != new_types:
                categories_changed = True
            ws.intelligence_categories = data.intelligence_categories
        if data.vision_provider_id is not None:
            ws.vision_provider_id = data.vision_provider_id
        if data.vision_model is not None:
            ws.vision_model = data.vision_model
        if data.sort_order is not None:
            ws.sort_order = data.sort_order
        if data.agent_enabled is not None:
            ws.agent_enabled = data.agent_enabled
        if data.agent_tool_categories is not None:
            ws.agent_tool_categories = data.agent_tool_categories
        if data.agent_max_tool_loops is not None:
            ws.agent_max_tool_loops = data.agent_max_tool_loops

        await db.commit()
        await db.refresh(ws)

        if categories_changed:
            try:
                from openforge.services.knowledge_processing_service import knowledge_processing_service
                await knowledge_processing_service.regenerate_all_intelligence(
                    workspace_id=workspace_id,
                )
            except Exception as e:
                logger.warning("Failed to trigger intelligence regeneration for workspace %s: %s", workspace_id, e)

        return _to_response(ws)

    async def delete_workspace(self, db: AsyncSession, workspace_id: UUID):
        settings = get_settings()
        result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        ws = result.scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")

        await db.delete(ws)
        await db.commit()

        # Remove Qdrant vectors
        try:
            client = get_qdrant()
            client.delete(
                collection_name=settings.qdrant_collection,
                points_selector=Filter(
                    must=[FieldCondition(key="workspace_id", match=MatchValue(value=str(workspace_id)))]
                ),
            )
        except Exception as e:
            logger.warning(f"Failed to delete Qdrant vectors for workspace {workspace_id}: {e}")

        # Remove workspace directory
        ws_dir = os.path.join(settings.workspace_root, str(workspace_id))
        if os.path.exists(ws_dir):
            shutil.rmtree(ws_dir, ignore_errors=True)


workspace_service = WorkspaceService()
