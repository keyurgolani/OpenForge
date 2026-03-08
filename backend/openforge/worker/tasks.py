"""
Celery tasks for OpenForge v2.

Agent execution tasks run the ReAct loop with tool calling support.
Knowledge processing tasks handle file extraction and embedding.
"""
import asyncio
import logging
from openforge.worker.celery_app import celery_app

logger = logging.getLogger("openforge.worker")


@celery_app.task(name="agent.execute", bind=True)
def execute_agent_task(self, execution_id: str, **kwargs):
    """
    Execute an agent loop.

    Args:
        execution_id: Unique identifier for this execution
        **kwargs: Additional parameters including:
            - workspace_id: Workspace UUID
            - conversation_id: Conversation UUID
            - user_message: The user's message
            - conversation_history: List of previous messages
            - rag_context: Retrieved knowledge context
            - available_tools: List of tools the agent can use
            - provider_config: LLM provider configuration

    Returns:
        Dict with execution status and results
    """
    logger.info(f"Agent execution started: {execution_id}")

    from openforge.core.agent_engine import agent_engine

    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(
            agent_engine.run(
                execution_id=execution_id,
                **kwargs
            )
        )
        return {"status": "completed", "execution_id": execution_id, "response": result}
    except Exception as e:
        logger.exception(f"Agent execution failed: {execution_id}")
        return {"status": "failed", "execution_id": execution_id, "error": str(e)}
    finally:
        loop.close()


@celery_app.task(name="agent.resume_after_hitl", bind=True)
def resume_after_hitl(self, execution_id: str, hitl_request_id: str, approved: bool, resolution_note: str = None, **kwargs):
    """
    Resume an agent after HITL approval/denial.

    Args:
        execution_id: The agent execution to resume
        hitl_request_id: The HITL request that was resolved
        approved: Whether the tool call was approved
        resolution_note: Optional note about the resolution
        **kwargs: Additional parameters for resuming

    Returns:
        Dict with execution status
    """
    logger.info(f"Agent resume after HITL: {execution_id}, approved={approved}")

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            _resume_after_hitl_async(execution_id, hitl_request_id, approved, resolution_note)
        )
        return {"status": "completed", "execution_id": execution_id}
    except Exception as e:
        logger.exception(f"HITL resume failed: {execution_id}")
        return {"status": "failed", "execution_id": execution_id, "error": str(e)}
    finally:
        loop.close()


async def _resume_after_hitl_async(execution_id, hitl_request_id, approved, resolution_note):
    from openforge.db.postgres import AsyncSessionLocal
    from openforge.db.models import HITLRequest
    from openforge.api.websocket import ws_manager
    from uuid import UUID

    async with AsyncSessionLocal() as db:
        # Load HITL request
        hitl = await db.get(HITLRequest, UUID(hitl_request_id))
        if not hitl:
            logger.error(f"HITL request {hitl_request_id} not found")
            return

        # Emit resolution event to workspace WebSocket
        workspace_id = str(hitl.workspace_id)
        await ws_manager.send_to_workspace(workspace_id, {
            "type": "hitl_resolved",
            "hitl_id": hitl_request_id,
            "decision": "approved" if approved else "denied",
            "reason": resolution_note,
        })

        # Get conversation_id for further notifications
        if hitl.conversation_id:
            await ws_manager.send_to_workspace(workspace_id, {
                "type": "chat_done",
                "conversation_id": str(hitl.conversation_id),
                "content": f"[{'Approved' if approved else 'Denied'}] Tool execution {'will proceed' if approved else 'was denied'}. {resolution_note or ''}",
            })

        logger.info(f"HITL {hitl_request_id} resolved: approved={approved}")


@celery_app.task(name="knowledge.process_file", bind=True)
def process_knowledge_file(self, knowledge_id: str, knowledge_type: str, file_path: str, workspace_id: str):
    """
    Process an uploaded file (image, audio, PDF) for knowledge extraction.

    Args:
        knowledge_id: UUID of the knowledge item
        knowledge_type: Type of knowledge ('image', 'audio', 'pdf')
        file_path: Path to the uploaded file
        workspace_id: Workspace UUID

    Returns:
        Dict with processing status
    """
    logger.info(f"Processing {knowledge_type} file: {knowledge_id}")
    # Placeholder: will be implemented in Phase 2
    return {
        "status": "not_implemented",
        "knowledge_id": knowledge_id,
        "type": knowledge_type
    }


@celery_app.task(name="knowledge.migrate_to_hybrid", bind=True)
def migrate_knowledge_to_hybrid(self, batch_size: int = 100):
    """
    Migrate existing knowledge to hybrid search by adding sparse vectors.

    This task re-embeds all existing knowledge items to add sparse vectors
    for BM25 hybrid search. Safe to run multiple times - only processes
    knowledge that hasn't been migrated yet.

    Args:
        batch_size: Number of knowledge items to process per batch

    Returns:
        Dict with migration status and count
    """
    logger.info("Starting knowledge migration to hybrid search")

    from openforge.db.postgres import AsyncSessionLocal
    from openforge.models.knowledge import Knowledge
    from openforge.core.knowledge_processor import knowledge_processor
    from sqlalchemy import select

    async def _migrate():
        migrated = 0
        failed = 0
        total = 0

        async with AsyncSessionLocal() as db:
            # Get all knowledge items
            result = await db.execute(select(Knowledge))
            knowledge_items = result.scalars().all()
            total = len(knowledge_items)

            for item in knowledge_items:
                try:
                    # Re-process knowledge to add sparse vectors
                    await knowledge_processor.process_knowledge(
                        knowledge_id=item.id,
                        workspace_id=item.workspace_id,
                        content=item.content or "",
                        knowledge_type=item.knowledge_type or "note",
                        title=item.title,
                        tags=item.tags or [],
                        ai_summary=item.ai_summary,
                        insights=item.insights,
                    )
                    migrated += 1
                    logger.info(f"Migrated knowledge {item.id} ({migrated}/{total})")
                except Exception as e:
                    failed += 1
                    logger.warning(f"Failed to migrate knowledge {item.id}: {e}")

        logger.info(f"Migration complete: {migrated} migrated, {failed} failed")
        return {
            "status": "completed",
            "migrated": migrated,
            "failed": failed,
            "total": total
        }

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_migrate())
    except Exception as e:
        logger.exception("Knowledge migration failed")
        return {"status": "failed", "error": str(e)}
    finally:
        loop.close()
