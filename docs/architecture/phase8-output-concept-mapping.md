# Phase 8 Output Concept Mapping

## Mapping Table

| Legacy / Existing Concept | Current Location | Phase 8 Treatment | Notes |
|---|---|---|---|
| Artifact row with inline `content` + integer `version` | `backend/openforge/db/models.py` | `Artifact` + `ArtifactVersion` | Artifact row remains as identity/current snapshot; historical content moves into version rows |
| Target file writes | `tool_server/tools/agent/write_target.py` | Direct artifact type | The tool now upserts `target` artifacts through `/api/v1/artifacts` |
| `workspace.update_target` / `workspace.write_target` aliases | `tool_server/registry.py` | Compatibility alias to artifact-backed behavior | Kept only as alias resolution, not as a separate subsystem |
| Durable mission/run output intended for users | Run/runtime surfaces | Direct artifact type | Should become `report`, `summary`, `plan`, `target`, or another artifact type |
| `RunModel.output_payload` | `backend/openforge/db/models.py` | Operational state, not artifact by default | Keep for transitional runtime state; promote meaningful outputs into artifacts |
| Evidence packet | `EvidencePacketModel` | Artifact link target or artifact type reference | Remains retrieval-owned state; artifact versions may link to it |
| Conversation summary | `ConversationSummaryModel` | Keep outside artifact system | Retrieval/memory substrate, not a first-class user output by default |
| Tool output summary | `ToolOutputSummaryModel` | Keep outside artifact system | Prompt-safe context support, not final durable output |
| Knowledge note/document | `Knowledge` | Usually keep as knowledge | User-provided context is not automatically an artifact |
| Graph entity/relationship provenance | `GraphProvenanceLinkModel` | Artifact lineage link target | Artifacts can point at graph objects without taking over graph provenance ownership |
| Export destination / external sync target | Previously implied or file-path-driven | Artifact sink detail | Storage destination must not define artifact identity |

## Classification Rules

### Direct artifact type

Use an artifact type when the output is intended to be browsed, versioned, or reused as a durable product object.

### Artifact version transition

Use a new artifact version when the material content changes, even if the artifact identity stays the same.

### Artifact sink detail

Use an artifact sink when the question is "where does this artifact live or sync," not "what is this output."

### Delete entirely

Delete the behavior when it exists only to preserve a separate durable output path that the artifact system now replaces.

### Defer

Defer only for collaborative editing, advanced publishing, or later mission/workflow runtime work not required for the Phase 8 foundation.
