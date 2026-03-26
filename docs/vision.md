# OpenForge Vision

This document describes the complete product vision for OpenForge: how every entity is defined, how they interact, how they behave, and how users experience the system. It serves as the canonical reference for all future development.

The Agents page, Chat page, and their underlying implementations are considered **stable and authoritative** -- this document describes them as-is. The Automations, Deployments, and Sinks sections describe the **target architecture** that the system is evolving toward.

---

## 1. Core Entity Hierarchy

| Entity | Role | Scope | Listing View |
|--------|------|-------|--------------|
| **Agent** | A structured blueprint defining what an agent does, what inputs it needs, what outputs it produces. Also serves as the node type in automations. | Global (workspace-agnostic) | Agents page |
| **Sink** | A first-class entity defining what happens with agent output values. Accepts output variables from agent nodes and drives an action (create/update knowledge, call a REST API, send a notification, write an article, log to history). | Global | Sinks page (replaces the current Outputs page) |
| **Automation** | A DAG workflow built by wiring agent nodes and sink nodes together on a drag-and-drop canvas. Defines a reusable flow. Does nothing until deployed. | Global | Automations page |
| **Deployment** | A live instance of an automation, created when a user deploys it with concrete input values and an attached trigger. | Global | Deployments page |
| **Run** | A single execution of a deployment. | Global | Runs page |
| **Chat** | A direct, one-off agent invocation via the conversational UI. No hidden automations or deployments -- the agent executes directly through the chat handler with a chat-specific preamble/postamble. | Global | Chats page |

### Entity Relationships

```
Agent Definition
  |-- version snapshots (immutable, one per save)
  |-- used as nodes in Automations
  |-- invoked directly via Chat

Automation (DAG definition)
  |-- contains Agent Nodes (referencing Agent Definitions)
  |-- contains Sink Nodes (referencing Sink types)
  |-- wiring: agent outputs -> agent inputs, agent outputs -> sinks
  |-- does nothing until deployed

Deployment (live instance)
  |-- instantiates one Automation
  |-- has concrete input values + trigger
  |-- creates Runs when triggered

Run (single execution)
  |-- tracks steps, events, outputs
  |-- child runs for multi-node automations

Chat (direct agent execution)
  |-- selects an Agent + optional model override
  |-- agent executes via ChatHandler with CHAT-context prompts
  |-- no automation/deployment/run artifacts created
```

### Listing Boundaries

- **Chats page**: History of direct agent invocations only. No automation-related entries.
- **Runs page**: History of automation deployment executions only. No chat entries.
- **Deployments page**: Currently scheduled/executing automation instances.
- **Automations page**: Automation definitions (reusable blueprints).
- **Agents page**: All agent definitions in the system.
- **Sinks page**: All sink definitions (replaces the current Outputs page).

---

## 2. Workspaces

A workspace is the root isolation boundary for knowledge. Workspaces are the **only** workspace-scoped concept. All other top-level entities (agents, sinks, automations, deployments, chats) are workspace-agnostic.

### Workspace Properties

- **Identity**: name, description, icon
- **LLM overrides**: workspace-specific model assignments for chat, intelligence, vision
- **Dedicated workspace agent**: an `AgentDefinition` record automatically seeded at workspace creation. Cannot be deleted without deleting the workspace. Independently configurable per workspace.
- **Knowledge**: all knowledge items within a workspace are scoped to it
- **Conversations**: workspace-scoped conversations for chat history
- **Settings overrides**: per-workspace model configuration

### Workspace Agents in Chat

In the chat agent selection list, one workspace agent per workspace appears alongside all global agents. This lets users chat directly with any workspace's dedicated agent from the same UI.

---

## 3. Knowledge

Knowledge items are always scoped to a workspace.

### Knowledge Types

note, fleeting note, bookmark, gist, image, audio, pdf, document, sheet, slides

### Knowledge Processing Pipeline

