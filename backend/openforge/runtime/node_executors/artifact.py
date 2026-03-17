"""Artifact node executor."""

from __future__ import annotations

from .base import BaseNodeExecutor, NodeExecutionContext, NodeExecutionResult


class ArtifactNodeExecutor(BaseNodeExecutor):
    """Create artifacts through the shared artifact service."""

    supported_types = ("artifact",)

    def __init__(self, artifact_service):
        self.artifact_service = artifact_service

    async def execute(self, context: NodeExecutionContext) -> NodeExecutionResult:
        state = dict(context.state)
        config = context.node.get("config", {})
        title_template = config.get("title_template", context.node.get("label", "Workflow Artifact"))
        body_template = config.get("body_template", "{result}")
        summary_template = config.get("summary_template")

        artifact = await self.artifact_service.create_artifact(
            {
                "workspace_id": context.run.workspace_id,
                "artifact_type": config.get("artifact_type", "report"),
                "title": title_template.format(**state),
                "summary": summary_template.format(**state) if summary_template else None,
                "status": "active",
                "visibility": config.get("visibility", "workspace"),
                "creation_mode": "run_generated",
                "source_run_id": context.run.id,
                "source_workflow_id": context.workflow["id"],
                "created_by_type": "run",
                "created_by_id": context.run.id,
                "content_type": config.get("content_type", "markdown"),
                "body": body_template.format(**state),
                "structured_payload": config.get("structured_payload", {}),
                "change_note": config.get("change_note", "Created from workflow runtime"),
                "tags": config.get("tags", []),
            }
        )

        artifact_state_key = config.get("artifact_state_key", "artifact_ids")
        state.setdefault(artifact_state_key, [])
        state[artifact_state_key].append(str(artifact["id"]))
        state["last_artifact_id"] = str(artifact["id"])
        return NodeExecutionResult(
            state=state,
            output={"artifact_id": artifact["id"]},
            emitted_artifact_ids=[artifact["id"]],
        )
