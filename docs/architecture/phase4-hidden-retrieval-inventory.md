# Phase 4 Hidden Retrieval Inventory

This inventory captures code paths where context could appear implicitly or where the code still suggested hidden retrieval behavior before the Phase 4 reset work.

## Delete or Rewrite

| Path | Behavior | Phase 4 Action |
|------|----------|----------------|
| `backend/openforge/core/context_assembler.py` | Carried a dead `rag_results` path that implied hidden prompt stuffing | Deleted the dead RAG entry point; context assembly now only accepts explicit context |
| `backend/openforge/api/search.py` | Search bypassed any retrieval lineage and returned raw search hits directly from `core/search_engine.py` | Rewritten to route through `domains/retrieval/service.py` so every search can create a retrieval query and result records |
| `backend/openforge/core/search_engine.py` | Returned ranked payloads without any durable query/result lineage | Kept as a low-level backend behind the retrieval domain instead of the public boundary |

## Isolate and Track

| Path | Behavior | Phase 4 Status |
|------|----------|----------------|
| `backend/openforge/services/knowledge_processing_service.py` | Builds trusted/untrusted context blocks for knowledge summarization and intelligence generation | Kept, because these are explicit knowledge-processing tasks rather than chat-time auto-retrieval; still monitored for direct prompt stuffing patterns |
| `backend/openforge/api/knowledge.py` | Summarization endpoints pass explicit knowledge content into `prepare_llm_messages()` | Kept for knowledge-specific workflows; not used as general retrieval |
| `backend/openforge/api/websocket.py` and task-scheduler imports of `services/agent_execution_engine` | Runtime execution path still depends on a missing source file, so chat-time retrieval behavior cannot be fully audited from the current workspace snapshot | Flagged as a quality risk outside the retrieval domain implementation; the explicit retrieval APIs and search UI now provide a clean Phase 4 path independent of that missing source |

## Hidden Fallbacks Removed From Active Search

- The old public search route no longer talks to the search engine directly.
- Retrieval search and retrieval read are now separate APIs.
- Evidence packets are first-class records instead of ad hoc UI snippets.

## Remaining Gaps To Watch

- The transitional chat runtime still needs a full source-level audit once `agent_execution_engine.py` is restored or replaced in source form.
- Large tool outputs still need broader runtime integration beyond the new shared handler and persistence table.
