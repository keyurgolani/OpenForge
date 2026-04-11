import httpx
from protocol import BaseTool, ToolContext, ToolResult
from security import security
from content_boundary import wrap_untrusted


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
            return ToolResult(
                success=False, error=str(exc),
                recovery_hints=["Verify the URL format (must include scheme, e.g. https://)", "Check that the domain is not blocked by security policy"],
            )

        headers = params.get("headers", {})
        body = params.get("body")
        timeout = params.get("timeout", 30)

        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                resp = await client.post(url, json=body, headers=headers)
            wrapped_body = wrap_untrusted(resp.text, url)
            output = {"status": resp.status_code, "body": wrapped_body}
            if self.max_output and len(wrapped_body) > self.max_output:
                return ToolResult(
                    success=True,
                    output={"status": resp.status_code, "body": wrap_untrusted(resp.text[: self.max_output], url)},
                    truncated=True,
                    original_length=len(resp.text),
                )
            return ToolResult(success=True, output=output)
        except Exception as exc:
            error = str(exc)
            hints = ["Verify the URL is accessible and the server is running"]
            if "timeout" in error.lower():
                hints.append("Increase the timeout parameter for slow endpoints")
            if "ssl" in error.lower() or "certificate" in error.lower():
                hints.append("The server may have an invalid SSL certificate")
            return ToolResult(success=False, error=error, recovery_hints=hints)
