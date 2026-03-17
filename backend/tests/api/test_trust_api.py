from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from openforge.domains.policies.router import (
    get_approval_service,
    get_policy_service,
    router as policies_router,
)
from openforge.domains.prompts.router import get_prompt_service, router as prompts_router


class StubPromptService:
    async def list_prompts(self, *_args, **_kwargs):
        row = {
            "id": str(uuid4()),
            "name": "Workspace Agent",
            "slug": "agent_system",
            "description": "Managed system prompt",
            "prompt_type": "system",
            "template": "You are the workspace agent.",
            "template_format": "format_string",
            "variable_schema": {},
            "fallback_behavior": "error",
            "owner_type": "system",
            "owner_id": None,
            "is_system": True,
            "is_template": False,
            "status": "active",
            "version": 1,
            "created_at": None,
            "updated_at": None,
            "created_by": None,
            "updated_by": None,
            "last_used_at": None,
        }
        return [row], 1

    async def preview_prompt(self, prompt_id, version=None, variables=None):
        return {
            "content": f"Rendered {prompt_id}",
            "metadata": {
                "prompt_id": str(prompt_id),
                "prompt_version": version or 1,
                "owner_type": "system",
                "owner_id": None,
                "rendered_at": datetime.now(timezone.utc).isoformat(),
                "variable_keys": sorted((variables or {}).keys()),
            },
            "validation_errors": [],
        }


class StubPolicyService:
    async def list_policies(self, *_args, **_kwargs):
        return [
            {
                "id": str(uuid4()),
                "policy_kind": "tool",
                "name": "System Default Tool Policy",
                "description": "Default trust controls",
                "scope_type": "system",
                "scope_id": None,
                "default_action": "allow",
                "status": "active",
                "rule_count": 1,
                "affected_tools": ["workspace.search", "shell.execute"],
                "approval_requirements": ["shell.execute"],
                "rate_limits": {"shell.execute": {"per_run": 1}},
                "rules": [{"id": "system-shell", "tool_name": "shell.execute", "action": "requires_approval"}],
                "allowed_tools": ["workspace.search"],
                "blocked_tools": [],
                "approval_required_tools": ["shell.execute"],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ], 1

    async def simulate_tool_decision(self, *_args, **_kwargs):
        return {
            "decision": "requires_approval",
            "matched_policy_id": str(uuid4()),
            "matched_rule_id": None,
            "matched_policy_scope": "system",
            "reason_code": "tool_requires_approval",
            "reason_text": "The tool is configured to require approval.",
            "risk_category": "external_mutation",
            "rate_limit_state": {"per_run_remaining": 1},
        }


class StubApprovalService:
    async def list_approval_requests(self, *_args, **_kwargs):
        return [
            {
                "id": str(uuid4()),
                "request_type": "tool_invocation",
                "scope_type": "workspace",
                "scope_id": str(uuid4()),
                "source_run_id": None,
                "requested_action": "shell.execute",
                "tool_name": "shell.execute",
                "reason_code": "tool_requires_approval",
                "reason_text": "The tool is configured to require approval.",
                "risk_category": "external_mutation",
                "payload_preview": {"command": "rm -rf /tmp/example"},
                "matched_policy_id": str(uuid4()),
                "matched_rule_id": str(uuid4()),
                "status": "pending",
                "requested_at": datetime.now(timezone.utc).isoformat(),
                "resolved_at": None,
                "resolved_by": None,
                "resolution_note": None,
            }
        ]

    async def approve_request(self, request_id, note=None):
        return {
            "id": str(request_id),
            "request_type": "tool_invocation",
            "scope_type": "workspace",
            "scope_id": str(uuid4()),
            "source_run_id": None,
            "requested_action": "shell.execute",
            "tool_name": "shell.execute",
            "reason_code": "tool_requires_approval",
            "reason_text": "The tool is configured to require approval.",
            "risk_category": "external_mutation",
            "payload_preview": {"command": "rm -rf /tmp/example"},
            "matched_policy_id": str(uuid4()),
            "matched_rule_id": str(uuid4()),
            "status": "approved",
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "resolved_at": datetime.now(timezone.utc).isoformat(),
            "resolved_by": "operator",
            "resolution_note": note,
        }


def create_client() -> TestClient:
    app = FastAPI()
    app.include_router(prompts_router, prefix="/api/v1/prompts")
    app.include_router(policies_router, prefix="/api/v1/policies")
    app.dependency_overrides[get_prompt_service] = lambda: StubPromptService()
    app.dependency_overrides[get_policy_service] = lambda: StubPolicyService()
    app.dependency_overrides[get_approval_service] = lambda: StubApprovalService()
    return TestClient(app)


def test_prompts_api_lists_managed_prompts():
    client = create_client()

    response = client.get("/api/v1/prompts/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["prompts"][0]["slug"] == "agent_system"


def test_prompts_api_supports_previewing_rendered_output():
    client = create_client()

    response = client.post(
        f"/api/v1/prompts/{uuid4()}/preview",
        json={"version": 2, "variables": {"workspace_name": "OpenForge"}},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["content"].startswith("Rendered")
    assert payload["metadata"]["prompt_version"] == 2


def test_policies_api_supports_simulation():
    client = create_client()

    response = client.post(
        "/api/v1/policies/simulate",
        json={
            "tool_name": "shell.execute",
            "risk_category": "external_mutation",
            "scope_context": {"workspace_id": str(uuid4())},
            "run_id": "run-1",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "requires_approval"
    assert payload["reason_code"] == "tool_requires_approval"


def test_policies_api_exposes_editable_tool_fields():
    client = create_client()

    response = client.get("/api/v1/policies/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["policies"][0]["allowed_tools"] == ["workspace.search"]
    assert payload["policies"][0]["approval_required_tools"] == ["shell.execute"]
    assert payload["policies"][0]["rules"][0]["id"] == "system-shell"


def test_policies_api_exposes_approval_inbox_and_resolution():
    client = create_client()

    listed = client.get("/api/v1/policies/approvals")
    assert listed.status_code == 200
    assert listed.json()["approvals"][0]["matched_policy_id"] is not None
    approval_id = listed.json()["approvals"][0]["id"]

    resolved = client.post(
        f"/api/v1/policies/approvals/{approval_id}/approve",
        json={"resolution_note": "Approved for investigation"},
    )

    assert resolved.status_code == 200
    assert resolved.json()["status"] == "approved"
    assert resolved.json()["matched_rule_id"] is not None
