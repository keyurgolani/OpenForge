# Phase 7 Core Model Replacement

## Why `AgentDefinition` Was Removed

`AgentDefinition` collapsed prompt selection, capability access, model choice, memory behavior, safety rules, and output expectations into one flat object. That made every runtime change look like an "agent" change and encouraged hidden special cases.

Phase 7 replaces that model with reusable worker composition:

- `AgentProfileModel` defines identity, role, prompt reference, and modular attachments.
- `CapabilityBundleModel` owns tool, skill, and retrieval affordances.
- `ModelPolicyModel` owns model defaults and override rules.
- `MemoryPolicyModel` owns history and context assembly behavior.
- `SafetyPolicyModel` remains the source of guardrails and approval requirements.
- `OutputContractModel` owns output expectations.

## Active Architecture After Replacement

### Profile

The profile is now the reusable worker object.

- identity: `name`, `slug`, `description`, `role`
- prompt: `system_prompt_ref`
- composition: `capability_bundle_ids`, `model_policy_id`, `memory_policy_id`, `safety_policy_id`, `output_contract_id`
- metadata: `status`, `icon`, `is_system`, `is_template`

### Runtime Resolution

Runtime resolution now happens in two layers:

1. `openforge.runtime.profile_registry` builds resolved runtime profiles from the modular Phase 7 tables.
2. `openforge.domains.profiles.service` exposes API-level resolution, completeness validation, and comparison for builder surfaces.

The runtime no longer depends on `AgentDefinitionModel`, and active prompt resolution now routes through `openforge.domains.prompts.service`.

## What Is Intentionally Not in the Profile Model

The profile model does not own:

- workflow graphs
- mission scheduling
- artifact routing
- multi-step orchestration state
- hidden execution history blobs

Those concerns belong to later workflow, trigger, run, and artifact phases.

## Current Workspace Alignment

The current codebase now reflects this replacement in these places:

- active profile data model: `backend/openforge/db/models.py`
- profile CRUD and inspection APIs: `backend/openforge/domains/profiles/`
- runtime profile registry: `backend/openforge/runtime/profile_registry.py`
- capability/model/memory/output domains:
  - `backend/openforge/domains/capability_bundles/`
  - `backend/openforge/domains/model_policies/`
  - `backend/openforge/domains/memory_policies/`
  - `backend/openforge/domains/output_contracts/`

## Anti-Goals

The replacement is considered broken if the codebase reintroduces:

- a new flat mega-config object that fuses all profile behavior
- runtime-specific branching keyed on special legacy agent types
- prompt or policy state stored inline on the profile instead of referenced modular objects
- scheduling and workflow concerns embedded in the profile record
