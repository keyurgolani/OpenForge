"""Shared access-control helper for deployment-owned workspaces."""

from __future__ import annotations

import httpx
from protocol import ToolContext, ToolResult


async def _check_deployment_write_access(
    workspace_id: str, context: ToolContext
) -> ToolResult | None:
    """Return a denied ToolResult if the workspace is deployment-owned and the
    caller is not part of that deployment. Returns None if access is allowed."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{context.main_app_url}/api/v1/workspaces/{workspace_id}"
            )
            if resp.status_code != 200:
                return None  # workspace not found — let the downstream call handle 404
            ws = resp.json()
    except Exception:
        return None  # network error — don't block, let downstream call handle it

    if ws.get("ownership_type") != "deployment":
        return None  # regular user workspace, always writable

    owner_deployment_id = ws.get("owner_deployment_id")
    if not owner_deployment_id:
        return None

    # Allow if the caller is running within the owning deployment
    if context.deployment_id and context.deployment_id == str(owner_deployment_id):
        return None

    ws_name = ws.get("name", workspace_id)
    return ToolResult(
        success=False,
        error=(
            f"Workspace '{ws_name}' is owned by a different deployment. "
            f"You can only READ from this workspace, not write to it."
        ),
    )
