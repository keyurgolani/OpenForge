"""
Get prompt tool for OpenForge.

Retrieves a prompt template with variable substitution.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.config import get_settings
import httpx
import logging

logger = logging.getLogger("tool-server.skills")


class SkillsGetPromptTool(BaseTool):
    """Retrieve a prompt template with variable substitution."""

    @property
    def id(self) -> str:
        return "skills.get_prompt"

    @property
    def category(self) -> str:
        return "skills"

    @property
    def display_name(self) -> str:
        return "Get Prompt"

    @property
    def description(self) -> str:
        return """Retrieve a prompt template with variable substitution.

Gets a specific prompt template and substitutes any variables with provided values.
Variables are typically in the format {{variable_name}}.

Use for:
- Getting a ready-to-use prompt
- Using predefined prompt templates
- Standardizing prompt usage"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "prompt_id": {
                    "type": "string",
                    "description": "ID of the prompt template to retrieve"
                },
                "variables": {
                    "type": "object",
                    "description": "Variables to substitute in the template",
                    "additionalProperties": {"type": "string"}
                }
            },
            "required": ["prompt_id"]
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        prompt_id = params.get("prompt_id", "").strip()
        if not prompt_id:
            return ToolResult(
                success=False,
                output=None,
                error="Prompt ID is required"
            )

        variables = params.get("variables", {})

        settings = get_settings()

        try:
            # Call main app's prompts API
            url = f"{settings.main_app_url}/api/v1/workspaces/{context.workspace_id}/prompts/{prompt_id}"

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url)
                if response.status_code == 404:
                    return ToolResult(
                        success=False,
                        output=None,
                        error=f"Prompt not found: {prompt_id}",
                    )
                response.raise_for_status()
                data = response.json()

            # Get template content
            template = data.get("content", "")

            # Substitute variables
            substituted = template
            for key, value in variables.items():
                placeholder = "{{" + key + "}}"
                substituted = substituted.replace(placeholder, str(value))

            # Check for unsubstituted variables
            import re
            remaining_vars = re.findall(r'\{\{(\w+)\}\}', substituted)

            return ToolResult(
                success=True,
                output={
                    "prompt_id": prompt_id,
                    "name": data.get("name", "Unnamed"),
                    "description": data.get("description", ""),
                    "template": template,
                    "substituted": substituted,
                    "variables_used": list(variables.keys()),
                    "remaining_variables": remaining_vars,
                    "missing_variables": [v for v in (data.get("variables", [])) if v not in variables],
                },
            )

        except httpx.RequestError as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to connect to main app: {str(e)}",
            )
        except Exception as e:
            logger.exception(f"Error getting prompt: {prompt_id}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to get prompt: {str(e)}",
            )