1. **Creation**: manual entry (note/bookmark/gist) or file upload (images, audio, PDFs, Office documents)
2. **Content extraction**: bookmarks scraped via Jina Reader (Chromium fallback); documents processed per type
3. **AI intelligence generation**: LLM generates title, summary, structured insights (tasks, facts, key things, timelines, tags)
4. **Vector embedding**: hybrid multi-representation strategy in Qdrant
   - Dense vectors (384-dim, BGE-small) for semantic similarity
   - Sparse vectors (BM25) for keyword matching
   - Summary vectors for document-level matching
5. **Search**: 4-representation hybrid retrieval (dense + sparse + summary + RRF fusion) with optional cross-encoder reranking, always filtered by `workspace_id`

---

## 4. Agents

### 4.1 Agent Definition Model

An agent is a structured, well-defined entity with explicit typed fields. The backend defines these fields and the UI generates appropriate input elements. **Not** free-form markdown parsed into a model.

| Field | Type | Description |
|-------|------|-------------|
| **name** | string | Human-readable agent name |
| **slug** | string (unique) | URL-friendly identifier, auto-generated from name |
| **description** | string (optional) | What the agent does |
| **icon** | string (optional) | Icon reference |
| **tags** | string[] | Categorization labels (e.g., "chat", "research", "review") |
| **system_prompt** | text | Parameterized template with injectable variables and snippets |
| **llm_config** | object | `{ provider, model, temperature, max_tokens, allow_override }` |
| **tools_config** | array | Per-tool access: `{ name, category, mode: "allowed" | "hitl" }` |
| **memory_config** | object | `{ history_limit, attachment_support, auto_bookmark_urls }` |
| **parameters** | array | Typed input parameters (see below) |
| **output_definitions** | array | Structured output definitions (see below) |
| **active_version_id** | UUID | Points to the latest immutable version snapshot |

### 4.2 Input Parameters

Each parameter defines an execution-time input. Parameters serve as:
- Template variables in the system prompt (e.g., `{{topic}}`)
- Input ports when used as automation nodes
- Values extracted from chat messages at runtime

| Property | Type | Description |
|----------|------|-------------|
| name | string | Parameter name |
| type | "text" \| "enum" \| "number" \| "boolean" | Data type |
| label | string (optional) | Display label |
| description | string (optional) | What this input is for |
| required | boolean | Whether the value must be provided |
| default | any | Default value if not provided |
| options | string[] | Valid choices (for enum type only) |

### 4.3 Output Definitions

Each output defines a structured result the agent produces. The system uses these to construct the response format that the LLM must follow, enabling reliable extraction of output variables from raw text.

| Property | Type | Description |
|----------|------|-------------|
| key | string | Output variable key |
| type | "text" \| "json" \| "number" \| "boolean" | Data type |
| label | string (optional) | Display label |
| description | string (optional) | What this output contains |
| schema_def | object (optional) | JSON schema for complex types |

### 4.4 Workspace Scope

Agents are **workspace-agnostic** -- they exist globally and are not tied to any workspace.

**Exception: workspace agents.** Each workspace gets its own `AgentDefinition` record, automatically seeded at workspace creation. A workspace agent cannot be deleted unless the entire workspace is deleted.

For workspace-agnostic agents:
- The system **never** decides which workspace context to use for the user
- Agents receive workspace names, descriptions, and IDs via the application system prompt (postamble), enabling them to query specific workspaces by ID
- `workspace_id` is a **mandatory** input for the workspace search tool -- agents must explicitly choose which workspace to search

### 4.5 Tool Configuration

On the agent detail page, users see all available tools and configure each tool's access mode:

| Mode | Behavior |
|------|----------|
| **Allowed** | Executes immediately when the agent calls it |
| **HITL** | Requires user approval before execution |

Default behavior (no user overrides):
- All tools are **allowed** by default
- A small set of sensitive tools defaults to **HITL**
- **No** tools default to blocked/not-allowed

### 4.6 Version Snapshots

