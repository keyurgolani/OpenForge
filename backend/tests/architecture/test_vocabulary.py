"""
Core domain vocabulary and route registration tests.
"""

from pathlib import Path

from fastapi import FastAPI

from openforge.core.product_vocabulary import (
    API_PREFIXES,
    DOMAIN_DESCRIPTIONS,
    DOMAIN_LABELS,
    DOMAIN_LABELS_PLURAL,
    ROUTE_SEGMENTS,
    DomainNoun,
    get_api_prefix,
    get_label,
    get_route_segment,
)
from openforge.domains.router_registry import register_domain_routers


def test_domain_nouns_exist():
    """All current domain nouns must exist in the backend vocabulary module."""
    expected = [
        DomainNoun.AGENT,
        DomainNoun.AUTOMATION,
        DomainNoun.RUN,
        DomainNoun.OUTPUT,
        DomainNoun.KNOWLEDGE,
    ]

    for noun in expected:
        assert noun in DOMAIN_LABELS
        assert noun in DOMAIN_LABELS_PLURAL
        assert noun in DOMAIN_DESCRIPTIONS
        assert noun in ROUTE_SEGMENTS
        assert noun in API_PREFIXES


def test_vocabulary_helper_functions():
    """Helper functions should return the canonical values."""
    assert get_label(DomainNoun.AGENT) == "Agent"
    assert get_label(DomainNoun.AGENT, plural=True) == "Agents"
    assert get_route_segment(DomainNoun.AUTOMATION) == "automations"
    assert get_api_prefix(DomainNoun.OUTPUT) == "/api/v1/outputs"


def test_canonical_domain_routes_register_cleanly():
    """The domain router registry should mount the canonical domain routes."""
    app = FastAPI()
    register_domain_routers(app)

    mounted_paths = {route.path for route in app.routes}
    for prefix in [
        "/api/v1/agents",
        "/api/v1/automations",
        "/api/v1/runs",
        "/api/v1/outputs",
    ]:
        assert any(prefix in path for path in mounted_paths), f"Expected route prefix '{prefix}' not found in mounted paths"


def test_no_hand_terminology():
    """The backend vocabulary must reject the legacy Hand term."""
    for label in DOMAIN_LABELS.values():
        assert "hand" not in label.lower()

    for label in DOMAIN_LABELS_PLURAL.values():
        assert "hand" not in label.lower()

    for description in DOMAIN_DESCRIPTIONS.values():
        assert "hand" not in description.lower()


def test_output_description_matches_domain_language():
    """Output description should reflect the domain architecture."""
    output_description = DOMAIN_DESCRIPTIONS[DomainNoun.OUTPUT].lower()
    assert "output" in output_description or "result" in output_description


def test_public_chat_and_delegation_surfaces_do_not_use_subagent_term():
    """Active public surfaces should use delegation language instead of subagent terminology."""
    project_root = Path(__file__).resolve().parents[3]
    public_surface_files = [
        project_root / "backend" / "openforge" / "schemas" / "conversation.py",
        project_root / "backend" / "openforge" / "api" / "conversations.py",
        project_root / "frontend" / "src" / "lib" / "api.ts",
        project_root / "frontend" / "src" / "pages" / "AgentChatPage.tsx",
        project_root / "frontend" / "src" / "hooks" / "useStreamingChat.ts",
        project_root / "frontend" / "src" / "components" / "shared" / "TimelineBadge.tsx",
    ]

    for surface_file in public_surface_files:
        content = surface_file.read_text(encoding="utf-8").lower()
        assert "subagent" not in content, f"Legacy subagent terminology leaked into public surface: {surface_file}"
