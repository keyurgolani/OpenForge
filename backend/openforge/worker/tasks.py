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
def resume_after_hitl(self, execution_id: str, hitl_request_id: str, approved: bool, **kwargs):
    """
    Resume an agent after HITL approval/denial.

    Args:
        execution_id: The agent execution to resume
        hitl_request_id: The HITL request that was resolved
        approved: Whether the tool call was approved
        **kwargs: Additional parameters for resuming

    Returns:
        Dict with execution status
    """
    logger.info(f"Agent resume after HITL: {execution_id}, approved={approved}")

    # TODO: Implement HITL resume in Phase 4
    # This will continue the agent loop with the tool call result

    return {"status": "not_implemented", "execution_id": execution_id}


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
