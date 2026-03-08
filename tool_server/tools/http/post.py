"""
HTTP POST tool for OpenForge.

Makes HTTP POST requests with configurable body and options.
"""
from tool_server.protocol import BaseTool, ToolResult, ToolContext
from tool_server.config import get_settings
import httpx
import json
import logging
from typing import Any

logger = logging.getLogger("tool-server.http")


class HttpPostTool(BaseTool):
    """Make an HTTP POST request."""

    @property
    def id(self) -> str:
        return "http.post"

    @property
    def category(self) -> str:
        return "http"

    @property
    def display_name(self) -> str:
        return "HTTP POST"

    @property
    def description(self) -> str:
        return """Make an HTTP POST request to a URL.

Sends data to the specified URL with configurable body, headers, and timeout.
Returns the response body, status code, and headers.

Use for:
- Submitting form data
- Creating resources via API
- Sending JSON payloads

WARNING: This can modify data on external services."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to post to"
                },
                "body": {
                    "type": ["string", "object"],
                    "description": "Request body (string or JSON object)"
                },
                "content_type": {
                    "type": "string",
                    "default": "application/json",
                    "description": "Content-Type header value"
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
                    "enum": ["text", "json"],
                    "default": "text",
                    "description": "How to parse the response body"
                }
            },
            "required": ["url"]
        }

    @property
    def risk_level(self) -> str:
        return "high"

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

        body = params.get("body")
        content_type = params.get("content_type", "application/json")
        headers = params.get("headers", {})
        timeout = params.get("timeout", 30)
        follow_redirects = params.get("follow_redirects", True)
        return_format = params.get("return_format", "text")

        # Add default headers if not provided
        if "User-Agent" not in headers and "user-agent" not in headers:
            headers["User-Agent"] = "OpenForge-ToolServer/1.0"
        if "Content-Type" not in headers and "content-type" not in headers:
            headers["Content-Type"] = content_type

        # Prepare request body
        request_body = None
        if body is not None:
            if isinstance(body, dict) or isinstance(body, list):
                request_body = json.dumps(body)
            else:
                request_body = str(body)

        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=follow_redirects) as client:
                response = await client.post(url, content=request_body, headers=headers)

            status_code = response.status_code
            response_headers = dict(response.headers)

            # Read response body
            if return_format == "json":
                try:
                    response_body = response.json()
                except Exception:
                    response_body = response.text
            else:
                response_body = response.text

            # Truncate if needed
            original_length = len(str(response_body))
            truncated = False
            if self.max_output_chars and original_length > self.max_output_chars:
                response_body = str(response_body)[:self.max_output_chars]
                response_body += "\n\n... [OUTPUT TRUNCATED]"
                truncated = True

            return ToolResult(
                success=200 <= status_code < 300,
                output={
                    "url": str(response.url),
                    "status_code": status_code,
                    "headers": response_headers,
                    "body": response_body,
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
            logger.exception(f"Error making HTTP POST request to {url}")
            return ToolResult(
                success=False,
                output=None,
                error=f"Failed to make request: {str(e)}"
            )
