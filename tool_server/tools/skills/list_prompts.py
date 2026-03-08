"""
List prompts tool for OpenForge.

Lists available prompt templates/skills.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.config import get_settings
import httpx
import logging

logger = logging.getLogger("tool-server.skills")


class SkillsListPromptsTool(BaseTool):
    """List available prompt templates."""

    @property
    def id(self) -> str:
        return "skills.list_prompts"

    @property
    def category(self) -> str:
        return "skills"

    @property
    def display_name(self) -> str:
        return "List Prompts"

    @property
    def description(self) -> str:
        return """List available prompt templates (skills).

Returns a list of prompt templates that can be used with the agent.
Templates can include system prompts, task-specific prompts, and more.

Use for:
- Discovering available prompts
- Finding the right prompt for a task
- Understanding agent capabilities"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Filter by category (optional)"
                }
            },
            "required": []
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        category = params.get("category", "").strip()

        settings = get_settings()

        try:
            # Call main app's prompts/skills API
            url = f"{settings.main_app_url}/api/v1/workspaces/{context.workspace_id}/prompts"

            params = {}
            if category:
                params["category"] = category

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, params=params)
                if response.status_code == 404:
                    return ToolResult(
                        success=True,
                        output={"prompts": [], "count": 0, "message": "No prompts available"},
                    )
                response.raise_for_status()
                data = response.json()

            prompts = []
            for item in data.get("prompts", []):
                prompts.append({
                    "id": item.get("id"),
                    "name": item.get("name", "Unnamed"),
                    "description": item.get("description", ""),
                    "category": item.get("category", "general"),
                    "variables": item.get("variables", []),
                })

            return ToolResult(
                success=True,
                output={"prompts": prompts, "count": len(prompts)},
            )

        except httpx.RequestError as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to connect to main app: {str(e)}",
            )
        except Exception as e:
            logger.exception("Error listing prompts")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to list prompts: {str(e)}",
            )
