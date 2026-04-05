"""Sink handler registry and implementations.

Each sink type has a handler that executes when a sink node runs in an
automation DAG. Handlers receive resolved inputs + DB session and return
an output dict stored on the child run.
"""

from __future__ import annotations

import json
import logging
import uuid as _uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("openforge.runtime.sink_handlers")


# ── Sink type input schemas (mirrors frontend SINK_TYPE_INFO) ────────

SINK_TYPE_INPUTS: dict[str, list[dict[str, Any]]] = {
    "log": [
        {"key": "data", "label": "Data", "type": "text", "required": True},
        {"key": "log_level", "label": "Log Level", "type": "text", "required": False, "default": "info"},
    ],
    "knowledge_create": [
        {"key": "content", "label": "Content", "type": "text", "required": True},
        {"key": "title", "label": "Title", "type": "text", "required": True},
        {"key": "workspace_id", "label": "Workspace", "type": "workspace", "required": False},
        {"key": "knowledge_type", "label": "Knowledge Type", "type": "knowledge_type", "required": False, "default": "note",
         "options": ["note", "fleeting", "bookmark", "gist", "journal", "image", "audio", "pdf", "document", "sheet", "slides"]},
    ],
    "knowledge_update": [
        {"key": "content", "label": "Content", "type": "text", "required": True},
        {"key": "knowledge_id", "label": "Knowledge ID", "type": "text", "required": True},
        {"key": "workspace_id", "label": "Workspace", "type": "workspace", "required": False},
    ],
    "article": [
        {"key": "content", "label": "Content", "type": "text", "required": True},
        {"key": "title", "label": "Title", "type": "text", "required": True},
        {"key": "output_format", "label": "Output Format", "type": "text", "required": False, "default": "markdown"},
        {"key": "file_path", "label": "File Path", "type": "text", "required": False},
    ],
    "rest_api": [
        {"key": "body", "label": "Body", "type": "text", "required": True},
        {"key": "url", "label": "URL", "type": "text", "required": True},
        {"key": "method", "label": "HTTP Method", "type": "text", "required": False, "default": "POST"},
        {"key": "headers", "label": "Headers (JSON)", "type": "text", "required": False},
    ],
    "notification": [
        {"key": "message", "label": "Message", "type": "text", "required": True},
        {"key": "channel", "label": "Channel", "type": "text", "required": True},
        {"key": "template", "label": "Message Template", "type": "text", "required": False},
    ],
}


# ── Base handler ─────────────────────────────────────────────────────

class SinkHandler(ABC):
    """Base class for sink type handlers."""

    @abstractmethod
    async def execute(
        self,
        inputs: dict[str, Any],
        db: AsyncSession,
        fallback_workspace_id: UUID | None,
        run_id: UUID,
    ) -> dict[str, Any]:
        """Execute the sink action.  Returns output dict."""
        ...


# ── Handler implementations ──────────────────────────────────────────

class LogSinkHandler(SinkHandler):
    async def execute(self, inputs, db, fallback_workspace_id, run_id):
        log_level = str(inputs.get("log_level", "info")).lower()
        data = inputs.get("data", "")
        getattr(logger, log_level if log_level in ("debug", "info", "warning", "error") else "info")(
            "Sink log [run=%s]: %s", run_id, str(data)[:500],
        )
        return {"logged": True, "log_level": log_level, "data": str(data)[:2000]}


class KnowledgeCreateSinkHandler(SinkHandler):
    async def execute(self, inputs, db, fallback_workspace_id, run_id):
        from openforge.db.models import Knowledge

        title = inputs.get("title", "Untitled")
        content = inputs.get("content", "")
        knowledge_type = inputs.get("knowledge_type", "note")
        ws_id_raw = inputs.get("workspace_id") or (str(fallback_workspace_id) if fallback_workspace_id else None)
        if not ws_id_raw:
            raise ValueError("No workspace_id in sink inputs and no fallback workspace available")
        ws_id = UUID(ws_id_raw) if isinstance(ws_id_raw, str) else ws_id_raw

        item = Knowledge(
            id=_uuid.uuid4(),
            workspace_id=ws_id,
            type=knowledge_type,
            title=title,
            content=content,
        )
        db.add(item)
        await db.flush()
        logger.info("Sink knowledge_create: created %s in workspace %s", item.id, ws_id)
        return {"knowledge_id": str(item.id), "title": title}


class KnowledgeUpdateSinkHandler(SinkHandler):
    async def execute(self, inputs, db, fallback_workspace_id, run_id):
        from openforge.db.models import Knowledge

        knowledge_id_str = inputs.get("knowledge_id", "")
        if not knowledge_id_str:
            return {"error": "knowledge_id is required", "updated": False}
        knowledge_id = UUID(knowledge_id_str)
        item = await db.get(Knowledge, knowledge_id)
        if not item:
            return {"error": f"Knowledge {knowledge_id} not found", "updated": False}

        content = inputs.get("content", "")
        item.content = content
        await db.flush()
        logger.info("Sink knowledge_update: updated %s", knowledge_id)
        return {"knowledge_id": str(knowledge_id), "updated": True}


