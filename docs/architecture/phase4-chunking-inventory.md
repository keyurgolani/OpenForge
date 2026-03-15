# Phase 4 Chunking Inventory

This document records the active chunking behavior after the Phase 4 reset work.

## Active Ingestion Path

- `backend/openforge/core/knowledge_processor.py`
  - Builds an embedding document from raw content, AI summary, and structured insights.
  - Calls `chunk_markdown_with_parents()` from `backend/openforge/core/markdown_utils.py`.
- `backend/openforge/core/markdown_utils.py`
  - Now delegates parent/child chunk construction to `backend/openforge/domains/retrieval/chunking.py`.
- `backend/openforge/domains/retrieval/chunking.py`
  - Preserves heading context.
  - Keeps parent text alongside child excerpts.
  - Adds contextualized dense-embedding text.
  - Suppresses obvious navigation-only fragments.

## Current Chunk Metadata

Qdrant payloads now carry:

- `knowledge_id`
- `workspace_id`
- `knowledge_type`
- `chunk_index`
- `chunk_text`
- `header_path`
- `parent_chunk_text`
- `contextualized`
- `tags`
- `title`
- `created_at`
- `updated_at`

## Current Heuristics

- Drop navigation-only paragraph groups such as short `Home / Docs / Contact` blocks.
- Skip title-only sections that do not contain meaningful body text.
- Merge sub-minimum chunks into the previous chunk when possible.
- Preserve heading paths in contextualized embedding text.

## Current Limits

- Default max chunk size: `500` estimated tokens
- Default min chunk size: `50` estimated tokens
- Parent context is preserved in payloads but parent/child rows are not yet stored in separate relational tables.

## Follow-On Work

- Persist explicit parent/child relational chunk rows if chunk-level SQL inspection becomes necessary.
- Add document-type-aware chunk tuning per file type once retrieval evaluation corpus grows.