Every create/update auto-creates an immutable version snapshot. The `active_version_id` points to the latest. Old versions are retrievable via API for audit and rollback. Version snapshots capture all 10+ config fields at the moment of save.

### 4.7 Agent Detail Page UI (Current Implementation)

**Three-column layout:**

1. **Main content** (flex-[4]):
   - Header: editable name, slug (auto-generated toggle), description
   - Parameters + Outputs grid (2-column): add/remove rows, type selectors, field editors
   - System prompt editor (CodeMirror): syntax highlighting for `{{ }}` and `{% %}`, autocomplete, read-only preamble/postamble sections

2. **Template variables sidebar** (flex-[1]):
   - Detected variables from current template content
   - System-provided variables grouped by category
   - Output variable references (`output.*`)
   - Built-in functions with signatures (categorized, collapsible)
   - Syntax reference

3. **Config siderail** (collapsible, resizable):
   - LLM Config: provider/model dropdowns, temperature slider, max tokens, allow override
   - Tools Config: category grouping, per-tool Off/On/HITL toggles
   - Memory Config: history limit, attachment support, auto-bookmark URLs
   - Tags: chip-based tag management
   - Timeline: created/updated timestamps, version selector for viewing historical snapshots

**Modes**: Create (`/agents/new`), View (read-only), Edit (toggleable), Version viewing (read-only snapshot overlay)

---

## 5. Agent System Prompt Architecture

### 5.1 Prompt Structure

Every agent's system prompt has three sections:

1. **Preamble** (read-only, visible as syntax-highlighted template code) -- placed at the start
2. **User-editable section** -- the core agent instructions, behavior guidance, and custom logic
3. **Postamble** (read-only, visible as syntax-highlighted template code) -- placed at the end

The preamble and postamble are **template-driven** (using the same template engine available to users) and their content **varies based on execution context**.

### 5.2 Context-Aware Preamble/Postamble

The system generates different preamble/postamble content depending on whether the agent is running in chat or automation context.

**CHAT context** (direct agent invocation via Chat page):
- Preamble: agent identity, platform notice, response guidelines ("write clear markdown, do NOT wrap in JSON"), input values listed as key-value pairs, output guidance as content topics (not JSON format)
- Postamble: workspace context, available agents for delegation, skills, tooling, platform entity context (see below)

**AUTOMATION context** (agent node inside a deployed automation):
- Preamble: agent identity, input variable definitions with types/descriptions, output variable definitions with structured JSON format instructions
- Postamble: same workspace/agent/skills/tooling/platform entity context

This removes the need for chat to involve sinks at all. Chat agents respond conversationally. Automation agents produce structured output matching `output_definitions` exactly.

### 5.2.1 Platform Entity Context in Postamble

The postamble includes knowledge about OpenForge's native entities so that agents (particularly in chat) can manage the platform through tools:

- **Automations**: what an automation is (a DAG of agent nodes and sink nodes with wiring), how the graph structure works (nodes, edges, static inputs, unfilled inputs become deployment inputs), and that automations do nothing until deployed
- **Sinks**: what sink types are available, what each type does, what configuration each type requires, and how sinks wire to agent output variables
- **Deployments**: what a deployment is (a live instance of an automation with concrete inputs and a trigger), what trigger types exist (manual, cron, interval), and the deployment lifecycle (deploy, pause, resume, tear down)
- **Agents**: what agents look like (identity, parameters, output definitions, system prompt, tools config), so agents can reason about composing other agents into automations

This context enables agents to use the `platform` tools (see section 12.1) to create automations, define sinks, deploy automations, and manage deployments -- all from a chat conversation.

### 5.3 Template Variables

Three categories of variables are available:

**User-defined variables** -- from the agent's input parameters. Filled at execution time from chat input extraction, automation wiring, or deployment input values.

