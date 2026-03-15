# Phase 8 Legacy Output Inventory

## Active Durable Output Paths Reviewed

### 1. Artifact CRUD surface

- Location: `backend/openforge/domains/artifacts/`
- Prior state: single-table CRUD with inline content and no explicit lineage/sink/version records
- Phase 8 action: upgraded in place with version, lineage, and sink models

### 2. Legacy-compatible target writing

- Location: `tool_server/tools/agent/write_target.py`
- Prior state: wrote markdown files to a dedicated target filesystem path
- Phase 8 action: replaced with artifact-backed create/update behavior through the artifact API
- Result: no separate filesystem durable output path remains in the active tool implementation

### 3. Run output payloads

- Location: `RunModel.output_payload` in `backend/openforge/db/models.py`
- Prior state: generic JSON blob for runtime output
- Phase 8 action: keep as operational runtime state
- Guardrail: meaningful user-facing outputs should be promoted into artifacts rather than left as opaque terminal blobs

### 4. Retrieval evidence packets

- Location: `EvidencePacketModel` and `backend/openforge/domains/retrieval/`
- Prior state: durable retrieval evidence record
- Phase 8 action: keep as retrieval-owned support state and allow artifact lineage links to evidence packets

### 5. Tool output summaries

- Location: `ToolOutputSummaryModel`
- Prior state: durable prompt-safe summaries for large tool outputs
- Phase 8 action: keep as retrieval/runtime support state, not a first-class product output

### 6. Conversation summaries

- Location: `ConversationSummaryModel`
- Prior state: durable conversation memory snapshots
- Phase 8 action: keep in retrieval/memory foundations, not in the artifact domain by default

## Legacy Paths Already Removed Before Phase 8

These older target surfaces were already deleted or quarantined in earlier phases and therefore are not active replacement work in this pass:

- `targets_api.py`
- `target_service.py`
- `ContinuousTarget` product language

## Remaining Guardrails

The inventory should be considered healthy only if these rules keep holding:

- new durable output flows go through the artifact domain
- file paths are treated as sinks, not as artifact identity
- run-local blobs stay transitional/operational unless explicitly promoted
- new target-specific persistence does not reappear outside artifact APIs
