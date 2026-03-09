import httpx
from protocol import BaseTool, ToolContext, ToolResult
from security import security


class HttpGetTool(BaseTool):
    @property
    def id(self): return "http.get"

    @property
    def category(self): return "http"

    @property
    def display_name(self): return "HTTP GET"

    @property
    def description(self):
        return "Make an HTTP GET request and return the response body and status code."

    @property
    def input_schema(self):
        return {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to fetch"},
                "headers": {"type": "object", "description": "Optional request headers"},
                "timeout": {"type": "number", "default": 30, "description": "Timeout in seconds"},
            },
            "required": ["url"],
        }

    @property
    def max_output(self): return 100000

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = params["url"]
        try:
            security.validate_url(url)
        except ValueError as exc:
            return ToolResult(success=False, error=str(exc))

        headers = params.get("headers", {})
        timeout = params.get("timeout", 30)

        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
            output = {"status": resp.status_code, "body": resp.text, "headers": dict(resp.headers)}
            body_str = resp.text
            if self.max_output and len(body_str) > self.max_output:
                return ToolResult(
                    success=True,
                    output={"status": resp.status_code, "body": body_str[: self.max_output]},
                    truncated=True,
                    original_length=len(body_str),
                )
            return ToolResult(success=True, output=output)
        except Exception as exc:
            return ToolResult(success=False, error=str(exc))
