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
    GRAPH = "graph"
    # Phase 12 curated catalog
    CATALOG = "catalog"
    # Phase 7 profile building blocks
    CAPABILITY_BUNDLE = "capability_bundle"
    MODEL_POLICY = "model_policy"
    MEMORY_POLICY = "memory_policy"
    OUTPUT_CONTRACT = "output_contract"
    # Phase 13 observability and evaluation
    OBSERVABILITY = "observability"
    EVALUATION = "evaluation"


DOMAIN_LABELS: dict[DomainNoun, str] = {
    DomainNoun.PROFILE: "Profile",
    DomainNoun.WORKFLOW: "Workflow",
    DomainNoun.MISSION: "Mission",
    DomainNoun.TRIGGER: "Trigger",
    DomainNoun.RUN: "Run",
    DomainNoun.ARTIFACT: "Artifact",
    DomainNoun.KNOWLEDGE: "Knowledge",
    DomainNoun.GRAPH: "Graph",
    DomainNoun.CATALOG: "Catalog",
    DomainNoun.CAPABILITY_BUNDLE: "Capability Bundle",
    DomainNoun.MODEL_POLICY: "Model Policy",
    DomainNoun.MEMORY_POLICY: "Memory Policy",
    DomainNoun.OUTPUT_CONTRACT: "Output Contract",
    DomainNoun.OBSERVABILITY: "Observability",
    DomainNoun.EVALUATION: "Evaluation",
}

DOMAIN_LABELS_PLURAL: dict[DomainNoun, str] = {
    DomainNoun.PROFILE: "Profiles",
    DomainNoun.WORKFLOW: "Workflows",
    DomainNoun.MISSION: "Missions",
    DomainNoun.TRIGGER: "Triggers",
    DomainNoun.RUN: "Runs",
    DomainNoun.ARTIFACT: "Artifacts",
    DomainNoun.KNOWLEDGE: "Knowledge",
    DomainNoun.GRAPH: "Graphs",
    DomainNoun.CATALOG: "Catalog",
    DomainNoun.CAPABILITY_BUNDLE: "Capability Bundles",
    DomainNoun.MODEL_POLICY: "Model Policies",
    DomainNoun.MEMORY_POLICY: "Memory Policies",
    DomainNoun.OUTPUT_CONTRACT: "Output Contracts",
    DomainNoun.OBSERVABILITY: "Observability",
    DomainNoun.EVALUATION: "Evaluation",
}

DOMAIN_DESCRIPTIONS: dict[DomainNoun, str] = {
    DomainNoun.PROFILE: "Profiles define worker capabilities, prompts, and behaviors.",
    DomainNoun.WORKFLOW: "Workflows are composable execution graphs.",
    DomainNoun.MISSION: "Missions are packaged autonomous units built from workflows and profiles.",
    DomainNoun.TRIGGER: "Triggers initiate workflow or mission execution.",
    DomainNoun.RUN: "Runs are durable execution instances.",
    DomainNoun.ARTIFACT: "Artifacts are persistent outputs produced by runs.",
    DomainNoun.KNOWLEDGE: "Knowledge is user-provided context and source material.",
    DomainNoun.GRAPH: "Graph represents the knowledge graph of entities and relationships.",
    DomainNoun.CATALOG: "Catalog is the curated library of profiles, workflows, and missions.",
    DomainNoun.CAPABILITY_BUNDLE: "Capability bundles are composable collections of agent capabilities.",
    DomainNoun.MODEL_POLICY: "Model policies define LLM selection and usage constraints.",
    DomainNoun.MEMORY_POLICY: "Memory policies define context assembly and history management.",
    DomainNoun.OUTPUT_CONTRACT: "Output contracts define expected output format and behavior.",
    DomainNoun.OBSERVABILITY: "Observability surfaces usage, cost, failure, and telemetry data.",
    DomainNoun.EVALUATION: "Evaluation runs benchmark scenarios and tracks quality baselines.",
}

ROUTE_SEGMENTS: dict[DomainNoun, str] = {
    noun: f"{noun.value}s"
    if noun not in (DomainNoun.KNOWLEDGE, DomainNoun.GRAPH, DomainNoun.CATALOG, DomainNoun.CAPABILITY_BUNDLE, DomainNoun.MODEL_POLICY, DomainNoun.MEMORY_POLICY, DomainNoun.OUTPUT_CONTRACT, DomainNoun.OBSERVABILITY, DomainNoun.EVALUATION)
    else noun.value
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
