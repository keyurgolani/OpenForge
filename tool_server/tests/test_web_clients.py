"""Unit tests for Crawl4AIClient and PinchTabClient."""

import pytest
import httpx

from tools.web.clients import (
    Crawl4AIClient,
    Crawl4AIConfig,
    PinchTabClient,
    PinchTabConfig,
)


# ── Helpers ──


class _MockTransport(httpx.AsyncBaseTransport):
    """Fake transport that returns a canned response."""

    def __init__(self, handler):
        self._handler = handler

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        return self._handler(request)


def _make_crawl4ai(handler, **cfg_kw) -> Crawl4AIClient:
    """Build a Crawl4AIClient whose internal httpx calls go through *handler*."""
    config = Crawl4AIConfig(base_url="http://test-crawl4ai:11235", **cfg_kw)
    client = Crawl4AIClient(config)
    # Monkey-patch so every AsyncClient uses our transport
    _orig_init = httpx.AsyncClient.__init__

    def _patched_init(self_client, **kwargs):
        kwargs["transport"] = _MockTransport(handler)
        _orig_init(self_client, **kwargs)

    httpx.AsyncClient.__init__ = _patched_init  # type: ignore[assignment]
    return client


def _make_pinchtab(handler, **cfg_kw) -> PinchTabClient:
    """Build a PinchTabClient whose internal httpx calls go through *handler*."""
    config = PinchTabConfig(base_url="http://test-pinchtab:3000", **cfg_kw)
    client = PinchTabClient(config)
    _orig_init = httpx.AsyncClient.__init__

    def _patched_init(self_client, **kwargs):
        kwargs["transport"] = _MockTransport(handler)
        _orig_init(self_client, **kwargs)

    httpx.AsyncClient.__init__ = _patched_init  # type: ignore[assignment]
    return client


@pytest.fixture(autouse=True)
def _restore_httpx_init():
    """Ensure httpx.AsyncClient.__init__ is restored after each test."""
    orig = httpx.AsyncClient.__init__
    yield
    httpx.AsyncClient.__init__ = orig  # type: ignore[assignment]


# ── Crawl4AIClient tests ──


@pytest.mark.asyncio
async def test_crawl4ai_health_check_ok():
    def handler(request):
        assert "/health" in str(request.url)
        return httpx.Response(200, json={"status": "ok"})

    client = _make_crawl4ai(handler)
    assert await client.health_check() is True


@pytest.mark.asyncio
async def test_crawl4ai_health_check_fail():
    def handler(request):
        return httpx.Response(500)

    client = _make_crawl4ai(handler)
    assert await client.health_check() is False


@pytest.mark.asyncio
async def test_crawl4ai_crawl_success():
    def handler(request):
        return httpx.Response(200, json={
            "success": True,
            "result": {
                "markdown": "# Hello World",
                "metadata": {"title": "Test"},
            },
        })

    client = _make_crawl4ai(handler)
    result = await client.crawl("https://example.com")
    assert result["success"] is True
    assert result["markdown"] == "# Hello World"
    assert result["metadata"]["title"] == "Test"


@pytest.mark.asyncio
async def test_crawl4ai_crawl_truncates_content():
    long_content = "x" * 100
    def handler(request):
        return httpx.Response(200, json={
            "success": True,
            "result": {"markdown": long_content, "metadata": {}},
        })

    client = _make_crawl4ai(handler, max_content_chars=50)
    result = await client.crawl("https://example.com")
    assert len(result["markdown"]) == 50


@pytest.mark.asyncio
async def test_crawl4ai_crawl_raises_on_http_error():
    def handler(request):
        return httpx.Response(500, json={"error": "internal"})

    client = _make_crawl4ai(handler)
    with pytest.raises(httpx.HTTPStatusError):
        await client.crawl("https://example.com")


# ── PinchTabClient tests ──


@pytest.mark.asyncio
async def test_pinchtab_health_check_ok():
    def handler(request):
        return httpx.Response(200, json={"status": "ok"})

    client = _make_pinchtab(handler)
    assert await client.health_check() is True


@pytest.mark.asyncio
async def test_pinchtab_health_check_fail():
    def handler(request):
        return httpx.Response(503)

    client = _make_pinchtab(handler)
    assert await client.health_check() is False


