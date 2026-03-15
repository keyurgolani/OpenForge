"""Evaluation domain service."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    EvaluationBaselineModel,
    EvaluationResultModel,
    EvaluationRunModel,
    EvaluationScenarioModel,
)

from .metrics import compare_metrics


class EvaluationService:
    """Service for managing evaluation scenarios, runs, results, and baselines."""

    # ── Scenario serialization ──────────────────────────────────────

    def _serialize_scenario(self, instance: EvaluationScenarioModel) -> dict[str, Any]:
        return {
            "id": instance.id,
            "name": instance.name,
            "slug": instance.slug,
            "description": instance.description,
            "suite_name": instance.suite_name,
            "scenario_type": instance.scenario_type,
            "input_payload": instance.input_payload or {},
            "expected_behaviors": instance.expected_behaviors or [],
            "expected_output_constraints": instance.expected_output_constraints or {},
            "workflow_template_id": instance.workflow_template_id,
            "profile_template_id": instance.profile_template_id,
            "mission_template_id": instance.mission_template_id,
            "evaluation_metrics": instance.evaluation_metrics or [],
            "tags": instance.tags or [],
            "is_active": instance.is_active,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }

    # ── Run serialization ───────────────────────────────────────────

    def _serialize_run(self, instance: EvaluationRunModel) -> dict[str, Any]:
        return {
            "id": instance.id,
            "workspace_id": instance.workspace_id,
            "suite_name": instance.suite_name,
            "status": instance.status,
            "scenario_count": instance.scenario_count,
            "passed_count": instance.passed_count,
            "failed_count": instance.failed_count,
            "skipped_count": instance.skipped_count,
            "total_cost_usd": instance.total_cost_usd,
            "total_tokens": instance.total_tokens,
            "baseline_id": instance.baseline_id,
            "metadata": instance.metadata_json or {},
            "started_at": instance.started_at,
            "completed_at": instance.completed_at,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }

    # ── Result serialization ────────────────────────────────────────

    def _serialize_result(self, instance: EvaluationResultModel) -> dict[str, Any]:
        return {
            "id": instance.id,
            "evaluation_run_id": instance.evaluation_run_id,
            "scenario_id": instance.scenario_id,
            "run_id": instance.run_id,
            "status": instance.status,
            "metrics": instance.metrics_json or {},
            "threshold_results": instance.threshold_results_json or {},
            "output_summary": instance.output_summary,
            "comparison_baseline": instance.comparison_baseline_json or {},
            "artifacts_produced": instance.artifacts_produced or [],
            "cost_usd": instance.cost_usd,
            "tokens_used": instance.tokens_used,
            "duration_ms": instance.duration_ms,
            "error_message": instance.error_message,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }

    # ── Baseline serialization ──────────────────────────────────────

    def _serialize_baseline(self, instance: EvaluationBaselineModel) -> dict[str, Any]:
        return {
            "id": instance.id,
            "suite_name": instance.suite_name,
            "name": instance.name,
            "description": instance.description,
            "source_evaluation_run_id": instance.source_evaluation_run_id,
            "metrics_snapshot": instance.metrics_snapshot_json or {},
            "thresholds": instance.thresholds_json or {},
            "is_active": instance.is_active,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }

    # ── Scenario CRUD ───────────────────────────────────────────────

    async def list_scenarios(
        self,
        db: AsyncSession,
        *,
        suite_name: str | None = None,
        is_active: bool | None = None,
        tags: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        query = select(EvaluationScenarioModel).order_by(EvaluationScenarioModel.created_at.desc())
        if suite_name is not None:
            query = query.where(EvaluationScenarioModel.suite_name == suite_name)
        if is_active is not None:
            query = query.where(EvaluationScenarioModel.is_active == is_active)
        if tags:
            for tag in tags:
                query = query.where(EvaluationScenarioModel.tags.contains([tag]))
        rows = (await db.execute(query)).scalars().all()
        return [self._serialize_scenario(row) for row in rows]

    async def get_scenario(self, db: AsyncSession, scenario_id: UUID) -> dict[str, Any] | None:
        instance = await db.get(EvaluationScenarioModel, scenario_id)
        if instance is None:
            return None
        return self._serialize_scenario(instance)

    async def create_scenario(self, db: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
        instance = EvaluationScenarioModel(
            name=data["name"],
            slug=data["slug"],
            description=data.get("description"),
            suite_name=data["suite_name"],
            scenario_type=data.get("scenario_type", "golden_task"),
            input_payload=data.get("input_payload", {}),
            expected_behaviors=data.get("expected_behaviors", []),
            expected_output_constraints=data.get("expected_output_constraints", {}),
            workflow_template_id=data.get("workflow_template_id"),
            profile_template_id=data.get("profile_template_id"),
            mission_template_id=data.get("mission_template_id"),
            evaluation_metrics=data.get("evaluation_metrics", []),
            tags=data.get("tags", []),
        )
        db.add(instance)
        await db.commit()
        await db.refresh(instance)
        return self._serialize_scenario(instance)

    async def update_scenario(self, db: AsyncSession, scenario_id: UUID, data: dict[str, Any]) -> dict[str, Any] | None:
        instance = await db.get(EvaluationScenarioModel, scenario_id)
        if instance is None:
            return None
        for key, value in data.items():
            if value is None:
                continue
            setattr(instance, key, value)
        await db.commit()
        await db.refresh(instance)
        return self._serialize_scenario(instance)

    async def delete_scenario(self, db: AsyncSession, scenario_id: UUID) -> bool:
        instance = await db.get(EvaluationScenarioModel, scenario_id)
        if instance is None:
            return False
        await db.delete(instance)
        await db.commit()
        return True

    # ── Evaluation Run CRUD ─────────────────────────────────────────

    async def create_evaluation_run(
        self,
        db: AsyncSession,
        *,
        suite_name: str | None = None,
        workspace_id: UUID | None = None,
        baseline_id: UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        instance = EvaluationRunModel(
            workspace_id=workspace_id,
            suite_name=suite_name,
            status="pending",
            baseline_id=baseline_id,
            metadata_json=metadata or {},
        )
        db.add(instance)
        await db.commit()
        await db.refresh(instance)
        return self._serialize_run(instance)

    async def update_evaluation_run(self, db: AsyncSession, run_id: UUID, **kwargs: Any) -> dict[str, Any] | None:
        instance = await db.get(EvaluationRunModel, run_id)
        if instance is None:
            return None
        field_map = {"metadata": "metadata_json"}
        for key, value in kwargs.items():
            if value is None:
                continue
            attr = field_map.get(key, key)
            setattr(instance, attr, value)
        await db.commit()
        await db.refresh(instance)
        return self._serialize_run(instance)

    async def get_evaluation_run(self, db: AsyncSession, run_id: UUID) -> dict[str, Any] | None:
        instance = await db.get(EvaluationRunModel, run_id)
        if instance is None:
            return None
        data = self._serialize_run(instance)
        data["results"] = await self.list_evaluation_results(db, run_id)
        return data

    async def list_evaluation_runs(
        self,
        db: AsyncSession,
        *,
        suite_name: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        query = select(EvaluationRunModel).order_by(EvaluationRunModel.created_at.desc())
        count_query = select(func.count()).select_from(EvaluationRunModel)
        if suite_name is not None:
            query = query.where(EvaluationRunModel.suite_name == suite_name)
            count_query = count_query.where(EvaluationRunModel.suite_name == suite_name)
        if status is not None:
            query = query.where(EvaluationRunModel.status == status)
            count_query = count_query.where(EvaluationRunModel.status == status)
        rows = (await db.execute(query.offset(offset).limit(limit))).scalars().all()
        total = await db.scalar(count_query)
        return [self._serialize_run(row) for row in rows], int(total or 0)

    # ── Evaluation Result CRUD ──────────────────────────────────────

    async def create_evaluation_result(
        self,
        db: AsyncSession,
        *,
        evaluation_run_id: UUID,
        scenario_id: UUID,
        status: str = "pending",
        run_id: UUID | None = None,
        metrics: dict[str, Any] | None = None,
        threshold_results: dict[str, Any] | None = None,
        output_summary: str | None = None,
        comparison_baseline: dict[str, Any] | None = None,
        artifacts_produced: list[str] | None = None,
        cost_usd: float | None = None,
        tokens_used: int = 0,
        duration_ms: int | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        instance = EvaluationResultModel(
            evaluation_run_id=evaluation_run_id,
            scenario_id=scenario_id,
            run_id=run_id,
            status=status,
            metrics_json=metrics or {},
            threshold_results_json=threshold_results or {},
            output_summary=output_summary,
            comparison_baseline_json=comparison_baseline or {},
            artifacts_produced=artifacts_produced or [],
            cost_usd=cost_usd,
            tokens_used=tokens_used,
            duration_ms=duration_ms,
            error_message=error_message,
        )
        db.add(instance)
        await db.commit()
        await db.refresh(instance)
        return self._serialize_result(instance)

    async def list_evaluation_results(self, db: AsyncSession, evaluation_run_id: UUID) -> list[dict[str, Any]]:
        query = (
            select(EvaluationResultModel)
            .where(EvaluationResultModel.evaluation_run_id == evaluation_run_id)
            .order_by(EvaluationResultModel.created_at.asc())
        )
        rows = (await db.execute(query)).scalars().all()
        return [self._serialize_result(row) for row in rows]

    # ── Baseline CRUD ───────────────────────────────────────────────

    async def create_baseline(self, db: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
        instance = EvaluationBaselineModel(
            suite_name=data["suite_name"],
            name=data["name"],
            description=data.get("description"),
            source_evaluation_run_id=data.get("source_evaluation_run_id"),
            metrics_snapshot_json=data.get("metrics_snapshot", {}),
            thresholds_json=data.get("thresholds", {}),
        )
        db.add(instance)
        await db.commit()
        await db.refresh(instance)
        return self._serialize_baseline(instance)

    async def get_baseline(self, db: AsyncSession, baseline_id: UUID) -> dict[str, Any] | None:
        instance = await db.get(EvaluationBaselineModel, baseline_id)
        if instance is None:
            return None
        return self._serialize_baseline(instance)

    async def list_baselines(
        self,
        db: AsyncSession,
        *,
        suite_name: str | None = None,
        is_active: bool | None = None,
    ) -> list[dict[str, Any]]:
        query = select(EvaluationBaselineModel).order_by(EvaluationBaselineModel.created_at.desc())
        if suite_name is not None:
            query = query.where(EvaluationBaselineModel.suite_name == suite_name)
        if is_active is not None:
            query = query.where(EvaluationBaselineModel.is_active == is_active)
        rows = (await db.execute(query)).scalars().all()
        return [self._serialize_baseline(row) for row in rows]

    # ── Regression checking ─────────────────────────────────────────

    async def check_regression(
        self,
        db: AsyncSession,
        evaluation_run_id: UUID,
        baseline_id: UUID,
    ) -> dict[str, Any]:
        """Compare run results against a baseline and return regression info."""
        baseline = await self.get_baseline(db, baseline_id)
        if baseline is None:
            return {
                "baseline_id": baseline_id,
                "baseline_name": "",
                "regressions": [],
                "warnings": [{"message": "Baseline not found"}],
                "passed": False,
            }

        results = await self.list_evaluation_results(db, evaluation_run_id)

        # Aggregate current metrics across all results
        aggregated: dict[str, Any] = {}
        for result in results:
            for metric_name, metric_value in result.get("metrics", {}).items():
                if metric_name not in aggregated:
                    aggregated[metric_name] = []
                aggregated[metric_name].append(metric_value)

        # Average each metric
        current_metrics: dict[str, Any] = {}
        for metric_name, values in aggregated.items():
            numeric = [v for v in values if isinstance(v, (int, float))]
            if numeric:
                current_metrics[metric_name] = sum(numeric) / len(numeric)

        comparisons = compare_metrics(
            current=current_metrics,
            baseline=baseline.get("metrics_snapshot", {}),
            thresholds=baseline.get("thresholds", {}),
        )

        regressions = [
            {
                "metric": c.metric_name,
                "baseline_value": c.baseline_value,
                "current_value": c.current_value,
                "delta_pct": c.delta_pct,
            }
            for c in comparisons
            if c.regression
        ]
        warnings = [
            {
                "metric": c.metric_name,
                "baseline_value": c.baseline_value,
                "current_value": c.current_value,
                "delta_pct": c.delta_pct,
            }
            for c in comparisons
            if c.warning
        ]

        return {
            "baseline_id": baseline_id,
            "baseline_name": baseline.get("name", ""),
            "regressions": regressions,
            "warnings": warnings,
            "passed": len(regressions) == 0,
        }
