"""Policy domain service."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import ApprovalPolicyModel, SafetyPolicyModel, ToolPolicyModel

from .evaluator import policy_evaluator
from .types import PolicyScopeType, ToolRiskCategory


class PolicyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_policies(self, skip: int = 0, limit: int = 100) -> tuple[list[dict[str, Any]], int]:
        policies = []
        policies.extend(await self._list_kind("tool", ToolPolicyModel))
        policies.extend(await self._list_kind("safety", SafetyPolicyModel))
        policies.extend(await self._list_kind("approval", ApprovalPolicyModel))
        policies.sort(key=lambda item: item.get("updated_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        sliced = policies[skip: skip + limit]
        return sliced, len(policies)

    async def get_policy(self, policy_id: UUID) -> dict[str, Any] | None:
        for kind, model in (("tool", ToolPolicyModel), ("safety", SafetyPolicyModel), ("approval", ApprovalPolicyModel)):
            row = await self.db.get(model, policy_id)
            if row is not None:
                return self._serialize_policy(kind, row)
        return None

    async def update_tool_policy(self, policy_id: UUID, payload: dict[str, Any]) -> dict[str, Any] | None:
        row = await self.db.get(ToolPolicyModel, policy_id)
        if row is None:
            return None
        for key, value in payload.items():
            setattr(row, key, value)
        await self.db.commit()
        await self.db.refresh(row)
        return self._serialize_policy("tool", row)

    async def simulate_tool_decision(
        self,
        *,
        tool_name: str,
        risk_category: ToolRiskCategory,
        scope_context: dict[str, str | None],
        run_id: str | None,
    ) -> dict[str, Any]:
        policies = await self.load_active_tool_policies()
        result = policy_evaluator.evaluate_tool_access(
            tool_name=tool_name,
            risk_category=risk_category,
            policies=policies,
            scope_context=scope_context,
            run_id=run_id,
        )
        return result.model_dump()

    async def load_active_tool_policies(self) -> list[dict[str, Any]]:
        rows = (
            await self.db.execute(
                select(ToolPolicyModel).where(ToolPolicyModel.status == "active")
            )
        ).scalars().all()
        return [self._serialize_tool_policy(row) for row in rows]

    async def _list_kind(self, kind: str, model) -> list[dict[str, Any]]:
        rows = (await self.db.execute(select(model))).scalars().all()
        return [self._serialize_policy(kind, row) for row in rows]

    def _serialize_policy(self, kind: str, row) -> dict[str, Any]:
        if kind == "tool":
            return self._serialize_tool_policy(row)
        if kind == "safety":
            return {
                "id": row.id,
                "policy_kind": "safety",
                "name": row.name,
                "description": row.description,
                "scope_type": row.scope_type,
                "scope_id": row.scope_id,
                "default_action": None,
                "status": row.status,
                "rule_count": len(row.rules or []),
                "affected_tools": [],
                "approval_requirements": [],
                "rate_limits": {},
                "updated_at": row.updated_at,
            }
        return {
            "id": row.id,
            "policy_kind": "approval",
            "name": row.name,
            "description": row.description,
            "scope_type": row.scope_type,
            "scope_id": row.scope_id,
            "default_action": row.default_action,
            "status": row.status,
            "rule_count": len(row.rules or []),
            "affected_tools": [],
            "approval_requirements": [],
            "rate_limits": {},
            "updated_at": row.updated_at,
        }

    def _serialize_tool_policy(self, row: ToolPolicyModel) -> dict[str, Any]:
        affected_tools = sorted(set((row.allowed_tools or []) + (row.blocked_tools or []) + (row.approval_required_tools or [])))
        return {
            "id": row.id,
            "policy_kind": "tool",
            "name": row.name,
            "description": row.description,
            "scope_type": row.scope_type,
            "scope_id": row.scope_id,
            "default_action": row.default_action,
            "status": row.status,
            "rule_count": len(row.rules or []),
            "affected_tools": affected_tools,
            "approval_requirements": row.approval_required_tools or [],
            "rate_limits": row.rate_limits or {},
            "updated_at": row.updated_at,
            "rules": row.rules or [],
            "allowed_tools": row.allowed_tools or [],
            "blocked_tools": row.blocked_tools or [],
            "approval_required_tools": row.approval_required_tools or [],
        }


    async def create_tool_policy(self, payload: dict) -> dict:
        policy = ToolPolicyModel(**payload)
        self.db.add(policy)
        await self.db.commit()
        await self.db.refresh(policy)
        return self._serialize_policy("tool", policy)

    async def delete_tool_policy(self, policy_id) -> bool:
        pid = UUID(policy_id) if isinstance(policy_id, str) else policy_id
        row = await self.db.get(ToolPolicyModel, pid)
        if row is None:
            return False
        await self.db.delete(row)
        await self.db.commit()
        return True

    async def create_safety_policy(self, payload: dict) -> dict:
        policy = SafetyPolicyModel(**payload)
        self.db.add(policy)
        await self.db.commit()
        await self.db.refresh(policy)
        return self._serialize_policy("safety", policy)

    async def update_safety_policy(self, policy_id, payload: dict) -> dict | None:
        pid = UUID(policy_id) if isinstance(policy_id, str) else policy_id
        row = await self.db.get(SafetyPolicyModel, pid)
        if row is None:
            return None
        for key, value in payload.items():
            setattr(row, key, value)
        await self.db.commit()
        await self.db.refresh(row)
        return self._serialize_policy("safety", row)

    async def delete_safety_policy(self, policy_id) -> bool:
        pid = UUID(policy_id) if isinstance(policy_id, str) else policy_id
        row = await self.db.get(SafetyPolicyModel, pid)
        if row is None:
            return False
        await self.db.delete(row)
        await self.db.commit()
        return True


async def seed_default_policies(db: AsyncSession) -> None:
    existing = await db.scalar(select(func.count()).select_from(ToolPolicyModel))
    if existing:
        return

    db.add(
        ToolPolicyModel(
            name="System Default Tool Policy",
            description="Default operator-facing tool controls for the current Phase 3 trust foundation.",
            scope_type=PolicyScopeType.SYSTEM.value,
            scope_id=None,
            default_action="allow",
            rules=[],
            rate_limits={
                "shell.execute": {"per_run": 2},
                "shell.execute_python": {"per_run": 2},
                "http.post": {"per_run": 2},
                "workspace.delete_knowledge": {"per_run": 1},
                "filesystem.delete_file": {"per_run": 1},
            },
            allowed_tools=[],
            blocked_tools=[],
            approval_required_tools=[
                "shell.execute",
                "shell.execute_python",
                "http.post",
                "agent.invoke",
                "workspace.delete_knowledge",
                "filesystem.delete_file",
                "memory.forget",
                "skills.remove",
            ],
            status="active",
        )
    )
    db.add(
        SafetyPolicyModel(
            name="System Trust Boundary Defaults",
            description="Declares that retrieved, tool, file, and external content remains untrusted until explicitly promoted.",
            scope_type=PolicyScopeType.SYSTEM.value,
            scope_id=None,
            rules=[
                {"id": "trust-boundary", "rule_type": "trust_boundary", "reason_text": "Wrap untrusted context before prompt insertion."},
            ],
            status="active",
        )
    )
    db.add(
        ApprovalPolicyModel(
            name="System Approval Defaults",
            description="Standard approval behavior for actions that exceed the current trust defaults.",
            scope_type=PolicyScopeType.SYSTEM.value,
            scope_id=None,
            default_action="requires_approval",
            rules=[],
            status="active",
        )
    )
    await db.commit()
