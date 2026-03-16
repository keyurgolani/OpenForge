"""Policy and approval API router."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from openforge.db.postgres import get_db

from .approval_service import ApprovalService
from .schemas import (
    ApprovalListResponse,
    ApprovalRequestResponse,
    ApprovalResolutionRequest,
    PolicyListResponse,
    PolicyResponse,
    PolicySimulationRequest,
    PolicySimulationResponse,
    SafetyPolicyCreate,
    SafetyPolicyUpdate,
    ToolPolicyCreate,
    ToolPolicyUpdate,
)
from .service import PolicyService

router = APIRouter()


def _approval_field(approval, field_name: str):
    if isinstance(approval, dict):
        return approval.get(field_name)
    return getattr(approval, field_name, None)


def get_policy_service(db=Depends(get_db)) -> PolicyService:
    return PolicyService(db)


def get_approval_service(db=Depends(get_db)) -> ApprovalService:
    return ApprovalService(db)


@router.post("/simulate", response_model=PolicySimulationResponse)
async def simulate_policy(
    body: PolicySimulationRequest,
    service: PolicyService = Depends(get_policy_service),
):
    return await service.simulate_tool_decision(
        tool_name=body.tool_name,
        risk_category=body.risk_category,
        scope_context=body.scope_context,
        run_id=body.run_id,
    )


@router.get("/approvals", response_model=ApprovalListResponse)
async def list_approvals(
    status: str | None = "pending",
    limit: int = 100,
    offset: int = 0,
    service: ApprovalService = Depends(get_approval_service),
):
    approvals = await service.list_approval_requests(status=status, limit=limit, offset=offset)
    return {"approvals": approvals, "total": len(approvals)}


@router.get("/approvals/{approval_id}", response_model=ApprovalRequestResponse)
async def get_approval(
    approval_id: UUID,
    service: ApprovalService = Depends(get_approval_service),
):
    approval = await service.get_request(approval_id)
    if approval is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval request not found")
    return approval


@router.post("/approvals/{approval_id}/approve", response_model=ApprovalRequestResponse)
async def approve_request(
    approval_id: UUID,
    body: ApprovalResolutionRequest,
    service: ApprovalService = Depends(get_approval_service),
):
    approval = await service.approve_request(approval_id, note=body.resolution_note)
    if approval is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval request not found or already resolved")
    scope_id = _approval_field(approval, "scope_id")
    payload_preview = _approval_field(approval, "payload_preview") or {}
    conversation_id = payload_preview.get("conversation_id")
    if scope_id and conversation_id:
        from openforge.api.websocket import ws_manager

        await ws_manager.send_to_workspace(
            str(scope_id),
            {
                "type": "hitl_resolved",
                "data": {
                    "id": str(_approval_field(approval, "id")),
                    "conversation_id": str(conversation_id),
                    "status": "approved",
                },
            },
        )
    return approval


@router.post("/approvals/{approval_id}/deny", response_model=ApprovalRequestResponse)
async def deny_request(
    approval_id: UUID,
    body: ApprovalResolutionRequest,
    service: ApprovalService = Depends(get_approval_service),
):
    approval = await service.deny_request(approval_id, note=body.resolution_note)
    if approval is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval request not found or already resolved")
    scope_id = _approval_field(approval, "scope_id")
    payload_preview = _approval_field(approval, "payload_preview") or {}
    conversation_id = payload_preview.get("conversation_id")
    if scope_id and conversation_id:
        from openforge.api.websocket import ws_manager

        await ws_manager.send_to_workspace(
            str(scope_id),
            {
                "type": "hitl_resolved",
                "data": {
                    "id": str(_approval_field(approval, "id")),
                    "conversation_id": str(conversation_id),
                    "status": "denied",
                },
            },
        )
    return approval


@router.post("/safety", response_model=PolicyResponse, status_code=201)
async def create_safety_policy(
    data: SafetyPolicyCreate,
    service: PolicyService = Depends(get_policy_service),
):
    """Create a new safety policy."""
    result = await service.create_safety_policy(data.model_dump(exclude_unset=True))
    return PolicyResponse(**result)


@router.patch("/safety/{policy_id}", response_model=PolicyResponse)
async def update_safety_policy(
    policy_id: str,
    data: SafetyPolicyUpdate,
    service: PolicyService = Depends(get_policy_service),
):
    """Update an existing safety policy."""
    result = await service.update_safety_policy(
        policy_id, data.model_dump(exclude_unset=True, exclude_none=True)
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Safety policy not found")
    return PolicyResponse(**result)


@router.delete("/safety/{policy_id}", status_code=204)
async def delete_safety_policy(
    policy_id: str,
    service: PolicyService = Depends(get_policy_service),
):
    """Delete a safety policy."""
    deleted = await service.delete_safety_policy(policy_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Safety policy not found")


@router.post("/tool", response_model=PolicyResponse, status_code=201)
async def create_tool_policy(
    data: ToolPolicyCreate,
    service: PolicyService = Depends(get_policy_service),
):
    """Create a new tool policy."""
    result = await service.create_tool_policy(data.model_dump(exclude_unset=True))
    return PolicyResponse(**result)


@router.delete("/tool/{policy_id}", status_code=204)
async def delete_tool_policy(
    policy_id: str,
    service: PolicyService = Depends(get_policy_service),
):
    """Delete a tool policy."""
    deleted = await service.delete_tool_policy(policy_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Tool policy not found")


@router.get("", response_model=PolicyListResponse)
async def list_policies(
    skip: int = 0,
    limit: int = 100,
    service: PolicyService = Depends(get_policy_service),
):
    policies, total = await service.list_policies(skip=skip, limit=limit)
    return {"policies": policies, "total": total}


@router.get("/{policy_id}", response_model=PolicyResponse)
async def get_policy(
    policy_id: UUID,
    service: PolicyService = Depends(get_policy_service),
):
    policy = await service.get_policy(policy_id)
    if policy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found")
    return policy


@router.patch("/tool/{policy_id}", response_model=PolicyResponse)
async def update_tool_policy(
    policy_id: UUID,
    body: ToolPolicyUpdate,
    service: PolicyService = Depends(get_policy_service),
):
    policy = await service.update_tool_policy(policy_id, body.model_dump(exclude_unset=True))
    if policy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool policy not found")
    return policy
