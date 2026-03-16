"""Deterministic seed data for curated safety policies."""

from __future__ import annotations

from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

SEED_NAMESPACE = uuid5(NAMESPACE_URL, "https://openforge.dev/phase12/safety-policies")


def _seed_uuid(scope_id: str) -> UUID:
    return uuid5(SEED_NAMESPACE, scope_id)


def get_seed_safety_policy_blueprints() -> list[dict[str, Any]]:
    """Return deterministic safety policy blueprints for the product catalog.

    These 5 curated policies cover permissive, standard, strict,
    trust-boundary-focused, and PII-aware safety configurations that
    operators can apply at the system or workspace scope.
    """

    return [
        # ------------------------------------------------------------ 1
        {
            "id": _seed_uuid("safety-policy.permissive-safety"),
            "name": "Permissive Safety",
            "description": (
                "Minimal safety constraints for trusted, internal environments."
            ),
            "scope_type": "system",
            "scope_id": "permissive-safety",
            "rules": [],
            "status": "active",
        },
        # ------------------------------------------------------------ 2
        {
            "id": _seed_uuid("safety-policy.standard-safety"),
            "name": "Standard Safety",
            "description": (
                "Balanced safety policy with trust boundary enforcement."
            ),
            "scope_type": "system",
            "scope_id": "standard-safety",
            "rules": [
                {
                    "id": "trust-boundary",
                    "rule_type": "trust_boundary",
                    "reason_text": "Wrap untrusted context before prompt insertion.",
                },
            ],
            "status": "active",
        },
        # ------------------------------------------------------------ 3
        {
            "id": _seed_uuid("safety-policy.strict-safety"),
            "name": "Strict Safety",
            "description": (
                "Compliance-grade safety policy."
            ),
            "scope_type": "system",
            "scope_id": "strict-safety",
            "rules": [
                {
                    "id": "trust-boundary",
                    "rule_type": "trust_boundary",
                    "reason_text": "Wrap untrusted context before prompt insertion.",
                },
                {
                    "id": "output-filtering",
                    "rule_type": "output_filtering",
                    "reason_text": "Filter sensitive content from agent outputs.",
                },
                {
                    "id": "input-validation",
                    "rule_type": "input_validation",
                    "reason_text": "Validate and sanitize all user inputs before processing.",
                },
            ],
            "status": "active",
        },
        # ------------------------------------------------------------ 4
        {
            "id": _seed_uuid("safety-policy.trust-boundary-enforced"),
            "name": "Trust Boundary Enforced",
            "description": (
                "Focuses on trust boundary enforcement with strict context isolation."
            ),
            "scope_type": "system",
            "scope_id": "trust-boundary-enforced",
            "rules": [
                {
                    "id": "trust-boundary-strict",
                    "rule_type": "trust_boundary",
                    "reason_text": "Enforce strict trust boundaries on all external content.",
                },
                {
                    "id": "context-isolation",
                    "rule_type": "context_isolation",
                    "reason_text": "Isolate execution context to prevent cross-agent data leakage.",
                },
            ],
            "status": "active",
        },
        # ------------------------------------------------------------ 5
        {
            "id": _seed_uuid("safety-policy.pii-aware"),
            "name": "PII-Aware",
            "description": (
                "Safety policy with PII detection and data classification rules."
            ),
            "scope_type": "system",
            "scope_id": "pii-aware",
            "rules": [
                {
                    "id": "trust-boundary",
                    "rule_type": "trust_boundary",
                    "reason_text": "Wrap untrusted context before prompt insertion.",
                },
                {
                    "id": "pii-detection",
                    "rule_type": "pii_detection",
                    "reason_text": "Detect and redact personally identifiable information.",
                },
                {
                    "id": "data-handling",
                    "rule_type": "data_handling",
                    "reason_text": "Apply data classification and handling rules to agent outputs.",
                },
            ],
            "status": "active",
        },
    ]
