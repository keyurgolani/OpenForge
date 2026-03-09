import httpx
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class HttpPostTool(BaseTool):
    @property
    def id(self): return "http.post"

    @property
    def category(self): return "http"

    @property
    def display_name(self): return "HTTP POST"

    @property
    def description(self):
        return "Make an HTTP POST request with JSON body and return the response."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to post to"},
                "body": {"type": "object", "description": "JSON body to send"},
                "headers": {"type": "object", "description": "Optional request headers"},
                "timeout": {"type": "number", "default": 30},
            },
            "required": ["url"],
        }

    @property
    def risk_level(self): return "medium"

    @property
    def max_output(self): return 50000

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = params["url"]
        try:
            security.validate_url(url)
        except ValueError as exc:
            return ToolResult(success=False, error=str(exc))

        headers = params.get("headers", {})
        body = params.get("body")
        timeout = params.get("timeout", 30)

        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                resp = await client.post(url, json=body, headers=headers)
            output = {"status": resp.status_code, "body": resp.text}
            if self.max_output and len(resp.text) > self.max_output:
                return ToolResult(
                    success=True,
                    output={"status": resp.status_code, "body": resp.text[: self.max_output]},
                    truncated=True,
                    original_length=len(resp.text),
                )
            return ToolResult(success=True, output=output)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
