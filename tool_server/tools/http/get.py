"""
HTTP GET tool for OpenForge.

Makes HTTP GET requests with configurable options.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.config import get_settings
import httpx
import logging
from typing import Any

logger = logging.getLogger("tool-server.http")


class HttpGetTool(BaseTool):
    """Make an HTTP GET request."""

    @property
    def id(self) -> str:
        return "http.get"

    @property
    def category(self) -> str:
        return "http"

    @property
    def display_name(self) -> str:
        return "HTTP GET"

    @property
    def description(self) -> str:
        return """Make an HTTP GET request to a URL.

Fetches content from the specified URL with configurable headers and timeout.
Returns the response body, status code, and headers.

Use for:
- Fetching API data
- Downloading content
- Checking URL availability"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch"
                },
                "headers": {
                    "type": "object",
                    "description": "Optional HTTP headers to include",
                    "additionalProperties": {"type": "string"}
                },
                "timeout": {
                    "type": "integer",
                    "default": 30,
                    "description": "Request timeout in seconds"
                },
                "follow_redirects": {
                    "type": "boolean",
                    "default": True,
                    "description": "Whether to follow HTTP redirects"
                },
                "return_format": {
                    "type": "string",
                    "enum": ["text", "json", "binary"],
                    "default": "text",
                    "description": "How to parse the response body"
                }
            },
            "required": ["url"]
        }

    @property
    def risk_level(self) -> str:
        return "medium"

    @property
    def max_output_chars(self) -> int:
        return 100000

    async def execute(self, params: dict, context: ToolContext) -> ToolResult:
        url = params.get("url", "").strip()
        if not url:
            return ToolResult(
                success=False,
                output=None,
                error="URL is required"
            )

        # Validate URL scheme
        if not url.startswith(("http://", "https://")):
            return ToolResult(
                success=False,
                output=None,
                error="URL must start with http:// or https://"
            )

        headers = params.get("headers", {})
        timeout = params.get("timeout", 30)
        follow_redirects = params.get("follow_redirects", True)
        return_format = params.get("return_format", "text")

        # Add default user agent if not provided
        if "User-Agent" not in headers and "user-agent" not in headers:
            headers["User-Agent"] = "OpenForge-ToolServer/1.0"

        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=follow_redirects) as client:
                response = await client.get(url, headers=headers)

            status_code = response.status_code
            response_headers = dict(response.headers)

            # Read response body
            if return_format == "json":
                try:
                    body = response.json()
                except Exception:
                    body = response.text
                    return ToolResult(
                        success=False,
                        output=None,
                        error=f"Response is not valid JSON: {body[:500]}"
                    )
            elif return_format == "binary":
                body = f"<binary data: {len(response.content)} bytes>"
            else:
                body = response.text

            # Truncate if needed
            original_length = len(str(body))
            truncated = False
            if self.max_output_chars and original_length > self.max_output_chars:
                body = str(body)[:self.max_output_chars]
                body += "\n\n... [OUTPUT TRUNCATED]"
                truncated = True

            return ToolResult(
                success=200 <= status_code < 300,
                output={
                    "url": str(response.url),
                    "status_code": status_code,
                    "headers": response_headers,
                    "body": body,
                    "content_type": response_headers.get("content-type", ""),
                },
                truncated=truncated,
                original_length=original_length if truncated else None
            )

        except httpx.RequestError as e:
            return ToolResult(
                success=False,
                output=None,
                error=f"HTTP request failed: {str(e)}"
            )
        except Exception as e:
            logger.exception(f"Error making HTTP GET request to {url}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to make request: {str(e)}"
            )
