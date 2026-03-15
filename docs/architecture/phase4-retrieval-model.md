# Phase 4 Retrieval Model

Phase 4 resets retrieval around explicit, inspectable steps:

1. `search`
2. `read`
3. `summarize`
4. `assemble evidence`

The system should no longer behave like an implicit auto-RAG layer.

## Domain Surface

Primary package:

- `backend/openforge/domains/retrieval/`

Key modules:

- `service.py` - search/read/evidence/conversation-summary boundary
- `router.py` - retrieval APIs
- `chunking.py` - contextual chunk generation
- `conversation_memory.py` - intentional conversation summaries
- `tool_output_handling.py` - prompt-safe tool-output processing
- `evidence.py` - evidence packet assembly

## Persistence Model

Phase 4 adds:

- `retrieval_queries`
- `retrieval_search_results`
- `evidence_packets`
- `conversation_summaries`
- `tool_output_summaries`

These tables let the system answer:

- what did we search for?
- what came back?
- what got opened?
- what got selected?
- what evidence packet was built?

## Search vs Read

`search` returns ranked candidates.

`read` opens selected results and can expand parent context.

This separation matters because:

- not every candidate should become context
- citations should come from content that was explicitly opened
- evidence packets should reflect actual reads, not speculative candidates

## Chunking Model

Chunking is contextual rather than flat:

- heading paths are preserved
- parent section text is retained
- dense embeddings use contextualized text
- obvious boilerplate fragments are suppressed

## Conversation Memory

Conversation memory is modeled separately from raw chat history:

- older turns can be summarized intentionally
- recent turns remain verbatim
- summary versions are persisted in `conversation_summaries`

## Tool Output Handling

Large tool payloads go through the shared handler before prompt use:

- inline when small
- summarized when large
- persisted in `tool_output_summaries`

## UI Surface

The search page now acts as a retrieval operator surface:

- query id and strategy are visible
- individual results can be explicitly traced through `read`
- evidence packets are visible separately from result cards

## Guardrails

Phase 4 guardrails currently enforce:

- no dead `rag_results` path in `context_assembler.py`
- explicit retrieval service boundary for public search
- retrieval regression tests for search, read, evidence, summaries, tool-output handling, and chunk quality
