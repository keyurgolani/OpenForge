"""
Canonical product vocabulary for the backend.
"""

from __future__ import annotations

from enum import StrEnum


class DomainNoun(StrEnum):
    AGENT = "agent"
    AUTOMATION = "automation"
    RUN = "run"
    OUTPUT = "output"
    SINK = "sink"
    KNOWLEDGE = "knowledge"
    DEPLOYMENT = "deployment"


DOMAIN_LABELS: dict[DomainNoun, str] = {
    DomainNoun.AGENT: "Agent",
    DomainNoun.AUTOMATION: "Automation",
    DomainNoun.RUN: "Run",
    DomainNoun.OUTPUT: "Output",
    DomainNoun.SINK: "Sink",
    DomainNoun.KNOWLEDGE: "Knowledge",
    DomainNoun.DEPLOYMENT: "Deployment",
}

DOMAIN_LABELS_PLURAL: dict[DomainNoun, str] = {
    DomainNoun.AGENT: "Agents",
    DomainNoun.AUTOMATION: "Automations",
    DomainNoun.RUN: "Runs",
    DomainNoun.OUTPUT: "Outputs",
    DomainNoun.SINK: "Sinks",
    DomainNoun.KNOWLEDGE: "Knowledge",
    DomainNoun.DEPLOYMENT: "Deployments",
}

DOMAIN_DESCRIPTIONS: dict[DomainNoun, str] = {
    DomainNoun.AGENT: "Agents are workspace-agnostic AI assistants with blueprint-defined behavior.",
    DomainNoun.AUTOMATION: "Automations are agent-powered background tasks with triggers and budgets.",
    DomainNoun.RUN: "Runs are durable execution instances.",
    DomainNoun.OUTPUT: "Outputs are persistent results produced by runs.",
    DomainNoun.SINK: "Sinks define what happens with agent output values in automations.",
    DomainNoun.KNOWLEDGE: "Knowledge is user-provided context and source material.",
    DomainNoun.DEPLOYMENT: "Deployments are live instances of automations with baked-in inputs.",
}

ROUTE_SEGMENTS: dict[DomainNoun, str] = {
    noun: f"{noun.value}s" if noun != DomainNoun.KNOWLEDGE else noun.value
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