**System-provided variables** (auto-populated at runtime, no input source needed):
- `system.workspaces` -- list of workspaces with id, title, description
- `system.agents` -- list of available agents with id, name, slug, description, parameters, output_definitions
- `system.automations` -- list of automations with id, name, status, node count, deployment input schema
- `system.sinks` -- list of defined sink types with id, name, type, configuration schema
- `system.deployments` -- list of active deployments with id, automation name, trigger type, status
- `system.skills` -- list of available skills with content
- `system.tools` -- list of available tools
- `system.output_definitions` -- list of the agent's own output variables
- Date/time utilities

**Output variable references** -- users can reference output variables in the editable section to guide the agent: `{{output.analysis_result}}`

### 5.4 Template Engine

The template engine supports:
- **Variables**: `{{variable}}`, `{{system.workspaces}}`, `{{output.key}}`
- **Loops**: `{% for ws in system.workspaces %}...{% endfor %}`
- **Conditionals**: `{% if condition %}...{% elif %}...{% else %}...{% endif %}`
- **Property access**: `{{ws.id}}`, `{{ws.title}}`
- **Built-in functions**: 40+ functions across string, array, math, type, date/json, logic categories
- **Type indicators**: `{{var::number}}`, `{{var::[option1, option2]}}`
- **Comments**: `{# comment #}`

All functions and variables are documented in the reference sheet displayed beside the editor.

### 5.5 Editor UI

The system prompt editor displays:
- The preamble (read-only, collapsible, syntax-highlighted template code)
- The editable section (CodeMirror with autocomplete, highlighting, line numbers)
- The postamble (read-only, collapsible, syntax-highlighted template code)
- A **reference sheet** beside the editor listing all system variables, functions, loop syntax, and output references

---

## 6. Chat (Direct Agent Execution)

Chat is the workspace-agnostic space for one-off agent interactions. **No hidden automations, deployments, or runs are created.** The agent executes directly through the ChatHandler with CHAT-context preamble/postamble.

### 6.1 Agent Selection

The Chat page presents:
- A list of all available agents, including one workspace agent per workspace
- An LLM model selection dropdown for per-conversation override
- Agent cards that expand on selection to show input parameters and descriptions
- A "Start Chat" action that creates a conversation and navigates to the chat UI

### 6.2 Input Extraction Flow

1. User sends a message
2. The LLM analyzes the prompt to extract values for the agent's input parameters
3. If not all required values can be determined, the LLM asks follow-up questions conversationally
4. Once all inputs are filled, the agent is invoked with the rendered system prompt

### 6.3 Chat UI Layout

- **User messages**: right-aligned bubbles with avatar initial, attachments as chips
- **Agent responses**: left-aligned with timeline visualization
- **Message width**: max 90% of available conversation width
- **Composer**: bottom-fixed input with send/cancel, file attachment, model picker
- **Scroll behavior**: auto-scroll to bottom during streaming; user scroll-up stops auto-scroll; scrolling back to bottom re-enables it

### 6.4 Agent Response Rendering

When the user sends a message:

1. **Responding phase**: A glowing/shimmering "Responding..." animation appears on the agent side

2. **Timeline events**: As the agent event loop streams events, each appears in a vertical timeline:

   **Thinking events**:
   - *Streaming*: animated shimmer ticker cycling through buffered thought sentences (one sentence per ~1-2 seconds)
   - *Streamed/Complete*: collapsed card showing "> Thought for N.M seconds", expandable to show full text
   - Clicking the thought sentence during streaming opens the full thinking text

   **Tool call events**:
   - *Streaming*: auto-expanded card showing live preview of tool execution
   - *Streamed*: stays visible for 1.5 seconds, then auto-collapses to a summary (tool name + key input like search query, URL, workspace name)
   - *Complete*: collapsed card, expandable to see full details
   - User can manually expand any card; it stays expanded until the user collapses it

   **Sub-agent invocation events**:
   - Same lifecycle as tool calls
   - Shows nested timeline recursively (up to depth 3)
   - Displays agent name/slug, step count, and duration

   **HITL approval events**:
   - Shows approval card with approve/deny buttons
   - Composer remains usable while awaiting approval
   - Notification banner at top of chat

