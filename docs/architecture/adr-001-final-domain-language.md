# ADR-001: Final Domain Language

## Status

**Accepted**

## Context

OpenForge has evolved from an agent-centric architecture to a more sophisticated model involving workflows, missions, and profiles. The current terminology creates confusion because:

1. "Agent" is overloaded - it refers to both the configuration and the running instance
2. "Hand" was previously used but doesn't clearly communicate purpose
3. "Schedule" and "Target" don't align with the final product model
4. The top-level product organization doesn't reflect how users should think about the system

We need to establish a clear, consistent domain vocabulary that:
- Aligns with user mental models
- Supports the future architecture
- Prevents ambiguity in code and product discussions

## Decision

We adopt the following **canonical domain nouns** as the final product vocabulary:

### Core Domain Nouns

#### Profile (Agent Profile)
- **What it is**: A worker abstraction that defines capabilities, prompts, and behaviors
- **What it contains**: System prompts, model policies, memory policies, safety policies, capability bundles, output contracts
- **What it is NOT**: A standalone deployable product unit
- **User-facing label**: "Profile" or "Agent Profile"
- **Route segment**: `/profiles`
- **API prefix**: `/api/v1/profiles`

#### Workflow (Workflow Definition)
- **What it is**: A composable execution graph that defines how tasks are performed
- **What it contains**: Nodes, edges, state schema, input/output schemas, entry point
- **What it is NOT**: A runtime instance
- **User-facing label**: "Workflow"
- **Route segment**: `/workflows`
- **API prefix**: `/api/v1/workflows`

#### Mission (Mission Definition)
- **What it is**: A packaged autonomous unit that users deploy
- **What it contains**: Workflow reference, profile references, trigger references, autonomy mode, approval policy, budget policy, output artifact types
- **What it is NOT**: Just a configuration - it's the product unit
- **User-facing label**: "Mission"
- **Route segment**: `/missions`
- **API prefix**: `/api/v1/missions`

#### Trigger (Trigger Definition)
- **What it is**: An automation rule that initiates mission execution
- **What it contains**: Trigger type (schedule/event/webhook/manual), target reference, schedule expression, payload template
- **What it is NOT**: A general-purpose scheduling concept
- **User-facing label**: "Trigger"
- **Route segment**: `/triggers`
- **API prefix**: `/api/v1/triggers`

#### Run
- **What it is**: An execution instance of a workflow or mission
- **What it contains**: Execution state, input/output payloads, error information, timestamps
- **What it is NOT**: A configuration
- **User-facing label**: "Run"
- **Route segment**: `/runs`
- **API prefix**: `/api/v1/runs`

#### Artifact
- **What it is**: An output produced by a mission run
- **What it contains**: Content, metadata, version history, source references
- **What it is NOT**: Temporary execution data
- **User-facing label**: "Artifact"
- **Route segment**: `/artifacts`
- **API prefix**: `/api/v1/artifacts`

#### Knowledge
- **What it is**: User-provided context and data for AI processing
- **What it contains**: Documents, notes, bookmarks, files, insights
- **What it is NOT**: System-generated outputs (those are Artifacts)
- **User-facing label**: "Knowledge"
- **Route segment**: `/knowledge`
- **API prefix**: `/api/v1/knowledge`

### Explicit Rejections

#### "Hand" is REJECTED as a product term
- **Reason**: The term doesn't clearly communicate purpose to users
- **Replacement**: Use "Mission" for the packaged autonomous concept
- **Migration**: Any existing "Hand" references should be updated to "Mission"

#### "Agent" is NOT a top-level product noun
- **Reason**: "Agent" is a generic term for AI behavior, not a specific product unit
- **Replacement**: 
  - Use "Profile" when referring to the worker configuration
  - Use "Mission" when referring to the deployed autonomous unit
- **Allowed uses**: 
  - Describing the overall product as "agentic"
  - Chat copy where "AI agent" is generic language
- **Not allowed**: Making "Agents" the top-level product IA

#### "AgentDefinition" is replaced
- **Replacement**: Use "AgentProfile" or "Profile"
- **Migration**: Update all references to use the new terminology

#### "AgentSchedule" is replaced
- **Replacement**: Use "Trigger"
- **Migration**: Update all references to use the new terminology

#### "ContinuousTarget" is replaced
- **Replacement**: Use "Artifact" or "Mission output" depending on context
- **Migration**: Update all references to use the new terminology

### Relationship Model

```
Profile (worker configuration)
    ↓
Workflow (execution graph)
    ↓
Mission = Workflow + Profile(s) + Trigger(s) + Policies
    ↓
Trigger → initiates → Run
    ↓
Run → produces → Artifact
```

### User Mental Model

Users should think:
1. "I create **Profiles** to define AI worker capabilities"
2. "I build **Workflows** to define how tasks are executed"
3. "I deploy **Missions** that combine workflows, profiles, and triggers"
4. "My **Triggers** determine when missions run automatically"
5. "I can see **Runs** to monitor execution"
6. "My **Artifacts** are the outputs produced by missions"
7. "My **Knowledge** is the context I provide to the AI"

## Consequences

### Positive
- Clear, consistent terminology across codebase and UI
- Users have a understandable mental model
- Future development has stable vocabulary to build on
- Code organization reflects product organization

### Negative
- Existing code using old terminology needs migration
- Users familiar with old terminology need to learn new terms
- Documentation needs updating

### Neutral
- Backend and frontend must both import from vocabulary files
- All new code must use canonical terms

## Implementation

1. **Vocabulary modules created**:
   - `backend/openforge/core/product_vocabulary.py`
   - `frontend/src/lib/productVocabulary.ts`

2. **All new code** must reference these vocabulary modules for:
   - Domain names
   - User-facing labels
   - Route segments
   - API prefixes

3. **Legacy code** will be marked with deprecation notices and migrated incrementally

## References

- Phase 1 Implementation Plan: `sdlc/Phase1Plan.md`
- Product Vocabulary (Backend): `backend/openforge/core/product_vocabulary.py`
- Product Vocabulary (Frontend): `frontend/src/lib/productVocabulary.ts`
