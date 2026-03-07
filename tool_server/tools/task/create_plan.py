"""
Create plan tool for OpenForge.

Creates a structured plan with steps for task execution.
"""
from protocol import BaseTool, ToolResult, ToolContext
from config import get_settings
import redis.asyncio as aioredis
import logging
import json
import uuid
from datetime import datetime

logger = logging.getLogger("tool-server.task")


class TaskCreatePlanTool(BaseTool):
    """Create a structured plan with steps."""

    @property
    def id(self) -> str:
        return "task.create_plan"

    @property
    def category(self) -> str:
        return "task"

    @property
    def display_name(self) -> str:
        return "Create Plan"

    @property
    def description(self) -> str:
        return """Create a structured plan with steps for task execution.

Creates a plan that the agent can follow during execution. Plans are stored
in the agent's execution state and persist for the duration of the execution.

Use for:
- Breaking down complex tasks into steps
- Tracking progress on multi-step operations
- Providing structure for agent reasoning"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Title of the plan"
                },
                "description": {
                    "type": "string",
                    "description": "Description of what the plan accomplishes"
                },
                "steps": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "description": {"type": "string"},
                            "details": {"type": "string"}
                        },
                        "required": ["description"]
                    },
                    "description": "List of steps in the plan"
                }
            },
            "required": ["title", "steps"]
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        title = params.get("title", "").strip()
        if not title:
            return ToolResult(
                success=False,
                output=None,
                error="Plan title is required"
            )

        steps = params.get("steps", [])
        if not steps:
            return ToolResult(
                success=False,
                output=None,
                error="At least one step is required"
            )

        description = params.get("description", "")

        settings = get_settings()

        try:
            # Connect to Redis
            redis = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True
            )

            # Build plan structure
            plan_id = str(uuid.uuid4())
            plan = {
                "id": plan_id,
                "title": title,
                "description": description,
                "created_at": datetime.utcnow().isoformat(),
                "status": "in_progress",
                "current_step": 0,
                "steps": []
            }

            for i, step in enumerate(steps):
                plan["steps"].append({
                    "index": i,
                    "description": step.get("description", ""),
                    "details": step.get("details", ""),
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None,
                    "result": None,
                })

            # Store in Redis
            redis_key = f"agent_plan:{context.execution_id}"
            await redis.set(redis_key, json.dumps(plan))
            await redis.close()

            return ToolResult(
                success=True,
                output={
                    "plan_id": plan_id,
                    "title": title,
                    "step_count": len(plan["steps"]),
                    "message": "Plan created successfully",
                }
            )

        except aioredis.RedisError as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"Redis error: {str(e)}"
            )
        except Exception as e:
            logger.exception("Error creating plan")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to create plan: {str(e)}"
            )
