"""Pipeline executor — runs slots, normalizes, and consolidates outputs."""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from openforge.core.pipeline.normalizer import normalize_output
from openforge.core.pipeline.registry import get_backend
from openforge.core.pipeline.types import (
    PipelineDefinition,
    PipelineResult,
    SlotContext,
    SlotDefinition,
    SlotExecution,
    SlotOutput,
    VectorOutput,
)

logger = logging.getLogger(__name__)


class PipelineExecutor:
    """Execute a resolved pipeline definition against a file."""

    async def execute(
        self,
        pipeline: PipelineDefinition,
        knowledge_id: UUID,
        workspace_id: UUID,
        file_path: str,
        db_session: AsyncSession,
    ) -> PipelineResult:
        """Execute all enabled slots, normalize, consolidate, return merged result."""
        enabled_slots = [s for s in pipeline.slots if s.enabled]
        parallel_slots = [s for s in enabled_slots if s.execution == SlotExecution.PARALLEL]
        sequential_slots = [s for s in enabled_slots if s.execution == SlotExecution.SEQUENTIAL]

        slot_outputs: list[SlotOutput] = []
        # Mutable file_path so sequential slots (e.g. audio compression) can
        # update it for later slots via a "file_path" key in their metadata.
        effective_path = file_path

        def _make_context(slot: SlotDefinition) -> SlotContext:
            return SlotContext(
                knowledge_id=knowledge_id,
                workspace_id=workspace_id,
                db_session=db_session,
                backend_config=slot.backend_config or None,
                knowledge_type=pipeline.knowledge_type,
            )

        # --- sequential execution (runs first so it can update file_path) ---
        for slot in sequential_slots:
            try:
                output = await _run_slot_with_timeout(slot, effective_path, _make_context(slot))
                slot_outputs.append(output)
                # Allow sequential slots to update the file path for
                # subsequent slots (e.g. audio compression → transcription).
                if output.success and output.metadata and "file_path" in output.metadata:
                    effective_path = output.metadata["file_path"]
            except Exception as e:
                slot_outputs.append(
                    SlotOutput(
                        slot_type=slot.slot_type,
                        backend_name=slot.active_backend,
                        success=False,
                        error=str(e),
                    )
                )

        # --- parallel execution ---
        if parallel_slots:
            tasks = [
                _run_slot_with_timeout(slot, effective_path, _make_context(slot))
                for slot in parallel_slots
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for slot, result in zip(parallel_slots, results):
                if isinstance(result, Exception):
                    slot_outputs.append(
                        SlotOutput(
                            slot_type=slot.slot_type,
                            backend_name=slot.active_backend,
                            success=False,
                            error=str(result),
                        )
                    )
                else:
                    slot_outputs.append(result)

        # --- post-processing: separate vectors / text, merge metadata & segments ---
        # Build a lookup of slot definitions so we can check produces_vectors.
        slot_defs = {s.slot_type: s for s in enabled_slots}

        vector_outputs: list[VectorOutput] = []
        text_outputs: list[SlotOutput] = []
        all_metadata: dict = {}
        all_segments = []

        for output in slot_outputs:
            slot_def = slot_defs.get(output.slot_type)
            is_vector_slot = (slot_def and slot_def.produces_vectors) or bool(output.vectors)
            if is_vector_slot:
                vector_outputs.extend(output.vectors)
            if output.text:
                text_outputs.append(output)
            if output.metadata:
                all_metadata.update(output.metadata)
            if output.segments:
                all_segments.extend(output.segments)

        # --- normalize text outputs ---
        normalized = [normalize_output(o) for o in text_outputs]

        # --- consolidate ---
        content = await _consolidate(
            normalized,
            pipeline=pipeline,
            workspace_id=workspace_id,
            db_session=db_session,
            knowledge_type=pipeline.knowledge_type,
        )

        return PipelineResult(
            content=content,
            metadata=all_metadata,
            vectors=vector_outputs,
            segments=all_segments,
            slot_results=slot_outputs,
        )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _run_slot_with_timeout(
    slot: SlotDefinition, file_path: str, context: SlotContext
) -> SlotOutput:
    """Run a single slot backend with timeout protection.

    Returns a ``SlotOutput`` on success.  Raises on timeout or missing backend
    so the caller can wrap the error into a failed ``SlotOutput``.
    """
    backend = get_backend(slot.slot_type, slot.active_backend)
    if backend is None:
        return SlotOutput(
            slot_type=slot.slot_type,
            backend_name=slot.active_backend,
            success=False,
            error=f"Backend not found: {slot.slot_type}/{slot.active_backend}",
        )

    try:
        return await asyncio.wait_for(
            backend.run(file_path, context),
            timeout=slot.timeout_seconds,
        )
    except asyncio.TimeoutError:
        return SlotOutput(
            slot_type=slot.slot_type,
            backend_name=slot.active_backend,
            success=False,
            error=f"Slot timed out after {slot.timeout_seconds} seconds",
        )


# ---------------------------------------------------------------------------
# Consolidation
# ---------------------------------------------------------------------------


async def _consolidate(
    normalized: list[SlotOutput],
    *,
    pipeline: PipelineDefinition,
    workspace_id: UUID,
    db_session: AsyncSession,
    knowledge_type: str = "",
) -> str:
    """Produce final consolidated content from normalized text outputs."""
    if not normalized:
        return ""

    if pipeline.consolidation_enabled:
        if len(normalized) == 1:
            # Single text output — use as-is, no LLM call.
            return normalized[0].text

        # Multiple text outputs — try LLM consolidation.
        try:
            return await _consolidate_via_llm(
                normalized,
                workspace_id=workspace_id,
                db_session=db_session,
                model=pipeline.consolidation_model,
                knowledge_type=knowledge_type,
            )
        except Exception:
            logger.warning(
                "Consolidation LLM failed; falling back to concatenation with headers",
                exc_info=True,
            )
            return _concatenate_with_headers(normalized)

    # Consolidation disabled — plain concatenation.
    return "\n\n".join(o.text for o in normalized)


async def _consolidate_via_llm(
    outputs: list[SlotOutput],
    *,
    workspace_id: UUID,
    db_session: AsyncSession,
    model: str | None,
    knowledge_type: str = "",
) -> str:
    """Call the LLM to merge multiple extraction outputs into one document.

    Raises on any LLM error so the caller can fall back.
    """
    from openforge.core.llm_gateway import LLMGateway
    from openforge.services.llm_service import llm_service

    provider_name, api_key, resolved_model, base_url = (
        await llm_service.resolve_provider_for_pipeline(
            db_session,
            knowledge_type=knowledge_type,
            step_key="consolidation",
        )
    )

    sections = "\n\n---\n\n".join(
        f"### Source: {o.slot_type} ({o.backend_name})\n\n{o.text}"
        for o in outputs
    )

    messages = [
        {
            "role": "system",
            "content": (
                "You are a document consolidation assistant. "
                "Merge the following extraction outputs into a single coherent "
                "markdown document. Preserve all factual content, remove "
                "redundancies, and maintain a logical structure. "
                "Do NOT add information that is not present in the sources."
            ),
        },
        {
            "role": "user",
            "content": sections,
        },
    ]

    gateway = LLMGateway()
    return await gateway.chat(
        messages=messages,
        provider_name=provider_name,
        api_key=api_key,
        model=resolved_model,
        base_url=base_url,
        max_tokens=4000,
    )


def _concatenate_with_headers(outputs: list[SlotOutput]) -> str:
    """Fallback: concatenate outputs with section headers."""
    parts: list[str] = []
    for o in outputs:
        parts.append(f"## {o.slot_type}\n\n{o.text}")
    return "\n\n".join(parts)