3. **Response text**: streams bare into the conversation UI with markdown rendering. The final response does not include intermediate text from mid-loop agent messages.

### 6.5 Streaming Architecture (4-Layer Pipeline)

| Layer | Hook | Responsibility |
|-------|------|----------------|
| **Ingestion** | `useAgentStream` | Translates raw WebSocket events to typed emitter events |
| **Phase Coordination** | `useAgentPhase` | Manages agent phase state machine (idle -> thinking -> draining_thoughts -> tool_calling/awaiting_approval -> responding -> complete/error), coordinates thought queue drain with response token buffering |
| **Stream Rendering** | `useStreamRenderer` | Renders streamed tokens to display text with RAF-based frame smoothing |
| **Thought Queue** | `useThoughtQueue` | Stagger-displays thinking sentences with configurable timing, signals drain completion to phase coordinator |

**Phase state machine**:
```
idle -> thinking -> draining_thoughts -> responding -> complete
                 -> tool_calling -> thinking (loop)
                 -> awaiting_approval -> tool_calling (after approval)
                                      -> error (after denial)
```

### 6.6 Stream State Persistence

While streaming is ongoing, the full state (content, thinking, tool calls, timeline) is persisted to Redis. When a user refreshes or navigates away and returns, the UI reconstructs the current live view from the stream state snapshot.

### 6.7 WebSocket Architecture

Each chat conversation gets its own WebSocket connection (`ws/chat/{conversation_id}/agent`). Events flow: ChatHandler -> Redis pub/sub -> WebSocket relay -> frontend event pipeline.

### 6.8 Conversation Management

- Conversations are listed in a sidebar with categories: recent, delegated, trash
- Actions: rename (click title), archive, delete (soft -> trash), permanently delete, export (JSON/Markdown/text)
- Bulk operations: trash all, restore all from trash, permanently delete all
- Auto-title generation via LLM after each assistant response

---

## 7. Sinks (Target Architecture)

Sinks are **first-class entities** that define what happens with agent output values. They replace the current "Outputs" entity and get their own management page (replacing the current Outputs page).

### 7.1 How Sinks Work

1. Agent definitions define **output variables** (the data the agent produces)
2. In AUTOMATION context, the agent produces structured output matching `output_definitions`
3. A sink accepts one or more output variables from one or more agent nodes and drives an action

### 7.2 Sink Types

| Sink Type | Action | Configuration |
|-----------|--------|---------------|
| **Article** | Writes a document to the filesystem | Output format, file path/naming |
| **Knowledge Create** | Creates a new knowledge item in a workspace | Target workspace, knowledge type, field mappings |
| **Knowledge Update** | Updates an existing knowledge item | Target workspace, knowledge ID, field mappings |
| **REST API** | Calls an external HTTP endpoint | URL, method, headers, variable-to-parameter mappings |
| **Notification** | Sends a notification | Channel/destination, message template |
| **Log** | Records to the run/output history | Default logging behavior |

### 7.3 Sink Wiring in Automations

- Sink nodes are dragged from a predefined list of sink types onto the automation canvas
- Users wire agent output variables to sink input ports
- A single sink can accept outputs from **multiple agents** and **multiple output variables**
- Example: a REST API sink could map `body.field1` from Agent A's `summary` and `body.field2` from Agent B's `analysis`

---

## 8. Automations (Target Architecture)

Automations are **drag-and-drop DAG workflows** built on a node canvas.

### 8.1 Node Types

**Agent nodes**: Dragged from the available agents list. Each node's interface is defined by its agent definition's input parameters (input ports) and output definitions (output ports).

**Sink nodes**: Dragged from a predefined list of sink types. Accept output variables from agent nodes.

### 8.2 Wiring Rules

- Connect output variables of one agent node to input variables of another agent node
- Connect output variables of agent nodes to sink node inputs
- Fill any agent input with a **static value** instead of wiring it
- Any agent input that is **neither wired nor given a static value** becomes a **mandatory deployment input** -- the user must provide it when deploying

