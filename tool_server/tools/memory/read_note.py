"""
Read note tool for OpenForge.

Reads a specific knowledge entry's content.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.config import get_settings
import httpx
import logging

logger = logging.getLogger("tool-server.memory")


class MemoryReadNoteTool(BaseTool):
    """Read a specific knowledge entry's content."""

    @property
    def id(self) -> str:
        return "memory.read_note"

    @property
    def category(self) -> str:
        return "memory"

    @property
    def display_name(self) -> str:
        return "Read Note"

    @property
    def description(self) -> str:
        return """Read the full content of a specific knowledge entry.

Fetches a knowledge entry by its ID and returns the full content,
including metadata like title, type, tags, and timestamps.

Use for:
- Reading the full content of a search result
- Accessing specific notes by ID
- Getting detailed information about a knowledge entry"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "knowledge_id": {
                    "type": "string",
                    "description": "The ID of the knowledge entry to read"
                },
                "include_tags": {
                    "type": "boolean",
                    "default": True,
                    "description": "Include tags in the response"
                },
                "include_insights": {
                    "type": "boolean",
                    "default": False,
                    "description": "Include AI-generated insights"
                }
            },
            "required": ["knowledge_id"]
        }

    @property
    def risk_level(self) -> str:
        return "low"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        knowledge_id = params.get("knowledge_id", "").strip()
        if not knowledge_id:
            return ToolResult(
                success=False,
                output=None,
                error="Knowledge ID is required"
            )

        include_tags = params.get("include_tags", True)
        include_insights = params.get("include_insights", False)

        settings = get_settings()

        try:
            # Call main app's knowledge API
            url = f"{settings.main_app_url}/api/v1/workspaces/{context.workspace_id}/knowledge/{knowledge_id}"

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url)

            if response.status_code == 404:
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Knowledge entry not found: {knowledge_id}"
                )
            if response.status_code != 200:
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Knowledge API error: {response.status_code}"
                )

            data = response.json()

            result = {
                "id": data.get("id"),
                "title": data.get("title", "Untitled"),
                "type": data.get("type", "knowledge"),
                "content": data.get("content", ""),
                "created_at": data.get("created_at"),
                "updated_at": data.get("updated_at"),
                "is_pinned": data.get("is_pinned", False),
            }

            if include_tags:
                result["tags"] = data.get("tags", [])

            if include_insights:
                result["insights"] = data.get("insights")
                result["ai_summary"] = data.get("ai_summary")

            # Include type-specific fields
            if data.get("type") == "bookmark":
                result["url"] = data.get("url")
                result["url_title"] = data.get("url_title")
            elif data.get("type") == "gist":
                result["gist_language"] = data.get("gist_language")
            elif data.get("type") in ["image", "audio", "pdf"]:
                result["file_path"] = data.get("file_path")
                result["file_metadata"] = data.get("file_metadata")

            return ToolResult(
                success=True,
                output=result
            )

        except httpx.RequestError as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to connect to main app: {str(e)}"
            )
        except Exception as e:
            logger.exception(f"Error reading note: {knowledge_id}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to read note: {str(e)}"
            )
