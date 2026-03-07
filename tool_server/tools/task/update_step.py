"""
Update step tool for OpenForge.

Updates the status of a plan step.
"""
from protocol import BaseTool, ToolResult, ToolContext
from config import get_settings
import redis.asyncio as aioredis
import logging
import json
from datetime import datetime

logger = logging.getLogger("tool-server.task")


class TaskUpdateStepTool(BaseTool):
    """Update the status of a plan step."""

    @property
    def id(self) -> str:
        return "task.update_step"

    @property
    def category(self) -> str:
        return "task"

    @property
    def display_name(self) -> str:
        return "Update Step"

    @property
    def description(self) -> str:
        return """Update the status of a plan step.

Marks a step as in_progress, completed, or failed, and optionally
stores a result or error message.

Use for:
- Tracking progress through a plan
- Recording step results
- Marking tasks as done"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "step_index": {
                    "type": "integer",
                    "description": "Index of the step to update (0-based)"
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "completed", "failed", "skipped"],
                    "description": "New status for the step"
                },
                "result": {
                    "type": "string",
                    "description": "Result or output from the step"
                },
                "error": {
                    "type": "string",
                    "description": "Error message if the step failed"
                }
            },
            "required": ["step_index", "status"]
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        step_index = params.get("step_index")
        status = params.get("status")

        if step_index is None:
            return ToolResult(
                success=False,
                output=None,
                error="Step index is required"
            )

        if not status:
            return ToolResult(
                success=False,
                output=None,
                error="Status is required"
            )

        result_text = params.get("result")
        error_text = params.get("error")

        settings = get_settings()

        try:
            # Connect to Redis
            redis = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True
            )

            # Get current plan
            redis_key = f"agent_plan:{context.execution_id}"
            plan_json = await redis.get(redis_key)

            if not plan_json:
                await redis.close()
                return ToolResult(
                    success=False,
                    output=None,
                    error="No plan found for this execution. Create a plan first."
                )

            plan = json.loads(plan_json)

            # Validate step index
            if step_index < 0 or step_index >= len(plan["steps"]):
                await redis.close()
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Invalid step index: {step_index}. Plan has {len(plan['steps'])} steps."
                )

            # Update step
            step = plan["steps"][step_index]
            step["status"] = status

            if status == "in_progress":
                step["started_at"] = datetime.utcnow().isoformat()
                plan["current_step"] = step_index
            elif status in ["completed", "failed", "skipped"]:
                step["completed_at"] = datetime.utcnow().isoformat()

            if result_text:
                step["result"] = result_text
            if error_text:
                step["error"] = error_text

            # Check if all steps are done
            all_done = all(
                s["status"] in ["completed", "failed", "skipped"]
                for s in plan["steps"]
            )
            if all_done:
                plan["status"] = "completed"

            # Save updated plan
            await redis.set(redis_key, json.dumps(plan))
            await redis.close()

            return ToolResult(
                success=True,
                output={
                    "step_index": step_index,
                    "status": status,
                    "plan_status": plan["status"],
                    "all_done": all_done,
                    "message": f"Step {step_index} updated to '{status}'",
                }
            )

        except aioredis.RedisError as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"Redis error: {str(e)}"
            )
        except Exception as e:
            logger.exception(f"Error updating step {step_index}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to update step: {str(e)}"
            )
