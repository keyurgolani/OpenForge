"""Output domain service."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import ArtifactModel, ArtifactVersionModel

from .lineage import build_default_links, group_lineage_links
from .publishing import normalize_sync_status
from .sinks import build_default_sink
from .types import ArtifactVersion
from .versioning import build_version_diff_summary, next_version_number, should_create_new_version


class OutputService:
    """Service for managing outputs, versions, lineage, and sinks."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _value(self, raw: Any) -> Any:
        return getattr(raw, "value", raw)

    def _serialize_version(self, instance: ArtifactVersionModel) -> dict[str, Any]:
        return {
            "id": instance.id,
            "artifact_id": instance.artifact_id,
            "version_number": instance.version_number,
            "content_type": instance.content_type,
            "content": instance.content,
            "structured_payload": instance.structured_payload or {},
            "summary": instance.summary,
            "change_note": instance.change_note,
            "source_run_id": instance.source_run_id,
            "source_evidence_packet_id": instance.source_evidence_packet_id,
            "status": instance.status,
            "created_by_type": instance.created_by_type,
            "created_by_id": instance.created_by_id,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }

    def _serialize_link(self, instance: Any) -> dict[str, Any]:
        return {}

    def _serialize_sink(self, instance: Any) -> dict[str, Any]:
        return {}

    def _normalize_version_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        structured_payload = payload.get("structured_payload")
        legacy_content = payload.get("content")
        if structured_payload in (None, {}) and legacy_content not in (None, {}):
            structured_payload = legacy_content
        return {
            "content_type": payload.get("content_type") or "structured_payload",
            "content": payload.get("body"),
            "structured_payload": structured_payload or {},
            "summary": payload.get("summary"),
            "change_note": payload.get("change_note"),
            "source_run_id": payload.get("source_run_id"),
            "source_evidence_packet_id": payload.get("source_evidence_packet_id"),
            "status": self._value(payload.get("status") or "draft"),
            "created_by_type": payload.get("created_by_type"),
            "created_by_id": payload.get("created_by_id"),
        }

    def _build_legacy_content(self, version_payload: dict[str, Any]) -> dict[str, Any]:
        content = dict(version_payload.get("structured_payload") or {})
        if version_payload.get("content") is not None:
            content["body"] = version_payload["content"]
        return content

    async def _get_current_version(self, artifact: ArtifactModel) -> ArtifactVersionModel | None:
        if artifact.current_version_id is None:
            return None
        return await self.db.get(ArtifactVersionModel, artifact.current_version_id)

    async def _build_output_response(self, artifact: ArtifactModel) -> dict[str, Any]:
        current_version = await self._get_current_version(artifact)
        serialized_version = self._serialize_version(current_version) if current_version else None
        content = dict(artifact.content or {})
        if serialized_version is not None and serialized_version.get("content") is not None:
            content = dict(serialized_version["structured_payload"] or {})
            content["body"] = serialized_version["content"]
        elif serialized_version is not None and serialized_version.get("structured_payload"):
            content = dict(serialized_version["structured_payload"])
        return {
            "id": artifact.id,
            "artifact_type": artifact.artifact_type,
            "workspace_id": artifact.workspace_id,
            "title": artifact.title,
            "summary": artifact.summary,
            "status": artifact.status,
            "visibility": getattr(artifact, "visibility", "workspace"),
            "creation_mode": getattr(artifact, "creation_mode", "user_created"),
            "current_version_id": getattr(artifact, "current_version_id", None),
            "current_version_number": artifact.version,
            "source_run_id": artifact.source_run_id,
            "source_workflow_id": getattr(artifact, "source_workflow_id", None),
            "source_mission_id": artifact.source_mission_id,
            "source_profile_id": getattr(artifact, "source_profile_id", None),
            "created_by_type": getattr(artifact, "created_by_type", None),
            "created_by_id": getattr(artifact, "created_by_id", None),
            "tags": getattr(artifact, "tags_json", []) or [],
            "metadata": artifact.metadata_json or {},
            "current_version": serialized_version,
            "content": content,
            "version": artifact.version,
            "created_at": artifact.created_at,
            "updated_at": artifact.updated_at,
            "created_by": getattr(artifact, "created_by", None),
            "updated_by": getattr(artifact, "updated_by", None),
        }

    async def _create_version(
        self,
        *,
        artifact: ArtifactModel,
        payload: dict[str, Any],
        version_number: int,
    ) -> ArtifactVersionModel:
        version = ArtifactVersionModel(
            artifact_id=artifact.id,
            version_number=version_number,
            content_type=payload["content_type"],
            content=payload["content"],
            structured_payload=payload["structured_payload"],
            summary=payload["summary"],
            change_note=payload["change_note"],
            source_run_id=payload["source_run_id"] or artifact.source_run_id,
            source_evidence_packet_id=payload["source_evidence_packet_id"],
            status=payload["status"],
            created_by_type=payload["created_by_type"] or getattr(artifact, "created_by_type", None),
            created_by_id=payload["created_by_id"] or getattr(artifact, "created_by_id", None),
        )
        self.db.add(version)
        await self.db.flush()
        artifact.current_version_id = version.id
        artifact.version = version.version_number
        artifact.content = self._build_legacy_content(payload)
        if payload.get("summary") is not None:
            artifact.summary = payload["summary"]
        return version

    async def _create_link(self, artifact_id: UUID, version_id: UUID | None, payload: dict[str, Any]) -> None:
        pass  # ArtifactLinkModel removed

    async def _create_sink(self, artifact_id: UUID, payload: dict[str, Any]) -> None:
        pass  # ArtifactSinkModel removed

    def _apply_filters(self, query, filters: dict[str, Any]) -> Any:
        for key, value in filters.items():
            if value is None:
                continue
            if key == "q":
                query = query.where(
                    or_(
                        ArtifactModel.title.ilike(f"%{value}%"),
                        ArtifactModel.summary.ilike(f"%{value}%"),
                    )
                )
                continue
            query = query.where(getattr(ArtifactModel, key) == value)
        return query

    async def list_outputs(
        self,
        skip: int = 0,
        limit: int = 100,
        workspace_id: UUID | None = None,
        artifact_type: str | None = None,
        status: str | None = None,
        visibility: str | None = None,
        source_run_id: UUID | None = None,
        source_workflow_id: UUID | None = None,
        source_mission_id: UUID | None = None,
        created_by_type: str | None = None,
        q: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        filters = {
            "workspace_id": workspace_id,
            "artifact_type": artifact_type,
            "status": status,
            "visibility": visibility,
            "source_run_id": source_run_id,
            "source_workflow_id": source_workflow_id,
            "source_mission_id": source_mission_id,
            "created_by_type": created_by_type,
            "q": q,
        }
        query = self._apply_filters(
            select(ArtifactModel).order_by(ArtifactModel.updated_at.desc()),
            filters,
        )
        rows = (await self.db.execute(query.offset(skip).limit(limit))).scalars().all()
        total = await self.db.scalar(self._apply_filters(select(func.count()).select_from(ArtifactModel), filters))
        outputs = []
        for row in rows:
            outputs.append(await self._build_output_response(row))
        return outputs, int(total or 0)

    # Backward-compat alias
    async def list_artifacts(self, *args, **kwargs):
        return await self.list_outputs(*args, **kwargs)

    async def get_output(self, output_id: UUID) -> dict[str, Any] | None:
        artifact = await self.db.get(ArtifactModel, output_id)
        if artifact is None:
            return None
        return await self._build_output_response(artifact)

    # Backward-compat alias
    async def get_artifact(self, artifact_id: UUID) -> dict[str, Any] | None:
        return await self.get_output(artifact_id)

    async def create_output(self, output_data: dict[str, Any]) -> dict[str, Any]:
        version_payload = self._normalize_version_payload(output_data)
        artifact = ArtifactModel(
            artifact_type=self._value(output_data["artifact_type"]),
            workspace_id=output_data["workspace_id"],
            source_run_id=output_data.get("source_run_id"),
            source_workflow_id=output_data.get("source_workflow_id"),
            source_mission_id=output_data.get("source_mission_id"),
            source_profile_id=output_data.get("source_profile_id"),
            title=output_data["title"],
            summary=output_data.get("summary"),
            content=self._build_legacy_content(version_payload),
            metadata_json=output_data.get("metadata", {}),
            status=self._value(output_data.get("status", "draft")),
            visibility=self._value(output_data.get("visibility", "workspace")),
            creation_mode=self._value(output_data.get("creation_mode", "user_created")),
            version=0,
            created_by_type=output_data.get("created_by_type"),
            created_by_id=output_data.get("created_by_id"),
            tags_json=output_data.get("tags", []),
        )
        self.db.add(artifact)
        await self.db.flush()

        version = await self._create_version(artifact=artifact, payload=version_payload, version_number=1)

        default_links = build_default_links(
            artifact_id=artifact.id,
            version_id=version.id,
            source_run_id=artifact.source_run_id,
            source_workflow_id=getattr(artifact, "source_workflow_id", None),
            source_mission_id=artifact.source_mission_id,
            source_profile_id=getattr(artifact, "source_profile_id", None),
            source_evidence_packet_id=version.source_evidence_packet_id,
        )
        for link_payload in default_links + list(output_data.get("links", [])):
            await self._create_link(artifact.id, version.id, link_payload)

        sink_payloads = list(output_data.get("sinks", [])) or [build_default_sink()]
        for sink_payload in sink_payloads:
            await self._create_sink(artifact.id, sink_payload)

        await self.db.commit()
        await self.db.refresh(artifact)
        return await self._build_output_response(artifact)

    # Backward-compat alias
    async def create_artifact(self, artifact_data: dict[str, Any]) -> dict[str, Any]:
        return await self.create_output(artifact_data)

    async def update_output(self, output_id: UUID, output_data: dict[str, Any]) -> dict[str, Any] | None:
        artifact = await self.db.get(ArtifactModel, output_id)
        if artifact is None:
            return None

        if output_data.get("title") is not None:
            artifact.title = output_data["title"]
        if output_data.get("summary") is not None and not should_create_new_version(output_data):
            artifact.summary = output_data["summary"]
        if output_data.get("metadata") is not None:
            artifact.metadata_json = output_data["metadata"]
        if output_data.get("status") is not None:
            artifact.status = self._value(output_data["status"])
        if output_data.get("visibility") is not None:
            artifact.visibility = self._value(output_data["visibility"])
        if output_data.get("tags") is not None:
            artifact.tags_json = output_data["tags"]

        promote_version_id = output_data.get("promote_version_id")
        if promote_version_id is not None:
            version = await self.db.get(ArtifactVersionModel, promote_version_id)
            if version is not None and version.artifact_id == output_id:
                artifact.current_version_id = version.id
                artifact.version = version.version_number
                artifact.summary = version.summary or artifact.summary
                artifact.content = self._build_legacy_content(
                    {
                        "structured_payload": version.structured_payload,
                        "content": version.content,
                    }
                )

        if should_create_new_version(output_data):
            version_payload = self._normalize_version_payload(output_data)
            version = await self._create_version(
                artifact=artifact,
                payload=version_payload,
                version_number=next_version_number(artifact.version),
            )
            if version.source_evidence_packet_id is not None:
                await self._create_link(
                    artifact.id,
                    version.id,
                    {
                        "link_type": "informed_by",
                        "target_type": "evidence_packet",
                        "target_id": version.source_evidence_packet_id,
                        "metadata": {},
                    },
                )

        await self.db.commit()
        await self.db.refresh(artifact)
        return await self._build_output_response(artifact)

    # Backward-compat alias
    async def update_artifact(self, artifact_id: UUID, artifact_data: dict[str, Any]) -> dict[str, Any] | None:
        return await self.update_output(artifact_id, artifact_data)

    async def delete_output(self, output_id: UUID) -> bool:
        artifact = await self.db.get(ArtifactModel, output_id)
        if artifact is None:
            return False
        artifact.status = "deleted"
        await self.db.commit()
        return True

    # Backward-compat alias
    async def delete_artifact(self, artifact_id: UUID) -> bool:
        return await self.delete_output(artifact_id)

    async def list_versions(self, artifact_id: UUID) -> list[dict[str, Any]]:
        query = (
            select(ArtifactVersionModel)
            .where(ArtifactVersionModel.artifact_id == artifact_id)
            .order_by(ArtifactVersionModel.version_number.desc())
        )
        rows = (await self.db.execute(query)).scalars().all()
        return [self._serialize_version(row) for row in rows]

    async def get_version(self, artifact_id: UUID, version_id: UUID) -> dict[str, Any] | None:
        version = await self.db.get(ArtifactVersionModel, version_id)
        if version is None or version.artifact_id != artifact_id:
            return None
        return self._serialize_version(version)

    async def create_version(self, artifact_id: UUID, version_data: dict[str, Any]) -> dict[str, Any] | None:
        return await self.update_output(artifact_id, version_data)

    async def promote_version(self, artifact_id: UUID, version_id: UUID) -> dict[str, Any] | None:
        return await self.update_output(artifact_id, {"promote_version_id": version_id})

    async def get_version_diff_summary(
        self,
        artifact_id: UUID,
        version_id: UUID,
        compare_to_version_id: UUID,
    ) -> dict[str, Any] | None:
        version = await self.db.get(ArtifactVersionModel, version_id)
        compare_to = await self.db.get(ArtifactVersionModel, compare_to_version_id)
        if version is None or compare_to is None:
            return None
        if version.artifact_id != artifact_id or compare_to.artifact_id != artifact_id:
            return None
        return build_version_diff_summary(
            artifact_id,
            from_version=ArtifactVersion.model_validate(compare_to),
            to_version=ArtifactVersion.model_validate(version),
        )

    async def get_lineage(self, artifact_id: UUID) -> dict[str, Any]:
        return group_lineage_links(artifact_id, [])

    async def add_link(self, artifact_id: UUID, link_data: dict[str, Any]) -> dict[str, Any]:
        return {}

    async def list_sinks(self, artifact_id: UUID) -> list[dict[str, Any]]:
        return []

    async def add_sink(self, artifact_id: UUID, sink_data: dict[str, Any]) -> dict[str, Any]:
        return {}


# Backward-compat alias
ArtifactService = OutputService
