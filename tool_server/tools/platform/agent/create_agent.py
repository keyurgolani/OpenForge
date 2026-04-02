import httpx
from protocol import BaseTool, ToolContext, ToolResult


class CreateAgentTool(BaseTool):
    @property
    def id(self): return "platform.agent.create_agent"

    @property
    def category(self): return "platform.agent"

    @property
    def display_name(self): return "Create Agent"

    @property
    def description(self):
        return (
            "Create a new agent definition. Requires a name, slug, and system prompt at minimum. "
            "Optionally configure tools, parameters, outputs, LLM settings, and memory settings. "
            "The new agent becomes available for invocation and chat immediately."
        )

    @property
    def risk_level(self): return "medium"

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Display name for the agent",
                },
                "slug": {
                    "type": "string",
                    "description": "Unique URL-safe identifier (e.g. 'my-agent')",
                },
                "description": {
                    "type": "string",
                    "description": "Brief description of what the agent does",
                },
                "icon": {
                    "type": "string",
                    "description": "Icon name (e.g. 'code', 'search', 'mail')",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Categorization tags",
                },
                "system_prompt": {
                    "type": "string",
                    "description": "The agent's system prompt / instructions",
                },
                "tools_config": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {"name": {"type": "string"}},
                    },
                    "description": "List of tools to enable, e.g. [{\"name\": \"http.search_web\"}]",
                },
                "parameters": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Input parameter definitions",
                },
                "output_definitions": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Output schema definitions",
                },
                "llm_config": {
                    "type": "object",
                    "description": "LLM settings (temperature, allow_override, etc.)",
                },
                "memory_config": {
                    "type": "object",
                    "description": "Memory settings (history_limit, attachment_support, etc.)",
                },
            },
            "required": ["name", "slug", "system_prompt"],
        }

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        payload = {
            "name": params["name"],
            "slug": params["slug"],
            "system_prompt": params["system_prompt"],
        }
        for field in ("description", "icon", "tags", "tools_config", "parameters",
                       "output_definitions", "llm_config", "memory_config"):
            if field in params:
                payload[field] = params[field]

        url = f"{context.main_app_url}/api/v1/agents"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
            data = resp.json()
            return ToolResult(
                success=True,
                output={
                    "message": f"Agent '{data.get('name')}' created successfully.",
                    "agent_id": data.get("id"),
                    "slug": data.get("slug"),
                },
            )
        except httpx.HTTPStatusError as exc:
            return ToolResult(success=False, error=f"Failed to create agent: {exc.response.status_code} {exc.response.text[:300]}")
        except Exception as exc:
            return ToolResult(success=False, error=f"Failed to create agent: {exc}")
