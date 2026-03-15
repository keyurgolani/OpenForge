from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
API_ROUTER = PROJECT_ROOT / "backend" / "openforge" / "api" / "router.py"
DOMAIN_REGISTRY = PROJECT_ROOT / "backend" / "openforge" / "domains" / "router_registry.py"
KNOWLEDGE_ROUTER = PROJECT_ROOT / "backend" / "openforge" / "domains" / "knowledge" / "router.py"
KNOWLEDGE_SERVICE = PROJECT_ROOT / "backend" / "openforge" / "domains" / "knowledge" / "service.py"


def test_domain_registry_owns_retrieval_prompt_policy_and_knowledge_routes() -> None:
    content = DOMAIN_REGISTRY.read_text(encoding="utf-8")

    expected_fragments = [
        "from .knowledge.router import",
        "from .prompts.router import",
        "from .policies.router import",
        "from .retrieval.router import",
        'prefix="/api/v1/workspaces"',
        'prefix="/api/v1/prompts"',
        'prefix="/api/v1/policies"',
        'prefix="/api/v1/retrieval"',
    ]

    for fragment in expected_fragments:
        assert fragment in content, f"Domain router registry is missing expected ownership fragment: {fragment}"


def test_transitional_api_router_no_longer_mounts_domain_owned_routes() -> None:
    content = API_ROUTER.read_text(encoding="utf-8")

    forbidden_fragments = [
        "knowledge.router",
        "knowledge.knowledge_global_router",
        "knowledge_upload.router",
        "prompts_router",
        "policies_router",
        "retrieval_router",
    ]

    for fragment in forbidden_fragments:
        assert fragment not in content, f"Transitional API router still mounts domain-owned surface: {fragment}"


def test_knowledge_domain_router_is_no_longer_a_stub() -> None:
    content = KNOWLEDGE_ROUTER.read_text(encoding="utf-8")

    assert "skeleton" not in content.lower()
    assert "transitional continuity" not in content.lower()
    assert "include_router(" in content


def test_knowledge_domain_service_delegates_to_real_service_layer() -> None:
    content = KNOWLEDGE_SERVICE.read_text(encoding="utf-8")

    assert "knowledge_processing_service" in content or "knowledge_service" in content
    assert "return [], 0" not in content
    assert "return None" not in content
    assert "return False" not in content
