"""
Move/rename file tool for OpenForge.

Moves or renames files within workspace scope.
"""
from protocol import BaseTool, ToolResult, ToolContext
from security import WorkspaceSecurity
from config import get_settings
from pathlib import Path
import logging

logger = logging.getLogger("tool-server.filesystem")


class MoveFileTool(BaseTool):
    """Move or rename a file within the workspace."""

    @property
    def id(self) -> str:
        return "filesystem.move_file"

    @property
    def category(self) -> str:
        return "filesystem"

    @property
    def display_name(self) -> str:
        return "Move/Rename File"

    @property
    def description(self) -> str:
        return """Move or rename a file or directory within the workspace.

This can be used to:
- Rename a file in place
- Move a file to a different directory
- Rename a directory

Parent directories for the destination will be created if they don't exist.
If the destination file already exists, it will be overwritten."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": "Relative path to the source file or directory"
                },
                "destination": {
                    "type": "string",
                    "description": "Relative path to the destination"
                }
            },
            "required": ["source", "destination"]
        }

    @property
    def risk_level(self) -> str:
        return "high"

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        settings = get_settings()
        security = WorkspaceSecurity(settings.workspace_root)

        try:
            source_path = params["source"]
            dest_path = params["destination"]

            full_source = security.resolve_path(context.workspace_id, source_path)
            full_dest = security.resolve_path(context.workspace_id, dest_path)

            if not full_source.exists():
                return ToolResult(
                    success=False,
                    output=None,
                    error=f"Source not found: {source_path}"
                )

            # Check if destination exists
            dest_existed = full_dest.exists()

            # Create parent directories for destination if needed
            full_dest.parent.mkdir(parents=True, exist_ok=True)

            # Perform the move
            full_source.rename(full_dest)

            logger.info(f"Moved: {source_path} -> {dest_path}")

            return ToolResult(
                success=True,
                output={
                    "source": source_path,
                    "destination": dest_path,
                    "type": "directory" if full_dest.is_dir() else "file",
                    "destination_existed": dest_existed,
                }
            )

        except ValueError as e:
            return ToolResult(
                success=False,
                output=None,
                error=str(e)
            )
        except Exception as e:
            logger.exception(f"Error moving file: {params.get('source')} -> {params.get('destination')}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to move file: {str(e)}"
            )
