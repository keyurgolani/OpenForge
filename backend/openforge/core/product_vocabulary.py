"""
Canonical product vocabulary for the backend.
"""

from __future__ import annotations

from enum import StrEnum


class DomainNoun(StrEnum):
    PROFILE = "profile"
    WORKFLOW = "workflow"
    MISSION = "mission"
    TRIGGER = "trigger"
    RUN = "run"
    ARTIFACT = "artifact"
    KNOWLEDGE = "knowledge"


DOMAIN_LABELS: dict[DomainNoun, str] = {
    DomainNoun.PROFILE: "Profile",
    DomainNoun.WORKFLOW: "Workflow",
    DomainNoun.MISSION: "Mission",
    DomainNoun.TRIGGER: "Trigger",
    DomainNoun.RUN: "Run",
    DomainNoun.ARTIFACT: "Artifact",
    DomainNoun.KNOWLEDGE: "Knowledge",
}

DOMAIN_LABELS_PLURAL: dict[DomainNoun, str] = {
    DomainNoun.PROFILE: "Profiles",
    DomainNoun.WORKFLOW: "Workflows",
    DomainNoun.MISSION: "Missions",
    DomainNoun.TRIGGER: "Triggers",
    DomainNoun.RUN: "Runs",
    DomainNoun.ARTIFACT: "Artifacts",
    DomainNoun.KNOWLEDGE: "Knowledge",
}

DOMAIN_DESCRIPTIONS: dict[DomainNoun, str] = {
    DomainNoun.PROFILE: "Profiles define worker capabilities, prompts, and behaviors.",
    DomainNoun.WORKFLOW: "Workflows are composable execution graphs.",
    DomainNoun.MISSION: "Missions are packaged autonomous units built from workflows and profiles.",
    DomainNoun.TRIGGER: "Triggers initiate workflow or mission execution.",
    DomainNoun.RUN: "Runs are durable execution instances.",
    DomainNoun.ARTIFACT: "Artifacts are persistent outputs produced by runs.",
    DomainNoun.KNOWLEDGE: "Knowledge is user-provided context and source material.",
}

ROUTE_SEGMENTS: dict[DomainNoun, str] = {
    noun: f"{noun.value}s" if noun is not DomainNoun.KNOWLEDGE else "knowledge"
    for noun in DomainNoun
}

API_PREFIXES: dict[DomainNoun, str] = {
    noun: f"/api/v1/{segment}"
    for noun, segment in ROUTE_SEGMENTS.items()
}


def get_label(noun: DomainNoun, *, plural: bool = False) -> str:
    return DOMAIN_LABELS_PLURAL[noun] if plural else DOMAIN_LABELS[noun]


def get_route_segment(noun: DomainNoun) -> str:
    return ROUTE_SEGMENTS[noun]


def get_api_prefix(noun: DomainNoun) -> str:
    return API_PREFIXES[noun]


__all__ = [
    "API_PREFIXES",
    "DOMAIN_DESCRIPTIONS",
    "DOMAIN_LABELS",
    "DOMAIN_LABELS_PLURAL",
    "ROUTE_SEGMENTS",
    "DomainNoun",
    "get_api_prefix",
    "get_label",
    "get_route_segment",
]