### 8.3 Node Configuration (Automation-Domain Concerns)

When an agent is placed as a node, these settings are configured within the automation (not on the agent definition):

- Execution timeout
- Retry policy
- Concurrency limits
- Parallelism (whether the node can run in parallel with others at the same DAG level)
- UI hints (position, color on the canvas)

### 8.4 Automation Lifecycle

An automation definition is a **reusable blueprint**. It does nothing until deployed.

The definition captures:
- The full DAG: agent nodes, sink nodes, all wiring and static values
- Node-level configuration (timeouts, retry, concurrency, parallelism, UI hints)
- The **derived deployment input schema**: all unwired/unfilled inputs across all nodes

### 8.5 Graph Validation

Before deployment, the automation graph is validated:
- DAG structure (no cycles)
- All required inputs are either wired, given static values, or exposed as deployment inputs
- All referenced agents exist and have compatible output/input types
- Sink wiring is valid for the sink type

### 8.6 Execution (GraphExecutor)

When a deployment fires:
1. Load the compiled automation spec
2. Build AUTOMATION-context preamble/postamble for each agent node
3. Topologically sort nodes into execution levels
4. Execute each level:
   - Resolve inputs for each node (wired outputs from previous nodes, static values, deployment inputs)
   - Render the agent's system prompt template with resolved values
   - Execute the agent via the strategy executor
   - Extract structured output from the response
   - Pass outputs to the next level's wired inputs
5. Route final outputs to sink nodes
6. Sink nodes execute their configured actions

---

## 9. Deployments (Target Architecture)

A deployment is a **live instance** of an automation.

### 9.1 Deployment Creation

Even if an automation definition includes scheduling intent, **nothing executes until the user explicitly deploys it**.

