import json
from protocol import BaseTool, ToolContext, ToolResult


class UpdateStepTool(BaseTool):
    @property
    def id(self): return "task.update_step"

    @property
    def category(self): return "task"

    @property
    def display_name(self): return "Update Step"

    @property
    def description(self):
        return "Update the status of a plan step. Status can be: pending, in_progress, done, failed."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "step_id": {"type": "string", "description": "ID of the step to update"},
                "status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "done", "failed"],
                },
                "note": {"type": "string", "description": "Optional note to add to the step"},
            },
            "required": ["step_id", "status"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        try:
            import redis.asyncio as aioredis
            from config import get_settings

            redis = aioredis.from_url(get_settings().redis_url)
            raw = await redis.get(f"agent_plan:{context.execution_id}")
            if not raw:
                await redis.aclose()
                return ToolResult(success=False, error="No plan found for this execution")

            plan = json.loads(raw)
            updated = False
            for step in plan.get("steps", []):
                if step.get("id") == params["step_id"]:
                    step["status"] = params["status"]
                    if params.get("note"):
                        step["note"] = params["note"]
                    updated = True
                    break

            if not updated:
                await redis.aclose()
                return ToolResult(success=False, error=f"Step '{params['step_id']}' not found")

            await redis.set(
                f"agent_plan:{context.execution_id}",
                json.dumps(plan),
                ex=3600,
            )
            await redis.aclose()
            return ToolResult(success=True, output={"plan": plan})
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
