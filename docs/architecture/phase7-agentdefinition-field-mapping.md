# AgentDefinition Field Mapping

## Legacy Source

The removed `AgentDefinitionModel` exposed these fields:

- `id`
- `name`
- `description`
- `version`
- `config`
- `is_system`
- `is_default`
- `icon`

## Mapping Rules

| Legacy field | Target | Rule |
|--------------|--------|------|
| `id` | `AgentProfile.slug` or runtime profile key | Keep as the stable profile/runtime identifier when the value names a reusable worker. |
| `name` | `AgentProfile.name` | Move directly. |
| `description` | `AgentProfile.description` | Move directly. |
| `version` | `AgentProfile.version` | Move directly. |
| `config.system_prompt` | `AgentProfile.system_prompt_ref` or managed prompt slug | Replace inline prompt bodies with managed prompt references. |
| `config.tools*` | `CapabilityBundleModel` | Tool enablement, categories, overrides, and skill/tool affordances belong to capability bundles. |
| `config.model*` | `ModelPolicyModel` | Provider/model defaults and override rules belong to model policy. |
| `config.memory*` | `MemoryPolicyModel` | History and retrieval-adjacent memory behavior belongs to memory policy. |
| `config.output*` | `OutputContractModel` | Output shape and validation belongs to output contracts. |
| `config.safety*` | `SafetyPolicyModel` | Safety and approval requirements belong to safety policy. |
| `config.workflow*` | Delete or defer | Workflow/orchestration state is not part of the profile model. |
| `config.schedule*` | Defer to triggers/missions | Scheduling belongs to later trigger and mission layers. |
| `config.artifact_routing*` | Defer to artifact/run phases | Artifact routing is not a profile concern. |
| `is_system` | `AgentProfile.is_system` | Move directly. |
| `is_default` | runtime registry metadata | Keep as runtime seed metadata, not as a special legacy architecture object. |
| `icon` | `AgentProfile.icon` | Move directly. |

## Deletion Rules

Delete the legacy field rather than remapping it when it encoded:

- workflow structure
- schedule execution
- artifact routing
- special hardcoded agent categories
- any hidden runtime state blob

## Result

After the mapping pass, `AgentDefinitionModel` is no longer part of the active schema or migration chain. Profiles are now composed from modular policy and capability objects instead of carrying a fused configuration blob.
