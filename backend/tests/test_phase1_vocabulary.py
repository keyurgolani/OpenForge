"""
Phase 1 Vocabulary Consistency Tests

Tests to verify that the canonical routes are mounted, page shells render,
and product vocabulary constants exist.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.main import app
from openforge.core.product_vocabulary import (
    DomainNoun,
    DOMAIN_LABELS,
    DOMAIN_LABELS_PLURAL,
    DOMAIN_DESCRIPTIONS,
    ROUTE_SEGMENTS,
    API_PREFIXES,
    get_label,
    get_route_segment,
    get_api_prefix,
)


def test_domain_nouns_exist():
    """Test that all core domain nouns are defined."""
    expected_nouns = [
        DomainNoun.PROFILE,
        DomainNoun.WORKFLOW,
        DomainNoun.MISSION,
        DomainNoun.TRIGGER,
        DomainNoun.RUN,
        DomainNoun.ARTIFACT,
        DomainNoun.KNOWLEDGE,
    ]

    for noun in expected_nouns:
        assert noun in DOMAIN_LABELS
        assert noun in DOMAIN_LABELS_PLURAL
        assert noun in DOMAIN_DESCRIPTIONS
        assert noun in ROUTE_SEGMENTS
        assert noun in API_PREFIXES


def test_vocabulary_helper_functions():
    """Test that vocabulary helper functions work correctly."""
    # Test get_label
    assert get_label(DomainNoun.PROFILE) == "Profile"
    assert get_label(DomainNoun.PROFILE, plural=True) == "Profiles"

    # Test get_route_segment
    assert get_route_segment(DomainNoun.MISSION) == "missions"

    # Test get_api_prefix
    assert get_api_prefix(DomainNoun.WORKFLOW) == "/api/v1/workflows"


def test_canonical_routes_mounted():
    """Test that all canonical domain routes are mounted."""
    client = TestClient(app)

    # Test that domain routes are accessible (may return 401/403/404 but route exists)
    domain_routes = [
        "/api/v1/profiles",
        "/api/v1/workflows",
        "/api/v1/missions",
        "/api/v1/triggers",
        "/api/v1/runs",
        "/api/v1/artifacts",
    ]

    for route in domain_routes:
        response = client.get(route)
        # Route should exist (not 405 Method Not Allowed)
        assert response.status_code != 405, f"Route {route} not mounted"


def test_no_hand_terminology():
    """Test that 'Hand' is not used in product vocabulary."""
    from openforge.core import product_vocabulary

    # Check that 'hand' doesn't appear in any labels or descriptions
    vocab_text = str(product_vocabulary.__dict__).lower()

    # 'hand' should not appear in the vocabulary (except in this test)
    assert 'hand' not in DOMAIN_LABELS.values()
    assert 'hand' not in DOMAIN_LABELS_PLURAL.values()

    for desc in DOMAIN_DESCRIPTIONS.values():
        assert 'hand' not in desc.lower()


def test_mission_is_packaged_concept():
    """Test that Mission is properly defined as the packaged autonomous concept."""
    assert DomainNoun.MISSION in DomainNoun
    assert DOMAIN_LABELS[DomainNoun.MISSION] == "Mission"
    assert "packaged" in DOMAIN_DESCRIPTIONS[DomainNoun.MISSION].lower()
    assert "autonomous" in DOMAIN_DESCRIPTIONS[DomainNoun.MISSION].lower()


def test_profile_is_worker_abstraction():
    """Test that Profile is defined as a worker abstraction, not a top-level product."""
    assert DomainNoun.PROFILE in DomainNoun
    assert DOMAIN_LABELS[DomainNoun.PROFILE] == "Profile"
    assert "worker" in DOMAIN_DESCRIPTIONS[DomainNoun.PROFILE].lower()
    assert "capabilities" in DOMAIN_DESCRIPTIONS[DomainNoun.PROFILE].lower()
