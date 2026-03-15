# Phase 4 Tool Output Inventory

This inventory defines which high-volume tool outputs must not flow into prompts unbounded.

## High-Volume Output Classes

| Tool Class | Examples | Policy |
|------------|----------|--------|
| Retrieval/search outputs | `workspace.search`, retrieval APIs, future web-search tools | Summarize or clip before prompt insertion; keep raw output as durable log/evidence when needed |
| File readers | file content extractors, bookmark extraction, future raw file tools | Never auto-inject into prompts outside explicit read flows |
| Tool logs / JSON payloads | large structured tool responses, exports, execution traces | Store preview plus summary in `tool_output_summaries` |
| Conversation exports | long transcript and timeline dumps | Use conversation summaries for prompt context, keep raw export separate |

## Shared Handling Layer

- `backend/openforge/domains/retrieval/tool_output_handling.py`
  - Normalizes structured outputs to strings.
  - Clips previews.
  - Produces a compact summary for large payloads.

## Persistence

- `tool_output_summaries`
  - `tool_name`
  - `call_id`
  - `handling_mode`
  - `preview`
  - `summary`
  - `raw_char_count`
  - `raw_token_estimate`

## Runtime Rule

- Raw large tool outputs must not be appended directly into LLM context in new Phase 4 code.
- Retrieval evidence and tool summaries should be used as the prompt-safe handoff object instead.
