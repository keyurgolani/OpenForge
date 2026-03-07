"""
Get plan tool for OpenForge.

Retrieves the current plan state.
"""
from protocol import BaseTool, ToolResult, ToolContext
from config import get_settings
import redis.asyncio as aioredis
import logging
import json

logger = logging.getLogger("tool-server.task")


class TaskGetPlanTool(BaseTool):
    """Retrieve the current plan state."""

    @property
    def id(self) -> str:
        return "task.get_plan"

    @property
    def category(self) -> str:
        return "task"

    @property
    def display_name(self) -> str:
        return "Get Plan"

    @property
    def description(self) -> str:
        return """Retrieve the current plan state.

Returns the full plan including all steps, their statuses, and results.
Use to review progress or check what steps remain.

Use for:
- Reviewing current progress
- Checking remaining steps
- Debugging plan execution"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "include_results": {
                    "type": "boolean",
                    "default": True,
                    "description": "Include step results in the response"
                }
            },
            "required": []
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        include_results = params.get("include_results", True)

        settings = get_settings()

        try:
            # Connect to Redis
            redis = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True
            )

            # Get plan
            redis_key = f"agent_plan:{context.execution_id}"
            plan_json = await redis.get(redis_key)
            await redis.close()

            if not plan_json:
                return ToolResult(
                    success=True,
                    output={
                        "plan": None,
                        "message": "No plan found for this execution"
                    }
                )

            plan = json.loads(plan_json)

            # Build summary
            completed = sum(1 for s in plan["steps"] if s["status"] == "completed")
            failed = sum(1 for s in plan["steps"] if s["status"] == "failed")
            pending = sum(1 for s in plan["steps"] if s["status"] == "pending")
            in_progress = sum(1 for s in plan["steps"] if s["status"] == "in_progress")

            # Optionally strip results for brevity
            if not include_results:
                for step in plan["steps"]:
                    step.pop("result", None)
                    step.pop("error", None)

            return ToolResult(
                success=True,
                output={
                    "plan": plan,
                    "summary": {
                        "total_steps": len(plan["steps"]),
                        "completed": completed,
                        "failed": failed,
                        "pending": pending,
                        "in_progress": in_progress,
                        "progress_percent": round(completed / len(plan["steps"]) * 100, 1) if plan["steps"] else 0,
                    }
                }
            )

        except aioredis.RedisError as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"Redis error: {str(e)}"
            )
        except Exception as e:
            logger.exception("Error getting plan")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to get plan: {str(e)}"
            )