@pytest.mark.asyncio
async def test_pinchtab_navigate():
    def handler(request):
        assert "/api/navigate" in str(request.url)
        return httpx.Response(200, json={"tab_id": "t1", "url": "https://example.com", "title": "Example"})

    client = _make_pinchtab(handler)
    result = await client.navigate("https://example.com")
    assert result["tab_id"] == "t1"
    assert result["title"] == "Example"


@pytest.mark.asyncio
async def test_pinchtab_snapshot_default():
    def handler(request):
        assert "/api/snapshot" in str(request.url)
        return httpx.Response(200, json={"elements": [{"ref": "e1"}]})

    client = _make_pinchtab(handler)
    result = await client.snapshot()
    assert result["elements"][0]["ref"] == "e1"


@pytest.mark.asyncio
async def test_pinchtab_snapshot_with_tab_id():
    captured = {}
    def handler(request):
        import json as _json
        captured["body"] = _json.loads(request.content)
        return httpx.Response(200, json={"elements": []})

    client = _make_pinchtab(handler)
    await client.snapshot(tab_id="t2")
    assert captured["body"]["tab_id"] == "t2"


@pytest.mark.asyncio
async def test_pinchtab_click():
    def handler(request):
        assert "/api/click" in str(request.url)
        return httpx.Response(200, json={"success": True})

    client = _make_pinchtab(handler)
    result = await client.click("e3")
    assert result["success"] is True


@pytest.mark.asyncio
async def test_pinchtab_type_text():
    captured = {}
    def handler(request):
        import json as _json
        captured["body"] = _json.loads(request.content)
        return httpx.Response(200, json={"success": True})

    client = _make_pinchtab(handler)
    await client.type_text("e5", "hello")
    assert captured["body"] == {"ref": "e5", "text": "hello"}


@pytest.mark.asyncio
async def test_pinchtab_fill_form():
    captured = {}
    def handler(request):
        import json as _json
        captured["body"] = _json.loads(request.content)
        return httpx.Response(200, json={"success": True})

    client = _make_pinchtab(handler)
    await client.fill_form({"user": "alice", "pass": "secret"})
    assert captured["body"]["fields"] == {"user": "alice", "pass": "secret"}


@pytest.mark.asyncio
async def test_pinchtab_screenshot_returns_bytes():
    png_bytes = b"\x89PNG\r\n\x1a\nfakedata"
    def handler(request):
        assert "/api/screenshot" in str(request.url)
        return httpx.Response(200, content=png_bytes, headers={"content-type": "image/png"})

    client = _make_pinchtab(handler)
    result = await client.screenshot(tab_id="t1", full_page=True)
    assert result == png_bytes


@pytest.mark.asyncio
async def test_pinchtab_evaluate():
    def handler(request):
        return httpx.Response(200, json={"result": "My Title"})

    client = _make_pinchtab(handler)
    result = await client.evaluate("document.title")
    assert result["result"] == "My Title"


@pytest.mark.asyncio
async def test_pinchtab_list_tabs_list_response():
    tabs = [{"tab_id": "t1", "url": "https://a.com", "title": "A"}]
    def handler(request):
        return httpx.Response(200, json=tabs)

    client = _make_pinchtab(handler)
    result = await client.list_tabs()
    assert result == tabs


@pytest.mark.asyncio
async def test_pinchtab_list_tabs_dict_response():
    tabs = [{"tab_id": "t1", "url": "https://a.com", "title": "A"}]
    def handler(request):
        return httpx.Response(200, json={"tabs": tabs})

    client = _make_pinchtab(handler)
    result = await client.list_tabs()
    assert result == tabs


@pytest.mark.asyncio
async def test_pinchtab_close_tab():
    def handler(request):
        return httpx.Response(200, json={"success": True})

    client = _make_pinchtab(handler)
    result = await client.close_tab("t1")
    assert result["success"] is True


@pytest.mark.asyncio
async def test_pinchtab_raises_on_http_error():
    def handler(request):
        return httpx.Response(404, json={"error": "not found"})

    client = _make_pinchtab(handler)
    with pytest.raises(httpx.HTTPStatusError):
        await client.navigate("https://example.com")
