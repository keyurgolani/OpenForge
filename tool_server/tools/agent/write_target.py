import httpx

from protocol import BaseTool, ToolContext, ToolResult


class WriteTargetTool(BaseTool):
    @property
    def id(self):
        return "agent.write_target"

    @property
    def category(self):
        return "agent"

    @property
    def display_name(self):
        return "Write Target Artifact"

    @property
    def description(self):
        return (
            "Create or update a persistent target artifact in the workspace artifact system. "
            "Use mode='replace' to overwrite the current artifact body, 'append' to add a newline plus content, "
            "or 'patch' to concatenate content directly."
        )

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Artifact title for the target output (for example 'weekly-report' or 'project-status').",
                },
                "content": {
                    "type": "string",
                    "description": "Markdown/text content to store in the target artifact.",
                },
                "mode": {
                    "type": "string",
                    "enum": ["replace", "append", "patch"],
                    "default": "replace",
                    "description": "Update mode: replace (overwrite), append (add with newline), patch (concatenate).",
                },
            },
            "required": ["name", "content"],
        }

    @property
    def risk_level(self):
        return "medium"

    async def _find_existing_artifact(self, client: httpx.AsyncClient, context: ToolContext, name: str) -> dict | None:
        response = await client.get(
            f"{context.main_app_url}/api/v1/artifacts",
            params={
                "workspace_id": context.workspace_id,
                "artifact_type": "target",
                "q": name,
                "limit": 50,
            },
        )
        response.raise_for_status()
        artifacts = response.json().get("artifacts", [])
        for artifact in artifacts:
            if artifact.get("title") == name:
                return artifact
        return None

    def _build_next_body(self, *, current_body: str, incoming_content: str, mode: str) -> str:
        if mode == "replace":
            return incoming_content
        if mode == "append":
            return f"{current_body}\n{incoming_content}" if current_body else incoming_content
        if mode == "patch":
            return f"{current_body}{incoming_content}"
        raise ValueError(f"Invalid mode: {mode}")

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        name = params["name"]
        incoming_content = params["content"]
        mode = params.get("mode", "replace")

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                artifact = await self._find_existing_artifact(client, context, name)
                if artifact is None:
                    response = await client.post(
                        f"{context.main_app_url}/api/v1/artifacts",
                        json={
                            "workspace_id": context.workspace_id,
                            "artifact_type": "target",
                            "title": name,
                            "summary": "Persistent target artifact created through the legacy-compatible target tool.",
                            "status": "active",
                            "visibility": "workspace",
                            "creation_mode": "run_generated",
                            "content_type": "markdown",
                            "body": incoming_content,
                            "structured_payload": {
                                "legacy_tool_id": self.id,
                                "agent_id": context.agent_id or None,
                            },
                            "metadata": {
                                "legacy_tool_id": self.id,
                                "agent_id": context.agent_id or None,
                            },
                            "tags": ["target", "artifact"],
                            "sinks": [
                                {
                                    "sink_type": "internal_workspace",
                                    "destination_ref": "workspace://artifacts",
                                    "sync_status": "not_published",
                                }
                            ],
                        },
                    )
                    response.raise_for_status()
                    created = response.json()
                    return ToolResult(
                        success=True,
                        output=f"Target artifact '{name}' created (artifact_id={created['id']})",
                    )

                current_version = artifact.get("current_version") or {}
                current_body = current_version.get("content") or (artifact.get("content") or {}).get("body", "")
                next_body = self._build_next_body(
                    current_body=current_body,
                    incoming_content=incoming_content,
                    mode=mode,
                )
                response = await client.patch(
                    f"{context.main_app_url}/api/v1/artifacts/{artifact['id']}",
                    json={
                        "body": next_body,
                        "content_type": "markdown",
                        "change_note": f"Updated by {self.id} ({mode})",
                        "status": artifact.get("status") or "active",
                    },
                )
                response.raise_for_status()
                updated = response.json()
                return ToolResult(
                    success=True,
                    output=f"Target artifact '{name}' updated (mode={mode}, artifact_id={updated['id']})",
                )
        except ValueError as exc:
            return ToolResult(success=False, error=str(exc))
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:500]
            return ToolResult(success=False, error=f"Artifact API request failed: {exc.response.status_code} {detail}")
        except Exception as exc:
            return ToolResult(success=False, error=f"Failed to persist target artifact: {exc}")
