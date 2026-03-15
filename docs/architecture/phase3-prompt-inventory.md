# Phase 3 Prompt Inventory

This inventory records the meaningful prompt sources that Phase 3 consolidates into the managed prompt domain.

## Current Managed Catalog Targets

| Current source | Current purpose | Target prompt slug | Owner type | Owner id | Action |
|---|---|---|---|---|---|
| `backend/openforge/core/prompt_catalogue.py` | Knowledge title generation | `generate_title` | `system` | `knowledge` | move |
| `backend/openforge/core/prompt_catalogue.py` | Knowledge title system instruction | `knowledge_title_system` | `system` | `knowledge` | move |
| `backend/openforge/core/prompt_catalogue.py` | Knowledge summarization | `summarize_knowledge` | `system` | `knowledge` | move |
| `backend/openforge/core/prompt_catalogue.py` | Knowledge insight extraction | `extract_insights` | `system` | `knowledge` | move |
| `backend/openforge/core/prompt_catalogue.py` | Audio title generation | `audio_title_generation` | `system` | `knowledge` | move |
| `backend/openforge/core/prompt_catalogue.py` | Image vision analysis | `image_vision_analysis` | `system` | `knowledge` | move |
| `backend/openforge/core/prompt_catalogue.py` | Workspace agent system prompt | `agent_system` | `system` | `chat` | move |
| `backend/openforge/core/prompt_catalogue.py` | Delegated subagent system prompt | `subagent_system` | `system` | `chat` | move |
| `backend/openforge/core/prompt_catalogue.py` | Router prompt | `router_system` | `system` | `chat` | move |
| `backend/openforge/core/prompt_catalogue.py` | Council review prompt | `council_system` | `system` | `chat` | move |
| `backend/openforge/core/prompt_catalogue.py` | Prompt optimizer prompt | `optimizer_system` | `system` | `chat` | move |
| `backend/openforge/core/prompt_catalogue.py` | Conversation title prompt | `conversation_title` | `system` | `chat` | move |
| `backend/openforge/core/prompt_catalogue.py` | Mentioned conversation summary | `mention_conversation_summary` | `system` | `chat` | move |
| `backend/openforge/core/prompt_catalogue.py` | Entity extraction | `entity_extraction` | `system` | `knowledge` | move |
| `backend/openforge/core/prompt_catalogue.py` | Conversation compression summary | `conversation_summary` | `system` | `chat` | move |

## Prompt Call Sites Reviewed

These modules now resolve prompt content through the managed prompt compatibility layer instead of keeping local prompt bodies:

- `backend/openforge/api/knowledge.py`
- `backend/openforge/services/knowledge_processing_service.py`
- `backend/openforge/services/conversation_service.py`
- `backend/openforge/core/knowledge_processors/audio_processor.py`
- `backend/openforge/core/knowledge_processors/image_processor.py`

## Hidden Fallback Sweep

Phase 3 removes the old behavior where `resolve_prompt_text()` silently fell back to embedded prompt strings when the managed lookup failed.

The explicit behaviors are now:

- render the managed prompt successfully
- fail with a typed render error
- only use a direct fallback string when a caller passes one explicitly

## Non-Managed Text Reviewed

The following text remains outside the managed prompt system intentionally:

- operator-facing copy inside the frontend settings UI
- documentation examples and planning documents
- plain runtime status and error messages that are not instructions to an LLM
