from __future__ import annotations

import httpx
import logging
from typing import Any

from openforge.config import get_settings

logger = logging.getLogger("openforge.tool_dispatcher")


class ToolDispatcher:
    """HTTP client that calls the tool server for tool execution."""

    def _base_url(self) -> str:
        return get_settings().tool_server_url

    async def list_skills(self) -> list[dict]:
        """Return installed skills with name, description, and content."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self._base_url()}/skills")
                resp.raise_for_status()
                return resp.json().get("skills", [])
        except Exception as exc:
            logger.warning("Could not fetch installed skills: %s", exc)
            return []

    async def execute(
        self,
        tool_id: str,
        params: dict,
        workspace_id: str,
        execution_id: str,
    ) -> dict[str, Any]:
        """Execute a tool via the tool server REST API."""
        payload = {
            "tool_id": tool_id,
            "params": params,
            "context": {
                "workspace_id": workspace_id,
                "workspace_path": f"/workspace/{workspace_id}",
                "execution_id": execution_id,
                "main_app_url": get_settings().main_app_url,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{self._base_url()}/tools/execute",
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Tool server HTTP error for tool '%s': %s", tool_id, exc)
            return {"success": False, "error": str(exc)}
        except Exception as exc:
            logger.error("Tool dispatcher error for tool '%s': %s", tool_id, exc)
            return {"success": False, "error": str(exc)}

    async def list_tools(self) -> list[dict]:
        """Fetch available tools from the tool server registry."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self._base_url()}/tools/registry")
                resp.raise_for_status()
                return resp.json()
        except Exception as exc:
            logger.warning("Could not fetch tool registry from tool server: %s", exc)
            return []

    async def is_available(self) -> bool:
        """Check if the tool server is reachable."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self._base_url()}/health")
                return resp.status_code == 200
        except Exception:
            return False


tool_dispatcher = ToolDispatcher()
