# Phase 8 Artifact System Replacement

## Why This Replacement Exists

OpenForge already established `Artifact` as a canonical product noun in Phase 1, but the implementation was still only a thin CRUD wrapper over a single `artifacts` table. Durable output behavior remained fragmented across:

- legacy-compatible target writing in `tool_server/tools/agent/write_target.py`
- run-local `output_payload` blobs in `backend/openforge/db/models.py`
- artifact content overwrites hidden behind a single `version` integer
- output-adjacent retrieval and graph records with no artifact lineage link surface

Phase 8 replaces that fragmented output handling with one explicit artifact system built around:

- `ArtifactModel`
- `ArtifactVersionModel`
- `ArtifactLinkModel`
- `ArtifactSinkModel`

## Final Artifact Boundaries

### What becomes an artifact

An output should become an artifact when it is a meaningful durable product object that users or operators may want to inspect, compare, publish, revisit, or derive from later.

Current first-pass artifact categories include:

- `note`
- `summary`
- `report`
- `plan`
- `target`
- `evidence_packet_ref`
- `research_brief`
- `dataset`
- `alert`
- `experiment_result`
- `notification_draft`
- `generic_document`

### What remains non-artifact operational state

These records stay outside the artifact domain unless a later workflow explicitly promotes them into artifacts:

- `RunModel.state_snapshot`
- `RunModel.input_payload`
- `RunModel.output_payload`
- `ToolOutputSummaryModel`
- `ConversationSummaryModel`
- `RetrievalQueryModel`

These are durable supporting records, but they are not automatically first-class product outputs.

### What remains source/supporting state but is artifact-linkable

These records may inform or relate to artifacts without being replaced by artifacts:

- `EvidencePacketModel`
- `EntityModel`
- `RelationshipModel`
- `GraphProvenanceLinkModel`
- `Knowledge` records in `backend/openforge/db/models.py`

## Core Phase 8 Model

### Artifact

`ArtifactModel` owns durable output identity and product-level metadata:

- type
- workspace
- title
- summary
- status
- visibility
- creation mode
- source references
- current version pointer
- tags

### Artifact Version

`ArtifactVersionModel` owns material content history:

- version number
- content type
- body text
- structured payload
- summary snapshot
- change note
- source evidence/run references

Material content changes must create new versions rather than silently overwriting the current state.

### Artifact Link

`ArtifactLinkModel` owns lineage and provenance links to:

- runs
- workflows
- missions
- profiles
- evidence packets
- knowledge
- entities
- relationships
- other artifacts

### Artifact Sink

`ArtifactSinkModel` keeps destination state separate from artifact identity:

- internal workspace
- knowledge-linked
- file export
- external placeholder

## Relationship to Other Domains

### Runs

Runs still own operational execution state. When a run produces a durable user-facing output, that output should be represented as an artifact and linked back to the run through `ArtifactLinkModel` and the top-level source fields on `ArtifactModel`.

### Workflows and Missions

Workflows and missions do not own artifact storage semantics. They emit outputs into the artifact domain and reference artifact types as output intent only.

### Knowledge and Retrieval

Knowledge remains source material. Retrieval remains evidence assembly and prompt-safe context behavior. Artifact versions can link to evidence packets or knowledge objects without collapsing those domains together.

### Graph

Artifacts can link to graph entities or relationships, but graph extraction and provenance remain graph-domain concerns.

## Anti-Goals

The Phase 8 replacement is incomplete if any of the following reappear in active architecture paths:

- a separate durable target subsystem
- artifact-less durable user outputs
- file-path-only durable identity
- silent destructive overwrites of material artifact content
- hidden output routing inside unrelated services

## Active Replacement Path

Phase 8 implementation in this repo follows this replacement path:

1. Extend the existing artifact domain rather than creating a parallel subsystem.
2. Backfill the legacy `artifacts` rows into `artifact_versions`.
3. Replace the filesystem target writer with artifact-backed upsert behavior.
4. Expose versions, lineage, and sinks through the artifact router.
5. Expand the frontend artifact surface to browse outputs as first-class product objects.

Contributor guardrails for future output work live in `docs/development/artifact-output-rules.md`.
