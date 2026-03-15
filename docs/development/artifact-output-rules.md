# Artifact Output Rules

Phase 8 establishes `Artifact` as the only durable product output model in OpenForge.

## Contributor Rules

- Promote meaningful durable outputs into the artifact domain instead of creating new output-specific tables or services.
- Keep artifact identity separate from storage or publication destination. Use sinks for export, file, knowledge, or external routing state.
- Treat material content changes as versioned changes. Do not silently overwrite artifact bodies or structured payloads in place.
- Capture provenance as first-class links when an artifact is produced by a run, mission, workflow, profile, evidence packet, knowledge item, entity, relationship, or another artifact.
- Preserve `target` only as an artifact type. Do not recreate a separate target subsystem, target writer, or target-only persistence path.
- Do not use file paths as durable product identity. Files may be sinks, not the artifact itself.
- Keep orchestration logic in run, workflow, and mission domains. The artifact domain should own durable output identity, lifecycle, lineage, versioning, and sink state only.

## Review Checklist

- Is this durable output represented as an artifact instead of an ad hoc blob or new table?
- If content changed materially, does the implementation create a new artifact version?
- Are lineage and provenance links explicit rather than hidden inside unstructured metadata?
- Is destination state modeled as a sink instead of being fused into artifact type or identity?
- Does the change accidentally reintroduce legacy target-specific behavior?
