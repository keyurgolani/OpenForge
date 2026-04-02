import httpx
from protocol import BaseTool, ToolContext, ToolResult


class UpdateAgentTool(BaseTool):
    @property
    def id(self): return "platform.agent.update_agent"

    @property
    def category(self): return "platform.agent"

    @property
    def display_name(self): return "Update Agent"

    @property
    def description(self):
        return (
            "Update an existing agent definition. Only provided fields are changed; "
            "omitted fields remain unchanged. Use platform.agent.get_agent first "
            "to read the current configuration before modifying."
        )

    @property
    def risk_level(self): return "medium"

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "The UUID of the agent to update",
                },
                "name": {
                    "type": "string",
                    "description": "New display name",
                },
                "slug": {
                    "type": "string",
                    "description": "New URL-safe identifier",
                },
                "description": {
                    "type": "string",
                    "description": "New description",
                },
                "icon": {
                    "type": "string",
                    "description": "New icon name",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "New tags (replaces existing)",
                },
                "system_prompt": {
                    "type": "string",
                    "description": "New system prompt",
                },
                "tools_config": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {"name": {"type": "string"}},
                    },
                    "description": "New tools configuration (replaces existing)",
                },
                "parameters": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "New parameter definitions (replaces existing)",
                },
                "output_definitions": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "New output definitions (replaces existing)",
                },
                "llm_config": {
                    "type": "object",
                    "description": "New LLM settings",
                },
                "memory_config": {
                    "type": "object",
                    "description": "New memory settings",
                },
            },
            "required": ["agent_id"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        agent_id = params.get("agent_id")
        if not agent_id:
            return ToolResult(success=False, error="agent_id is required")

        payload = {}
        for field in ("name", "slug", "description", "icon", "tags", "system_prompt",
                       "tools_config", "parameters", "output_definitions",
                       "llm_config", "memory_config"):
            if field in params:
                payload[field] = params[field]

        if not payload:
            return ToolResult(success=False, error="No fields to update.")

        url = f"{context.main_app_url}/api/v1/agents/{agent_id}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.patch(url, json=payload)
                resp.raise_for_status()
            data = resp.json()
            return ToolResult(
                success=True,
                output={
                    "message": f"Agent '{data.get('name')}' updated successfully.",
                    "agent_id": data.get("id"),
                    "slug": data.get("slug"),
                },
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return ToolResult(success=False, error=f"Agent {agent_id} not found")
            return ToolResult(success=False, error=f"Failed to update agent: {exc.response.status_code} {exc.response.text[:300]}")
        except Exception as exc:
            return ToolResult(success=False, error=f"Failed to update agent: {exc}")