At deployment time:
1. The system presents a form with all mandatory inputs (derived from the automation's deployment input schema)
2. The user provides values for all mandatory inputs
3. The user attaches a **trigger**
4. The deployment is created and begins executing per the trigger

### 9.2 Triggers

Every deployment must have a trigger attached.

| Trigger Type | Behavior |
|--------------|----------|
| **Manual** | On-demand only -- user clicks "Run Now" |
| **Schedule (Cron)** | Fires on a cron expression (e.g., `0 9 * * 1`) |
| **Interval** | Fires every N seconds/minutes/hours |

Future trigger types (not yet implemented):
- Event-driven from knowledge changes
- Event-driven from messaging platforms (Slack, Discord, Telegram, WhatsApp)

### 9.3 Deployment Lifecycle

| Action | Effect |
|--------|--------|
| **Deploy** | Creates the deployment, starts trigger |
| **Pause** | Disables trigger, no new runs |
| **Resume** | Re-enables trigger |
| **Tear down** | Permanently stops the deployment |
| **Run Now** | Immediate one-off execution of an active deployment |

### 9.4 Input Handling

- Single-agent automations: parameter names directly (e.g., `query`)
- Multi-node automations: composite keys (e.g., `node-key.param_name`)
- Template rendering happens during run creation for parameterized agents

---

## 10. Runs

A run is a single execution of a deployment.

### 10.1 Run Properties

- **Status**: pending, running, completed, failed, cancelled, waiting_approval, interrupted
- **Hierarchy**: runs form trees via parent_run_id for multi-node automations (one child run per node)
- **Tracking**: steps, events, checkpoints, emitted outputs
- **Metadata**: input/output payloads, duration, token usage, cost estimates, error details

### 10.2 Run Steps

Each step tracks:
- Step index and node key
- Status (pending, running, completed, failed)
- Input and output snapshots
- Checkpoint linking for resumability
- Error details

### 10.3 Runtime Events

Events logged during execution:
- artifact_emitted, approval_requested, run_interrupted
- Each event has a typed payload

### 10.4 Checkpoints and Replay

Checkpoints capture state snapshots at step boundaries, enabling:
- Resume from failure
- Replay from a specific step
- Debugging execution flow

---

## 11. WebSocket Architecture

Each independent concern uses its own dedicated WebSocket connection:

| Connection | Endpoint | Purpose |
|------------|----------|---------|
| Chat agent | `ws/chat/{conversation_id}/agent` | Agent events for a specific conversation |
| Workspace agent | `ws/workspace/{workspace_id}/agent` | Agent events scoped to workspace |
| Workspace system | `ws/workspace/{workspace_id}/system` | Knowledge updates, HITL events |
| Settings | `ws/settings` | Settings and system status |

Events flow through Redis pub/sub for Celery worker decoupling: Worker -> Redis channel -> WebSocket relay -> Frontend.

---

## 12. Tool System

### 12.1 Built-in Tools

| Category | Tools | Purpose |
|----------|-------|---------|
| **filesystem** | read_file, write_file, list_directory, search_files, file_info, move_file, delete_file | File operations |
| **shell** | execute, execute_python | Command execution |
| **git** | status, log, diff, add, commit, init | Version control |
| **language** | parse_ast, find_definition, find_references, apply_diff | Code analysis |
| **memory** | store, recall, forget | Agent memory |
| **http** | get, post, fetch_page, search_web | Web access (SearXNG) |
| **task** | create_plan, get_plan, update_step | Task management |
| **skills** | install, list_installed, read, remove, search | Skill management |
| **platform.workspace** | search, save_knowledge, list_knowledge, delete_knowledge, list_workspaces, get_workspace | Workspace and knowledge access |
| **platform.agent** | invoke, list_agents, get_agent, list_chats, read_chat | Agent delegation and management |
| **platform.automation** | list, get, create, update, delete | Automation definition CRUD |
| **platform.deployment** | list, get, deploy, pause, resume, teardown, run_now | Deployment lifecycle management |
| **platform.sink** | list, get, create, update, delete | Sink definition CRUD |

### 12.2 Tool Server

Tools run in a separate microservice with security boundaries:
- Path traversal protection
- Command blocking for dangerous operations
- URL validation (HTTP/HTTPS only)
- Content boundary wrapping for external HTTP responses
- All HTTP calls use `httpx` (not aiohttp)

### 12.3 Skills

Installable extensions that add new capabilities. Script files with `SKILL.md` descriptors, managed via the skills category tools.

### 12.4 MCP Integration

External tool providers connect via Model Context Protocol. Configured in Settings with auto-discovery and per-tool overrides.

### 12.5 Human-in-the-Loop (HITL)

When an agent calls a tool configured for HITL:
1. Execution pauses
2. Approval request appears in the chat timeline
3. User reviews and approves or denies
4. Agent resumes or adjusts approach

---

## 13. LLM Provider System

### 13.1 Standard Providers

OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, Mistral, OpenRouter, xAI, Cohere, ZhipuAI, HuggingFace, Ollama, Custom OpenAI-compatible, Custom Anthropic-compatible.

### 13.2 Virtual Providers

| Type | Behavior |
|------|----------|
| **Router** | Load balancing across multiple providers |
| **Council** | Multi-model ensemble for consensus responses |
| **Optimizer** | Prompt optimization before execution |

### 13.3 Per-Capability Assignment

Different models can be assigned to: chat, vision, embedding, speech-to-text, text-to-speech, CLIP, PDF processing.

### 13.4 Security

All provider API keys encrypted at rest using Fernet symmetric encryption. The encryption key must be persisted across restarts.

---

## 14. Authentication

Optional password-based authentication with JWT sessions. When `ADMIN_PASSWORD` is set, all API routes (except health and auth) require a valid session cookie. When unset, authentication is disabled.

---

## 15. UI/UX Standards

- **No browser-native dialogs**: never use `alert()`, `confirm()`, or `prompt()`. Always use custom, application-designed confirmation or input dialogs.
- **Workspace-agnostic pages** use workspace-agnostic endpoints, entities, and WebSocket connections.
- **Dark mode**: full light and dark theme support.
- **Command palette**: `Cmd/Ctrl+K` for instant navigation and actions.
- **Streaming polish**: RAF-based token rendering, thought queue staggering, auto-scroll management, shimmer animations -- all best practices for premium AI streaming UX.

---

## Appendix A: What Needs to Change

This section summarizes the delta between current implementation and target vision for the pages that still need work.

### Outputs -> Sinks

**Current state**: Outputs page with `ArtifactModel` (versioned artifacts with lineage). Sink publishing framework exists but is stubbed out.

**Target**: Replace the Outputs entity and page with Sinks. A sink is a first-class entity with a type (Article, Knowledge Create/Update, REST API, Notification, Log), configuration per type, and the ability to accept wired output variables from agent nodes. The current artifact versioning and lineage tracking can be preserved as part of the Log sink type.

### Automations

**Current state**: Multi-node DAG support with graph editor, compilation, execution levels, static inputs, wiring. No sink nodes on the canvas -- only agent nodes.

**Target**: Add sink nodes as a second node type on the canvas. Users drag sink nodes from a predefined list and wire agent output variables to them. The automation's deployment input schema derivation already works correctly. Node-level configuration (timeout, retry, concurrency, parallelism) needs UI exposure in the automation editor.

### Deployments

**Current state**: Functional deployment creation with input forms, triggers (manual, cron, interval), pause/resume/teardown lifecycle.

**Target**: Largely aligned with vision. The deployment creation flow should clearly surface the derived deployment input schema from the automation's unwired/unfilled inputs. Trigger configuration should be more prominent in the deployment UI.

---

## Appendix B: Future Vision

The following capabilities represent the longer-term direction for OpenForge. Design, architecture, and modeling for each will be developed in future iterations.

### Native LLM Provider (llama.cpp)

OpenForge will ship a native LLM provider powered by llama.cpp, allowing users to run chat models entirely within the platform without configuring any external provider. Users who prefer full self-containment can use the native provider for all model capabilities, eliminating the need for third-party API keys or accounts.

### Extensions

An extensions system will allow users to connect external service accounts to OpenForge. Agents will be able to manage entities and perform actions within those external systems on behalf of the user.

Target integrations include (but are not limited to):
- **Karakeep** -- bookmark and read-later management
- **Immich** -- photo and media library management
- **Gmail** -- email reading, composing, and management
- **Google Drive** -- document and file management
- Other services as demand and community contributions grow

Each extension will define its own authentication flow, entity model, and set of tools that become available to agents once connected.

### Curated Agents and Automations

The system-provided curated agents and automations will be overhauled into a sophisticated, research-driven collection that ships with OpenForge. These definitions are seeded into the database as part of the initial migration at first deployment. Users can use, edit, clone, or delete them just like any other agent or automation they create themselves.

The curation process will use deep internet research to understand which agents and automations are most demanded by users, and implement them using best practices and state-of-the-art techniques. Each curated definition will be well-researched, battle-tested, and designed for real-world utility rather than serving as simple demos.

### Agent Memory System

A sophisticated memory system will give agents persistent, contextual recall across conversations and executions. Key aspects:
- **Memory consolidation cycles** running in the background to organize, deduplicate, and strengthen important memories over time
- **Relevance-aware retrieval** so agents always reference the most pertinent memories for accuracy and better context
- **Cross-agent memory sharing** where appropriate, so knowledge gained by one agent can benefit others
- **Forgetting and decay** mechanisms to prevent memory bloat and keep context fresh

### Autonomous Agents

Autonomous agents are long-lived agents that run continuously in the background toward a target goal. Unlike chat-invoked or automation-triggered agents that execute and terminate, autonomous agents stay alive permanently and perform ongoing tasks without repeated user intervention. Use cases include continuous monitoring, periodic research, background optimization, and proactive notifications.
