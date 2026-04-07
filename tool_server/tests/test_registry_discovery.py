"""Verify all 16 web-related tools are registered and discoverable.

Validates Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
"""

from registry import ToolRegistry


def _build_registry() -> ToolRegistry:
    """Create a fresh registry with auto-discovered tools."""
    reg = ToolRegistry()
    reg.auto_discover("tools")
    return reg


def _tools_by_category(reg: ToolRegistry) -> dict[str, list[str]]:
    """Group registered tool IDs by category."""
    by_cat: dict[str, list[str]] = {}
    for meta in reg.list_tools():
        cat = meta["category"]
        by_cat.setdefault(cat, []).append(meta["id"])
    return by_cat


class TestToolRegistryDiscovery:
    """Requirement 1.6: auto-discover each category via its __init__.py TOOLS list."""

    def test_web_category_has_3_tools(self):
        """Requirement 1.2: web category registers exactly 3 tools."""
        by_cat = _tools_by_category(_build_registry())
        assert "web" in by_cat, "web category not discovered"
        assert sorted(by_cat["web"]) == [
            "web.read_page",
            "web.read_pages",
            "web.screenshot",
        ]

    def test_search_category_has_3_tools(self):
        """Requirement 1.3: search category registers exactly 3 tools."""
        by_cat = _tools_by_category(_build_registry())
        assert "search" in by_cat, "search category not discovered"
        assert sorted(by_cat["search"]) == [
            "search.images",
            "search.news",
            "search.web",
        ]

    def test_browser_category_has_8_tools(self):
        """Requirement 1.4: browser category registers exactly 8 tools."""
        by_cat = _tools_by_category(_build_registry())
        assert "browser" in by_cat, "browser category not discovered"
        assert sorted(by_cat["browser"]) == [
            "browser.click",
            "browser.close_tab",
            "browser.evaluate",
            "browser.fill_form",
            "browser.list_tabs",
            "browser.open",
            "browser.snapshot",
            "browser.type",
        ]

    def test_http_category_has_exactly_2_tools(self):
        """Requirement 1.5: http category registers exactly 2 tools (no old search/fetch)."""
        by_cat = _tools_by_category(_build_registry())
        assert "http" in by_cat, "http category not discovered"
        assert sorted(by_cat["http"]) == ["http.get", "http.post"]

    def test_all_four_web_categories_discovered(self):
        """Requirement 1.1: four web-related categories exist."""
        by_cat = _tools_by_category(_build_registry())
        for cat in ("web", "search", "browser", "http"):
            assert cat in by_cat, f"category '{cat}' not discovered"

    def test_total_16_web_related_tools(self):
        """Requirements 1.2-1.5: total of 16 web-related tools across 4 categories."""
        by_cat = _tools_by_category(_build_registry())
        web_cats = ("web", "search", "browser", "http")
        total = sum(len(by_cat.get(c, [])) for c in web_cats)
        assert total == 16, f"Expected 16 web-related tools, got {total}"

    def test_manifests_loaded_for_all_web_tools(self):
        """Requirement 1.7: manifest.yaml loaded for each web-related category."""
        reg = _build_registry()
        expected_tools = [
            "web.read_page", "web.read_pages", "web.screenshot",
            "search.web", "search.news", "search.images",
            "browser.open", "browser.snapshot", "browser.click",
            "browser.type", "browser.fill_form", "browser.evaluate",
            "browser.list_tabs", "browser.close_tab",
            "http.get", "http.post",
        ]
        for tool_id in expected_tools:
            manifest = reg.get_tool_manifest(tool_id)
            assert manifest is not None, f"No manifest for {tool_id}"
            assert "risk_category" in manifest, f"No risk_category in manifest for {tool_id}"
