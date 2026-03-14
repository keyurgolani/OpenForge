"""
Phase 1 vocabulary and route registration tests.
"""

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
    """All final-domain nouns must exist in the backend vocabulary module."""
    expected = [
        DomainNoun.PROFILE,
        DomainNoun.WORKFLOW,
        DomainNoun.MISSION,
        DomainNoun.TRIGGER,
        DomainNoun.RUN,
        DomainNoun.ARTIFACT,
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
    assert get_label(DomainNoun.PROFILE) == "Profile"
    assert get_label(DomainNoun.PROFILE, plural=True) == "Profiles"
    assert get_route_segment(DomainNoun.MISSION) == "missions"
    assert get_api_prefix(DomainNoun.WORKFLOW) == "/api/v1/workflows"


def test_canonical_domain_routes_register_cleanly():
    """The domain router registry should mount the canonical Phase 1 routes."""
    app = FastAPI()
    register_domain_routers(app)

    mounted_paths = {route.path for route in app.routes}
    for prefix in [
        "/api/v1/profiles/",
        "/api/v1/profiles/{profile_id}",
        "/api/v1/workflows/",
        "/api/v1/missions/",
        "/api/v1/triggers/",
        "/api/v1/runs/",
        "/api/v1/artifacts/",
    ]:
        assert prefix in mounted_paths


def test_no_hand_terminology():
    """The backend vocabulary must reject the legacy Hand term."""
    for label in DOMAIN_LABELS.values():
        assert "hand" not in label.lower()

    for label in DOMAIN_LABELS_PLURAL.values():
        assert "hand" not in label.lower()

    for description in DOMAIN_DESCRIPTIONS.values():
        assert "hand" not in description.lower()


def test_mission_and_profile_descriptions_match_phase1_language():
    """Mission and Profile descriptions should reflect the Phase 1 architecture."""
    mission_description = DOMAIN_DESCRIPTIONS[DomainNoun.MISSION].lower()
    profile_description = DOMAIN_DESCRIPTIONS[DomainNoun.PROFILE].lower()

    assert "packaged" in mission_description
    assert "autonomous" in mission_description
    assert "worker" in profile_description
    assert "capabilities" in profile_description