class ArticleSinkHandler(SinkHandler):
    async def execute(self, inputs, db, fallback_workspace_id, run_id):
        from openforge.db.models import ArtifactModel

        title = inputs.get("title", "Untitled")
        content = inputs.get("content", "")
        output_format = inputs.get("output_format", "markdown")
        file_path = inputs.get("file_path") or None

        ws_id_raw = inputs.get("workspace_id") or (str(fallback_workspace_id) if fallback_workspace_id else None)
        if not ws_id_raw:
            raise ValueError("No workspace_id in sink inputs and no fallback workspace available")
        ws_id = UUID(ws_id_raw) if isinstance(ws_id_raw, str) else ws_id_raw

        artifact = ArtifactModel(
            id=_uuid.uuid4(),
            artifact_type="article",
            workspace_id=ws_id,
            source_run_id=run_id,
            title=title,
            content={"body": content, "format": output_format},
            metadata_json={"file_path": file_path, "output_format": output_format},
            status="published",
            creation_mode="automation",
        )
        db.add(artifact)
        await db.flush()

        written_path = None
        if file_path:
            try:
                p = Path(file_path)
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(content, encoding="utf-8")
                written_path = str(p)
                logger.info("Sink article: wrote file %s", written_path)
            except Exception as exc:
                logger.warning("Sink article: filesystem write failed for %s: %s", file_path, exc)

        logger.info("Sink article: created artifact %s", artifact.id)
        return {"artifact_id": str(artifact.id), "title": title, "file_path": written_path}


class RestApiSinkHandler(SinkHandler):
    async def execute(self, inputs, db, fallback_workspace_id, run_id):
        url = inputs.get("url", "")
        if not url:
            return {"error": "url is required", "status_code": 0, "response_body": ""}

        method = str(inputs.get("method", "POST")).upper()
        body = inputs.get("body", "")
        headers_raw = inputs.get("headers", "")

        headers: dict[str, str] = {}
        if headers_raw:
            try:
                headers = json.loads(headers_raw) if isinstance(headers_raw, str) else headers_raw
            except (json.JSONDecodeError, TypeError):
                pass

        if "Content-Type" not in headers:
            headers["Content-Type"] = "application/json"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.request(method, url, content=body if isinstance(body, str) else json.dumps(body), headers=headers)
            logger.info("Sink rest_api: %s %s -> %d", method, url, resp.status_code)
            return {"status_code": resp.status_code, "response_body": resp.text[:2000]}
        except httpx.HTTPError as exc:
            logger.warning("Sink rest_api: %s %s failed: %s", method, url, exc)
            return {"status_code": 0, "response_body": str(exc)[:2000], "error": str(exc)[:500]}


class NotificationSinkHandler(SinkHandler):
    async def execute(self, inputs, db, fallback_workspace_id, run_id):
        channel = inputs.get("channel", "")
        if not channel:
            return {"error": "channel (webhook URL) is required", "status_code": 0, "delivered": False}

        message = inputs.get("message", "")
        template = inputs.get("template")
        if template and "{{message}}" in template:
            text = template.replace("{{message}}", message)
        else:
            text = message

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(channel, json={"text": text}, headers={"Content-Type": "application/json"})
            delivered = 200 <= resp.status_code < 300
            logger.info("Sink notification: POST %s -> %d (delivered=%s)", channel, resp.status_code, delivered)
            return {"status_code": resp.status_code, "delivered": delivered}
        except httpx.HTTPError as exc:
            logger.warning("Sink notification: POST %s failed: %s", channel, exc)
            return {"status_code": 0, "delivered": False, "error": str(exc)[:500]}


# ── Registry ─────────────────────────────────────────────────────────

_HANDLERS: dict[str, SinkHandler] = {
    "log": LogSinkHandler(),
    "knowledge_create": KnowledgeCreateSinkHandler(),
    "knowledge_update": KnowledgeUpdateSinkHandler(),
    "article": ArticleSinkHandler(),
    "rest_api": RestApiSinkHandler(),
    "notification": NotificationSinkHandler(),
}


async def execute_sink(
    sink_type: str,
    inputs: dict[str, Any],
    db: AsyncSession,
    fallback_workspace_id: UUID | None,
    run_id: UUID,
) -> dict[str, Any]:
    """Top-level entry point: dispatch to the correct handler."""
    handler = _HANDLERS.get(sink_type)
    if handler is None:
        raise ValueError(f"Unknown sink type: {sink_type}")
    return await handler.execute(inputs, db, fallback_workspace_id, run_id)
