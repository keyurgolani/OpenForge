"""Retrieval service boundary."""

from __future__ import annotations

import inspect
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openforge.db.models import (
    ConversationSummaryModel,
    EvidencePacketModel,
    Knowledge,
    Message,
    RetrievalQueryModel,
    RetrievalSearchResultModel,
    ToolOutputSummaryModel,
)

from .conversation_memory import ConversationMemoryService
from .evidence import EvidenceAssembler
from .ranking import rank_candidates
from .schemas import (
    ConversationSummaryResponse,
    EvidencePacketBuildRequest,
    EvidencePacketResponse,
    RetrievalQueryResponse,
    RetrievalReadRequest,
    RetrievalReadResponse,
    RetrievalSearchRequest,
    RetrievalSearchResponse,
)
from .tool_output_handling import ToolOutputHandler
from .types import (
    ConversationSummary,
    EvidencePacket,
    GraphExpansionConfig,
    GraphExpansionResult,
    RetrievalQuery,
    RetrievalReadResult,
    RetrievalResultStatus,
    RetrievalSearchResult,
    RetrievalSourceType,
    SelectionReasonCode,
    SummaryType,
)


class RetrievalService:
    def __init__(self, db: AsyncSession, *, search_backend=None):
        self.db = db
        self.search_backend = search_backend
        self.evidence = EvidenceAssembler()
        self.memory = ConversationMemoryService()
        self.tool_output = ToolOutputHandler()

    async def search(self, request: RetrievalSearchRequest) -> RetrievalSearchResponse:
        normalized_query = " ".join(request.query_text.split())
        query_id = uuid4()
        query_model = RetrievalQueryModel(
            id=query_id,
            workspace_id=request.workspace_id,
            conversation_id=request.conversation_id,
            run_id=request.run_id,
            query_text=request.query_text,
            normalized_query=normalized_query,
            search_strategy="hybrid_rrf",
            metadata_json=request.metadata,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        if self._supports_persistence():
            self.db.add(query_model)

        candidates = await self._maybe_await(self._search_candidates(request))
        ranked = rank_candidates(candidates[: request.limit])
        results: list[RetrievalSearchResult] = []
        for candidate in ranked:
            result_id = uuid4()
            stored = RetrievalSearchResultModel(
                id=result_id,
                query_id=query_id,
                workspace_id=request.workspace_id,
                source_type=candidate["source_type"].value,
                source_id=str(candidate["source_id"]),
                title=candidate["title"],
                knowledge_type=candidate.get("knowledge_type"),
                excerpt=candidate["excerpt"],
                header_path=candidate.get("header_path"),
                parent_excerpt=candidate.get("parent_excerpt"),
                score=float(candidate.get("score", 0.0)),
                rank_position=int(candidate["rank_position"]),
                strategy=str(candidate.get("strategy", "hybrid_rrf")),
                result_status=RetrievalResultStatus.CANDIDATE.value,
                selected=False,
                opened=False,
                summary_status=None,
                selection_reason_codes=[],
                trust_metadata=candidate.get("trust_metadata", {}),
                metadata_json=candidate.get("metadata", {}),
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            if self._supports_persistence():
                self.db.add(stored)
            results.append(self._serialize_search_result(stored))

        if self._supports_persistence():
            await self.db.commit()
        return RetrievalSearchResponse(
            query=RetrievalQuery(
                id=query_id,
                workspace_id=request.workspace_id,
                conversation_id=request.conversation_id,
                run_id=request.run_id,
                query_text=request.query_text,
                normalized_query=normalized_query,
                search_strategy="hybrid_rrf",
                metadata=request.metadata,
                created_at=query_model.created_at,
            ),
            results=results,
            total=len(results),
        )

    async def read(self, request: RetrievalReadRequest) -> RetrievalReadResponse:
        stored_results = await self._load_stored_results(request.query_id, request.result_ids)
        read_payloads = await self._maybe_await(self._read_candidates(stored_results, request))
        output: list[RetrievalReadResult] = []
        for stored in stored_results:
            payload = read_payloads.get(stored.id, {})
            stored.opened = True
            stored.selected = True
            stored.result_status = RetrievalResultStatus.OPENED.value
            stored.selection_reason_codes = [code.value for code in request.selection_reason_codes]
            stored.updated_at = datetime.now(timezone.utc)

            output.append(
                RetrievalReadResult(
                    result_id=stored.id,
                    query_id=stored.query_id,
                    source_type=RetrievalSourceType(stored.source_type),
                    source_id=stored.source_id,
                    title=stored.title,
                    content=str(payload.get("content", stored.excerpt)),
                    excerpt=str(payload.get("excerpt", stored.excerpt)),
                    header_path=stored.header_path,
                    parent_excerpt=payload.get("parent_excerpt") if request.include_parent_context else None,
                    citation=payload.get("citation"),
                    selected=True,
                    opened=True,
                    selection_reason_codes=request.selection_reason_codes,
                    metadata=payload.get("metadata", {}),
                )
            )

        if self._supports_persistence():
            await self.db.commit()
        return RetrievalReadResponse(query_id=request.query_id, results=output)

    async def build_evidence_packet(self, request: EvidencePacketBuildRequest) -> EvidencePacketResponse:
        packet = self.evidence.build(request)
        model = EvidencePacketModel(
            id=packet.id,
            workspace_id=packet.workspace_id,
            query_id=packet.query_id,
            conversation_id=packet.conversation_id,
            run_id=packet.run_id,
            packet_status=packet.status,
            summary=packet.summary,
            item_count=packet.item_count,
            items_json=[item.model_dump(mode="json") for item in packet.items],
            metadata_json=packet.metadata,
            created_at=packet.created_at,
            updated_at=packet.created_at,
        )
        if self._supports_persistence():
            self.db.add(model)
            await self.db.commit()
        return EvidencePacketResponse(packet=packet)

    async def get_evidence_packet(self, packet_id: UUID) -> EvidencePacketResponse | None:
        model = await self.db.get(EvidencePacketModel, packet_id)
        if model is None:
            return None
        packet = EvidencePacket(
            id=model.id,
            workspace_id=model.workspace_id,
            query_id=model.query_id,
            conversation_id=model.conversation_id,
            run_id=model.run_id,
            summary=model.summary,
            status=model.packet_status,
            item_count=model.item_count,
            items=model.items_json,
            metadata=model.metadata_json or {},
            created_at=model.created_at,
        )
        return EvidencePacketResponse(packet=packet)

    async def get_query(self, query_id: UUID) -> RetrievalQueryResponse | None:
        query_model = await self.db.get(RetrievalQueryModel, query_id)
        if query_model is None:
            return None
        result = await self.db.execute(
            select(RetrievalSearchResultModel)
            .where(RetrievalSearchResultModel.query_id == query_id)
            .order_by(RetrievalSearchResultModel.rank_position.asc())
        )
        rows = result.scalars().all()
        return RetrievalQueryResponse(
            query=RetrievalQuery(
                id=query_model.id,
                workspace_id=query_model.workspace_id,
                conversation_id=query_model.conversation_id,
                run_id=query_model.run_id,
                query_text=query_model.query_text,
                normalized_query=query_model.normalized_query,
                search_strategy=query_model.search_strategy,
                metadata=query_model.metadata_json or {},
                created_at=query_model.created_at,
            ),
            results=[self._serialize_search_result(row) for row in rows],
        )

    async def summarize_conversation(
        self,
        *,
        workspace_id: UUID,
        conversation_id: UUID,
        max_messages_before_summary: int = 20,
        keep_recent_messages: int = 10,
    ) -> ConversationSummaryResponse:
        message_rows = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
        )
        messages = [
            {"role": row.role, "content": row.content, "created_at": row.created_at.isoformat() if row.created_at else None}
            for row in message_rows.scalars().all()
        ]
        version = 1
        existing = await self.db.execute(
            select(ConversationSummaryModel)
            .where(ConversationSummaryModel.conversation_id == conversation_id)
            .order_by(ConversationSummaryModel.version.desc())
            .limit(1)
        )
        previous = existing.scalar_one_or_none()
        if previous is not None:
            version = previous.version + 1

        summary = self.memory.build_summary(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            messages=messages,
            max_messages_before_summary=max_messages_before_summary,
            keep_recent_messages=keep_recent_messages,
            version=version,
        )
        model = ConversationSummaryModel(
            id=summary.id,
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            run_id=summary.run_id,
            summary_type=summary.summary_type.value,
            status="active",
            version=summary.version,
            threshold_message_count=max_messages_before_summary,
            keep_recent_messages=keep_recent_messages,
            summary=summary.summary,
            recent_messages_json=summary.recent_messages,
            metadata_json=summary.metadata,
            created_at=summary.created_at,
            updated_at=summary.created_at,
        )
        if self._supports_persistence():
            self.db.add(model)
            await self.db.commit()
        return ConversationSummaryResponse(summary=summary)

    async def get_latest_conversation_summary(
        self,
        *,
        conversation_id: UUID,
    ) -> ConversationSummaryResponse | None:
        result = await self.db.execute(
            select(ConversationSummaryModel)
            .where(ConversationSummaryModel.conversation_id == conversation_id)
            .order_by(ConversationSummaryModel.version.desc())
            .limit(1)
        )
        model = result.scalar_one_or_none()
        if model is None:
            return None

        return ConversationSummaryResponse(
            summary=ConversationSummary(
                id=model.id,
                workspace_id=model.workspace_id,
                conversation_id=model.conversation_id,
                run_id=model.run_id,
                summary_type=SummaryType(model.summary_type),
                version=model.version,
                summary=model.summary,
                recent_messages=model.recent_messages_json or [],
                metadata=model.metadata_json or {},
                created_at=model.created_at,
            )
        )

    async def persist_tool_output_summary(
        self,
        *,
        tool_name: str,
        output: object,
        workspace_id: UUID | None = None,
        conversation_id: UUID | None = None,
        run_id: UUID | None = None,
        call_id: str | None = None,
    ):
        processed = self.tool_output.process(tool_name=tool_name, output=output)
        model = ToolOutputSummaryModel(
            id=uuid4(),
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            run_id=run_id,
            tool_name=tool_name,
            call_id=call_id,
            summary_type=processed.summary_type.value if processed.summary_type else None,
            handling_mode=processed.handling_mode.value,
            raw_char_count=processed.raw_char_count,
            raw_token_estimate=processed.raw_token_estimate,
            preview=processed.preview,
            summary=processed.summary,
            metadata_json={"raw_output_reference": processed.raw_output_reference},
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        if self._supports_persistence():
            self.db.add(model)
            await self.db.commit()
        return processed

    def _search_candidates(self, request: RetrievalSearchRequest) -> list[dict[str, Any]]:
        search_backend = self.search_backend or self._default_search_backend()
        if request.deduplicate_sources:
            raw_results = search_backend.search_deduplicated(
                query=request.query_text,
                workspace_id=str(request.workspace_id),
                limit=request.limit,
                knowledge_type=request.knowledge_type,
                tag=request.tag,
                expand_context=request.include_parent_context,
            )
        else:
            raw_results = search_backend.search(
                query=request.query_text,
                workspace_id=str(request.workspace_id),
                limit=request.limit,
                knowledge_type=request.knowledge_type,
                tag=request.tag,
                expand_context=request.include_parent_context,
            )

        candidates: list[dict[str, Any]] = []
        for raw in raw_results:
            source_type = RetrievalSourceType.CONVERSATION if raw.get("conversation_id") else RetrievalSourceType.KNOWLEDGE
            source_id = raw.get("conversation_id") or raw.get("knowledge_id") or ""
            candidates.append(
                {
                    "source_type": source_type,
                    "source_id": source_id,
                    "title": raw.get("title") or "Untitled",
                    "knowledge_type": raw.get("knowledge_type"),
                    "excerpt": raw.get("chunk_text") or "",
                    "header_path": raw.get("header_path"),
                    "parent_excerpt": raw.get("parent_chunk_text"),
                    "score": raw.get("score", 0.0),
                    "strategy": "hybrid_rrf",
                    "metadata": {
                        "knowledge_id": raw.get("knowledge_id"),
                        "conversation_id": raw.get("conversation_id"),
                        "created_at": raw.get("created_at"),
                        "tags": raw.get("tags", []),
                        "chunk_type": raw.get("chunk_type"),
                        "char_start": raw.get("char_start"),
                        "char_end": raw.get("char_end"),
                        "token_count": raw.get("token_count"),
                        "parent_token_count": raw.get("parent_token_count"),
                    },
                    "trust_metadata": self._default_trust_metadata(source_type),
                }
            )
        return candidates

    async def _load_stored_results(self, query_id: UUID, result_ids: list[UUID]) -> list[RetrievalSearchResultModel]:
        result = await self.db.execute(
            select(RetrievalSearchResultModel)
            .where(
                RetrievalSearchResultModel.query_id == query_id,
                RetrievalSearchResultModel.id.in_(result_ids),
            )
            .order_by(RetrievalSearchResultModel.rank_position.asc())
        )
        return result.scalars().all()

    async def _read_candidates(
        self,
        stored_results: list[RetrievalSearchResultModel],
        request: RetrievalReadRequest,
    ) -> dict[UUID, dict[str, Any]]:
        payloads: dict[UUID, dict[str, Any]] = {}
        for stored in stored_results:
            if stored.source_type == RetrievalSourceType.KNOWLEDGE.value:
                try:
                    knowledge = await self.db.get(Knowledge, UUID(stored.source_id))
                except (ValueError, TypeError):
                    knowledge = None
                content = (knowledge.content if knowledge else stored.excerpt) or stored.excerpt
            elif stored.source_type == RetrievalSourceType.CONVERSATION.value:
                try:
                    conversation_id = UUID(stored.source_id)
                except (ValueError, TypeError):
                    conversation_id = None
                if conversation_id is not None:
                    message_result = await self.db.execute(
                        select(Message)
                        .where(Message.conversation_id == conversation_id)
                        .order_by(Message.created_at.asc())
                    )
                    content = "\n".join(f"{message.role}: {message.content}" for message in message_result.scalars().all())
                else:
                    content = stored.excerpt
            else:
                content = stored.excerpt

            start = content.find(stored.excerpt) if stored.excerpt else -1
            citation = None
            if start >= 0:
                citation = {"start": start, "end": start + len(stored.excerpt)}
            payloads[stored.id] = {
                "content": content,
                "excerpt": stored.excerpt,
                "parent_excerpt": stored.parent_excerpt,
                "citation": citation,
                "metadata": stored.metadata_json or {},
            }
        return payloads

    @staticmethod
    async def _maybe_await(value):
        if inspect.isawaitable(value):
            return await value
        return value

    def _supports_persistence(self) -> bool:
        return hasattr(self.db, "add") and hasattr(self.db, "commit")

    @staticmethod
    def _default_search_backend():
        from openforge.core.search_engine import search_engine

        return search_engine

    @staticmethod
    def _default_trust_metadata(source_type: RetrievalSourceType) -> dict[str, str]:
        if source_type == RetrievalSourceType.CONVERSATION:
            return {
                "origin": "workspace_conversation",
                "trust_level": "trusted_workspace",
            }
        if source_type == RetrievalSourceType.KNOWLEDGE:
            return {
                "origin": "workspace_knowledge",
                "trust_level": "trusted_workspace",
            }
        return {
            "origin": source_type.value,
            "trust_level": "unknown",
        }

    def _serialize_search_result(self, row: RetrievalSearchResultModel) -> RetrievalSearchResult:
        return RetrievalSearchResult(
            id=row.id,
            query_id=row.query_id,
            workspace_id=row.workspace_id,
            source_type=RetrievalSourceType(row.source_type),
            source_id=row.source_id,
            title=row.title,
            knowledge_type=row.knowledge_type,
            excerpt=row.excerpt,
            header_path=row.header_path,
            parent_excerpt=row.parent_excerpt,
            score=row.score,
            rank_position=row.rank_position,
            strategy=row.strategy,
            result_status=RetrievalResultStatus(row.result_status),
            selected=row.selected,
            opened=row.opened,
            summary_status=SummaryType(row.summary_status) if row.summary_status else None,
            selection_reason_codes=[SelectionReasonCode(code) for code in (row.selection_reason_codes or [])],
            trust_metadata=row.trust_metadata or {},
            metadata=row.metadata_json or {},
        )

    # =========================================================================
    # Graph-Aware Retrieval
    # =========================================================================

    async def search_with_graph_expansion(
        self,
        request: RetrievalSearchRequest,
        graph_expansion: GraphExpansionConfig | None = None,
    ) -> tuple[RetrievalSearchResponse, GraphExpansionResult | None]:
        """
        Search with optional graph-aware expansion.

        If graph_expansion is enabled:
        1. Run standard search
        2. Extract entities from query
        3. Find matching entities in graph
        4. Get related documents via entity linkage
        5. Add to candidates with graph metadata

        Args:
            request: Standard search request
            graph_expansion: Optional graph expansion config

        Returns:
            Tuple of (search_response, graph_expansion_result)
        """
        # Run standard search first
        base_response = await self.search(request)

        # If graph expansion not enabled, return base response
        if not graph_expansion or not graph_expansion.enabled:
            return base_response, None

        # Import graph services lazily to avoid circular imports
        from openforge.domains.graph.service import GraphService
        from openforge.domains.graph.extraction import GraphExtractionService
        from openforge.domains.graph.types import EntityType

        graph_service = GraphService(self.db)

        graph_result = GraphExpansionResult()

        try:
            # Extract entities from query text
            extraction_service = GraphExtractionService(self.db, llm_service=None)
            entity_mentions = extraction_service._regex_entity_extraction(request.query_text)

            # Find matching entities in the graph
            matched_entities = []
            for mention in entity_mentions[:graph_expansion.max_entities]:
                # Search for entities matching the mention
                from openforge.domains.graph.schemas import EntitySearchParams
                from openforge.domains.graph.types import EntityStatus

                search_params = EntitySearchParams(
                    workspace_id=request.workspace_id,
                    query=mention.mention_text,
                    min_confidence=graph_expansion.min_confidence,
                    status=EntityStatus.ACTIVE,
                    limit=5,
                )
                entity_results = await graph_service.search_entities(search_params)

                for entity in entity_results.entities:
                    matched_entities.append({
                        "id": str(entity.id),
                        "name": entity.canonical_name,
                        "type": entity.entity_type.value,
                        "confidence": entity.confidence,
                        "match_source": "query_extraction",
                    })

            graph_result.matched_entities = matched_entities[:graph_expansion.max_entities]

            # Get related entities and documents if depth > 1
            if graph_expansion.expand_depth > 1 and matched_entities:
                related_entities = []
                related_docs = []

                for entity_data in matched_entities[:10]:
                    entity_id = UUID(entity_data["id"])

                    # Get neighbors
                    neighbors = await graph_service.traversal.get_entity_neighbors(
                        entity_id=entity_id,
                        max_depth=graph_expansion.expand_depth,
                        limit=graph_expansion.max_entities,
                    )

                    for neighbor in neighbors.neighbors:
                        related_entities.append({
                            "id": str(neighbor.entity_id),
                            "name": neighbor.entity_name,
                            "type": neighbor.entity_type.value,
                            "via_relationship": neighbor.predicate,
                            "direction": neighbor.direction,
                        })

                    # Get source documents for entity
                    if graph_expansion.include_related_documents:
                        sources = await graph_service.provenance.get_entity_sources(entity_id)
                        for doc in sources.documents:
                            related_docs.append({
                                "document_id": str(doc.document_id),
                                "title": doc.title,
                                "via_entity": entity_data["name"],
                            })

                graph_result.related_entities = related_entities[:graph_expansion.max_entities]
                graph_result.related_documents = related_docs[:20]

            graph_result.expansion_reason = f"Query contained {len(entity_mentions)} potential entity mentions"
            graph_result.expansion_depth = graph_expansion.expand_depth

            # Add graph metadata to search results
            for result in base_response.results:
                result.metadata["graph_expansion"] = {
                    "matched_entity_count": len(graph_result.matched_entities),
                    "related_entity_count": len(graph_result.related_entities),
                    "related_document_count": len(graph_result.related_documents),
                }

        except Exception as e:
            # Log error but don't fail the search
            import logging
            logging.getLogger(__name__).warning(f"Graph expansion failed: {e}")
            graph_result.expansion_reason = f"Expansion failed: {str(e)}"

        return base_response, graph_result
