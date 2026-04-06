"""Tests for the request logging middleware."""

import logging
import uuid

import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from openforge.middleware.request_logging import RequestLoggingMiddleware


def _ok_handler(request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})


def _error_handler(request: Request) -> JSONResponse:
    return JSONResponse({"detail": "not found"}, status_code=404)


def _crash_handler(request: Request):
    raise RuntimeError("boom")


def _make_app() -> Starlette:
    app = Starlette(
        routes=[
            Route("/api/test", _ok_handler),
            Route("/api/health", _ok_handler),
            Route("/api/missing", _error_handler),
            Route("/api/crash", _crash_handler),
            Route("/assets/logo.png", _ok_handler),
        ],
    )
    app.add_middleware(RequestLoggingMiddleware)
    return app


@pytest.fixture
def client():
    return TestClient(_make_app(), raise_server_exceptions=False)


def test_logs_successful_request(client, caplog):
    with caplog.at_level(logging.INFO, logger="openforge.http"):
        resp = client.get("/api/test")

    assert resp.status_code == 200
    assert any("GET /api/test" in r.message and "200" in r.message for r in caplog.records)


def test_sets_request_id_header(client):
    resp = client.get("/api/test")
    assert "x-request-id" in resp.headers
    assert len(resp.headers["x-request-id"]) > 0


def test_propagates_incoming_request_id(client, caplog):
    custom_id = "test-req-123"
    with caplog.at_level(logging.INFO, logger="openforge.http"):
        resp = client.get("/api/test", headers={"x-request-id": custom_id})

    assert resp.headers["x-request-id"] == custom_id
    assert any(custom_id in r.message for r in caplog.records)


def test_skips_health_check(client, caplog):
    with caplog.at_level(logging.DEBUG, logger="openforge.http"):
        resp = client.get("/api/health")

    assert resp.status_code == 200
    assert not any("/api/health" in r.message for r in caplog.records)


def test_logs_4xx_as_warning(client, caplog):
    with caplog.at_level(logging.WARNING, logger="openforge.http"):
        resp = client.get("/api/missing")

    assert resp.status_code == 404
    assert any(r.levelno == logging.WARNING for r in caplog.records if "404" in r.message)


def test_logs_asset_paths_at_debug(client, caplog):
    with caplog.at_level(logging.DEBUG, logger="openforge.http"):
        client.get("/assets/logo.png")

    asset_logs = [r for r in caplog.records if "/assets/" in r.message]
    assert all(r.levelno == logging.DEBUG for r in asset_logs)


def test_includes_duration_ms(client, caplog):
    with caplog.at_level(logging.INFO, logger="openforge.http"):
        client.get("/api/test")

    assert any("ms)" in r.message for r in caplog.records)
