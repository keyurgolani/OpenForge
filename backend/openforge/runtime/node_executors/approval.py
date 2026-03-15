"""Approval node executor."""

from __future__ import annotations

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionResult


class ApprovalNodeExecutor(BaseNodeExecutor):
    """Executor for workflow approval nodes."""

    supported_types = ("approval",)

    def __init__(self, approval_service):
        self.approval_service = approval_service

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        state = dict(context.state)
        config = context.node.get("config", {})
        approval_request_id = state.get("approval_request_id")

        if approval_request_id is not None:
            request = await self.approval_service.get_request(approval_request_id)
            if request is not None and request.status == "approved":
                state["approval_status"] = "approved"
                return NodeExecutionResult(state=state, next_edge_type="approved")
            if request is not None and request.status == "denied":
                state["approval_status"] = "denied"
                return NodeExecutionResult(state=state, next_edge_type="denied")
            if request is not None:
                state["approval_status"] = request.status
                return NodeExecutionResult(
                    state=state,
                    interrupt=True,
                    interrupt_status="waiting_approval",
                    approval_request_id=request.id,
                )

        request = await self.approval_service.create_request(
            request_type="workflow_approval",
            scope_type="run",
            scope_id=str(context.run.id),
            source_run_id=context.run.id,
            requested_action=config.get("requested_action") or context.node.get("label", "Approve workflow step"),
            tool_name=None,
            reason_code="workflow_approval_required",
            reason_text=config.get("requested_action") or context.node.get("label", "Approve workflow step"),
            risk_category=config.get("risk_category", "medium"),
            payload_preview={
                "workflow_id": str(context.workflow["id"]),
                "workflow_version_id": str(context.workflow_version["id"]),
                "node_key": context.node.get("node_key"),
            },
        )
        state["approval_request_id"] = request.id
        state["approval_status"] = "pending"
        return NodeExecutionResult(
            state=state,
            interrupt=True,
            interrupt_status="waiting_approval",
            approval_request_id=request.id,
        )
