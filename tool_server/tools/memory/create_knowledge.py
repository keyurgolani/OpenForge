"""
Create knowledge tool for OpenForge.

Creates a new knowledge entry in the workspace.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.config import get_settings
import httpx
import logging

logger = logging.getLogger("tool-server.memory")


class MemoryCreateKnowledgeTool(BaseTool):
    """Create a new knowledge entry in the workspace."""

    @property
    def id(self) -> str:
        return "memory.create_knowledge"

    @property
    def category(self) -> str:
        return "memory"

    @property
    def display_name(self) -> str:
        return "Create Knowledge"

    @property
    def description(self) -> str:
        return """Create a new knowledge entry in the workspace.

Creates a new note or knowledge entry with the specified content.
The entry will be processed for embeddings automatically.

Use for:
- Storing research findings
- Creating notes from agent work
- Saving important information for later reference"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Title for the knowledge entry"
                },
                "content": {
                    "type": "string",
                    "description": "The content (markdown supported)"
                },
                "type": {
                    "type": "string",
                    "enum": ["knowledge", "fleeting", "gist"],
                    "default": "knowledge",
                    "description": "Type of knowledge entry"
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tags to apply to the entry"
                },
                "gist_language": {
                    "type": "string",
                    "description": "Language for gist type entries"
                }
            },
            "required": ["content"]
        }

    @property
    def risk_level(self) -> str:
        return "medium"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        content = params.get("content", "").strip()
        if not content:
            return ToolResult(
                success=False,
                output=None,
                error="Content is required"
            )

        title = params.get("title", "").strip()
        entry_type = params.get("type", "knowledge")
        tags = params.get("tags", [])
        gist_language = params.get("gist_language")

        settings = get_settings()

        try:
            # Call main app's knowledge API
            url = f"{settings.main_app_url}/api/v1/workspaces/{context.workspace_id}/knowledge"

            payload = {
                "content": content,
                "type": entry_type,
            }

            if title:
                payload["title"] = title
            if tags:
                payload["tags"] = tags
            if entry_type == "gist" and gist_language:
                payload["gist_language"] = gist_language

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload)

            if response.status_code == 404:
                return ToolResult(
                    success=False,
                    output=None,
                    error="Workspace not found"
                )
            if response.status_code not in [200, 201]:
                try:
                    error_data = response.json()
                except Exception:
                    error_data = {}
                return ToolResult(
                    success=False,
                    output=None,
                    error=error_data.get("detail", f"Failed to create knowledge: {response.status_code}")
                )

            data = response.json()

            return ToolResult(
                success=True,
                output={
                    "id": data.get("id"),
                    "title": data.get("title"),
                    "type": data.get("type"),
                    "created_at": data.get("created_at"),
                    "message": "Knowledge entry created successfully",
                }
            )

        except httpx.RequestError as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to connect to main app: {str(e)}"
            )
        except Exception as e:
            logger.exception("Error creating knowledge")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to create knowledge: {str(e)}"
            )
