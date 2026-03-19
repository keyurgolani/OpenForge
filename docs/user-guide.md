# OpenForge User Guide

A complete step-by-step walkthrough of every feature in OpenForge. Whether you're setting up for the first time or exploring advanced capabilities, this guide covers it all.

## Table of Contents

- [Getting Started](#getting-started)
- [Workspaces](#workspaces)
- [Knowledge Management](#knowledge-management)
- [Chat and Conversations](#chat-and-conversations)
- [Search](#search)
- [Agents](#agents)
- [Automations](#automations)
- [Runs](#runs)
- [Outputs](#outputs)
- [Tools and Skills](#tools-and-skills)
- [MCP Servers](#mcp-servers)
- [Approvals (Human-in-the-Loop)](#approvals-human-in-the-loop)
- [Settings](#settings)
- [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Getting Started

Getting started with OpenForge takes three steps:

### Step 1: Set Up an LLM Provider

OpenForge needs at least one LLM provider to power its AI features. The onboarding wizard guides you through this on first launch. Choose from:

| Provider | What You Need |
|----------|--------------|
| **OpenAI** | API key from platform.openai.com |
| **Anthropic** | API key from console.anthropic.com |
| **Google Gemini** | API key from ai.google.dev |
| **Groq** | API key from console.groq.com |
| **DeepSeek** | API key from platform.deepseek.com |
| **Mistral** | API key from console.mistral.ai |
| **OpenRouter** | API key from openrouter.ai |
| **xAI** | API key from console.x.ai |
| **Cohere** | API key from dashboard.cohere.com |
| **ZhipuAI** | API key from open.bigmodel.cn |
| **HuggingFace** | API key from huggingface.co |
| **Ollama** | Local Ollama instance URL (no API key needed) |
| **Custom** | Any OpenAI-compatible or Anthropic-compatible API endpoint |

After adding a provider, configure model assignments for different capabilities (chat, vision, embedding, audio, CLIP, PDF).

> **Tip:** Ollama is a great free option for running models locally.

### Step 2: Create a Workspace

A workspace is your organizational container. Think of it like a project folder that keeps your knowledge, conversations, and settings separate. Enter a name, optionally add a description, and you're ready to go.

### Step 3: Start Chatting

Navigate to Chat in your workspace, type a message, and press Enter. The AI agent will search your knowledge base for relevant context and generate a grounded response.

---

## Workspaces

Workspaces are the top-level organizational unit in OpenForge. Each workspace has its own knowledge base, conversations, and settings.

### Creating a Workspace

1. Go to **Settings > Workspaces**
2. Click **Create Workspace**
3. Enter a name, optional description, and choose an icon
4. Click **Create**

### Switching Workspaces

Use the **workspace switcher** in the sidebar to switch between workspaces. Each workspace maintains its own:

- Knowledge base
- Conversations
- Search index
- Model configuration overrides

### Workspace Settings

Each workspace can override the global model defaults. Navigate to a workspace and its settings to configure workspace-specific model assignments.

### Merging Workspaces

If you need to consolidate, you can merge one workspace into another from **Settings > Workspaces**. This combines all knowledge and conversations from both.

---

## Knowledge Management

Knowledge is the core of OpenForge. Everything you save becomes searchable and available as context for AI conversations.

### Knowledge Types

OpenForge supports 11 types of knowledge:

| Type | Description | How to Create |
|------|-------------|---------------|
| **Note** | Rich text notes | Click **+** > Note, write your content |
| **Fleeting Note** | Quick capture for temporary thoughts | Click **+** > Fleeting Note |
| **Bookmark** | Web links with auto-extracted content | Click **+** > Bookmark, paste URL |
| **Gist** | Code snippets with syntax highlighting | Click **+** > Gist, select language |
| **Image** | JPEG/PNG images with visual search | Click **+** > Image, upload file |
| **Audio** | MP3/WAV files with transcription | Click **+** > Audio, upload file |
| **PDF** | PDF documents with text extraction | Click **+** > PDF, upload file |
| **Document** | Word documents (.docx) | Click **+** > Document, upload file |
| **Sheet** | Excel spreadsheets (.xlsx) | Click **+** > Sheet, upload file |
| **Slides** | PowerPoint presentations (.pptx) | Click **+** > Slides, upload file |

### Adding Knowledge

1. Navigate to your workspace's **Knowledge** page
2. Click the **+** button or use **Cmd/Ctrl+N**
3. Select the knowledge type
4. Fill in the content (or upload a file)
5. Add optional tags for organization
6. Click **Save**

### Knowledge Processing

When you save knowledge, OpenForge automatically:

1. **Chunks** the content into smaller pieces for search
2. **Embeds** each chunk using vector embeddings
3. **Indexes** everything for semantic search
4. **Generates intelligence** (if enabled): summaries, tags, key insights, and suggested titles

### Working with Knowledge

- **Pin** important items so they appear in the sidebar for quick access
- **Archive** items you want to keep but hide from the main view
- **Tag** items for organization and filtering
- **Filter** the knowledge grid by type, search query, or archive status
- **Sort** by last modified, date created, or word count
- **Reprocess** items to regenerate embeddings and intelligence

### Knowledge Editors

Each knowledge type has a dedicated editor:

- **Notes** — Rich text editor with formatting toolbar
- **Gists** — Code editor with syntax highlighting for multiple languages
- **Bookmarks** — URL display with extracted content view and re-extraction option
- **PDFs/Documents/Sheets/Slides** — File preview with extracted text display
- **Images** — Image viewer with metadata
- **Audio** — Audio player with transcription display

### Knowledge Intelligence

When intelligence generation is enabled, each knowledge item gets:

- **Summary** — AI-generated overview of the content
- **Tags** — Suggested categorization tags
- **Key Insights** — Extracted highlights, todos, deadlines, and important points

You can trigger intelligence generation manually from any knowledge item's metadata panel.

---

## Chat and Conversations

The chat interface is where you interact with AI agents that have access to your knowledge base.

### Starting a Conversation

1. Navigate to **Chat** in your workspace
2. Type your message in the input area at the bottom
3. Press **Enter** to send

The AI agent will:
1. Search your knowledge base for relevant context
2. Assemble the most relevant information within its context window
3. Generate a response grounded in your knowledge

### Conversation Features

#### Real-Time Streaming
Responses stream in real-time via WebSocket. You can see the AI thinking and generating as it works.

#### Timeline Visualization
Each message shows a timeline of what the agent did:
- **Model Selection** — Which LLM model was chosen
- **Thinking** — The agent's reasoning process (expandable/collapsible)
- **Tool Calls** — Any tools the agent used (with parameters and results)
- **Context Sources** — Which knowledge items were retrieved as context

#### File Attachments
Attach files directly to messages:
1. Click the attachment icon in the chat input
2. Select files to upload
3. The agent will process and reference them in its response

#### Audio Recording
Record voice messages:
1. Click the microphone icon
2. Speak your message
3. Click stop — the audio is transcribed and sent

#### Model Override
Override the default model for a specific message:
1. Click the model selector dropdown in the chat input
2. Choose a different provider/model
3. Your message will be processed by that model

#### Prompt Optimization
Toggle prompt optimization to have the optimizer agent refine prompts before the main agent processes them.

#### Workspace Mentions
Mention another workspace with `@workspace-name` to instruct the agent to delegate cross-workspace queries via the `agent.invoke` tool.

### Managing Conversations

- **Rename** — Click the conversation title to rename it
- **Archive** — Move conversations to archive
- **Delete** — Move to trash (recoverable)
- **Permanently Delete** — Remove forever from trash
- **Export** — Export as JSON, Markdown, or plain text
- **Bulk Operations** — Select multiple conversations for batch actions

### Conversation Sidebar

The left sidebar shows:
- **Recent Conversations** — Your latest chats
- **Delegated Conversations** — Chats where one agent delegated to another
- **Trash** — Deleted conversations (recoverable)

---

## Search

OpenForge provides powerful search across all your knowledge.

### Text Search

1. Navigate to **Search** in your workspace
2. Enter your query in the search bar
3. Results are ranked by semantic relevance (not just keyword matching)

Search uses hybrid retrieval (dense vectors + sparse BM25 + summary vectors) combined via Reciprocal Rank Fusion, with optional cross-encoder reranking.

You can filter results by knowledge type using the filter chips.

### Visual Search

1. On the Search page, switch to the **Visual Search** tab
2. Upload an image or provide an image URL
3. OpenForge finds visually similar images in your knowledge base using CLIP embeddings

### Evidence Building

For research workflows, the search page supports:
- **Evidence Packet Assembly** — Collect and organize search results into a structured evidence packet
- **Retrieval Tracing** — Debug and inspect the retrieval pipeline to understand why certain results appear

---

## Agents

Agents are the AI actors in OpenForge. Each agent is defined by a blueprint and compiled into an executable specification.

### Agent Blueprints

An agent blueprint is a file in `agent.md` format — YAML frontmatter for configuration, Markdown body for the system prompt:

```markdown
---
name: Research Assistant
slug: research-assistant
mode: interactive
strategy: researcher
model:
  allow_override: true
memory:
  history_limit: 20
  strategy: sliding_window
retrieval:
  enabled: true
  limit: 5
tools:
  - workspace.search
  - http.search_web
  - http.fetch_page
---
You are a research assistant specializing in evidence-based analysis.

When given a research question, search the knowledge base and web for relevant
sources, synthesize findings, and present a well-structured analysis with citations.

## Constraints
- Always provide sources when referencing knowledge content
- Distinguish between knowledge-base facts and web-sourced information
```

### Blueprint Fields

| Field | Purpose |
|-------|---------|
| `name` | Human-readable agent name |
| `slug` | Unique identifier |
| `strategy` | Execution strategy (chat, researcher, reviewer, builder, watcher, coordinator) |
| `mode` | Interaction mode (interactive or autonomous) |
| `model` | Model preferences (default model, provider, temperature, max_tokens) |
| `memory` | History management (limit, strategy, attachment support) |
| `retrieval` | Knowledge retrieval settings (enabled, limit, score threshold) |
| `output` | Output settings (streaming, structured output, citations) |
| `tools` | List of allowed tools (by ID or with per-tool config) |
| `confirm_before` | Tools that require human confirmation |
| `constraints` | Behavioral rules (extracted from `## Constraints` section) |

### Agent Templates

OpenForge provides default agent templates when creating new workspaces. Each workspace gets a default agent that is automatically compiled and registered.

### Agent Compilation

When an agent blueprint is saved, the compiler:

1. Parses the YAML frontmatter and Markdown body
2. Computes a SHA-256 hash for idempotency
3. Upserts a system profile
4. Builds the system prompt with workspace directory
5. Creates an immutable `CompiledAgentSpec`
6. Persists the spec with a version number
7. Updates the agent's `active_spec_id`

If the blueprint hasn't changed (same hash), compilation is skipped.

### Strategies

The `strategy` field determines how the agent executes:

| Strategy | Best For |
|----------|----------|
| **chat** | General-purpose conversation with tool use |
| **researcher** | Multi-step research with evidence gathering |
| **reviewer** | Code or document review with structured feedback |
| **builder** | Multi-step artifact construction |
| **watcher** | Monitoring and reactive workflows |
| **coordinator** | Orchestrating multiple sub-agents |

### Managing Agents

1. Navigate to **Agents** (top-level, not workspace-scoped)
2. View all registered agents
3. Click an agent to see its detail page (blueprint, compiled specs, runs)
4. Edit the blueprint to change behavior — recompilation happens automatically

---

## Automations

Automations combine an agent with scheduling, resource limits, and output routing to create repeatable, unattended workflows.

### What Makes Up an Automation?

| Component | Purpose |
|-----------|---------|
| **Agent** | The agent (by slug) that executes the automation |
| **Trigger Config** | When and how the automation should run |
| **Budget Config** | Resource limits (max runs per day, concurrent runs, token limits, failure cooldowns) |
| **Output Routing** | Which types of artifacts the automation should produce |

### Trigger Types

| Type | Description |
|------|-------------|
| **Manual** | Triggered on demand via the UI or API |
| **Schedule** | Runs on a cron expression (e.g., `0 9 * * 1` for every Monday at 9am) |
| **Interval** | Runs every N seconds |
| **Event** | Runs in response to system events (e.g., knowledge updated) |

### Budget Policies

Budgets prevent runaway automation execution:

- **max_runs_per_day** — Maximum number of runs per 24-hour period
- **max_concurrent_runs** — Maximum runs executing simultaneously
- **max_token_budget_per_day** — Total token consumption limit per day
- **cooldown_seconds_after_failure** — Wait time before retrying after a failure

### Creating an Automation

1. Navigate to **Automations** (top-level)
2. Click **Create Automation**
3. Select the agent to run
4. Configure the trigger (manual, cron, interval, or event)
5. Set budget limits
6. Configure output routing
7. Click **Create**

### Automation Lifecycle

- **Draft** — Being configured, not yet active
- **Active** — Running according to triggers
- **Paused** — Temporarily stopped
- **Disabled** — Permanently stopped

---

## Runs

A run is a single execution instance — whether from an interactive chat session, a strategy execution, or an automation trigger.

### Viewing Runs

1. Navigate to **Runs** (top-level)
2. Browse the list of all executions
3. Filter by status (pending, running, completed, failed)

> **Note:** The runs list auto-refreshes to show real-time status updates.

### Run Detail Page

Click any run to see its full details:

- **Steps** — Individual steps the run executed
- **Outputs** — Any artifacts the run produced
- **Events** — Runtime events and logs
- **Cost & Tokens** — Token consumption and estimated cost

### Resuming Runs

If a run was paused (e.g., waiting for HITL approval), it resumes automatically once the approval is resolved.

---

## Outputs

Outputs are the durable results produced by agent runs, automations, or manual creation. They were previously called "artifacts" in the codebase.

### What is an Output?

An output is any meaningful result — a document, analysis, report, code, or dataset. Outputs are first-class objects with:

- **Versioning** — Every material change creates a new version
- **Lineage** — Links back to the run, automation, or agent that created it
- **Status Lifecycle** — Draft > Active > Superseded or Archived
- **Tags** — For organization and discovery
- **Sinks** — Configurable publication destinations

### Creating an Output

1. Navigate to **Outputs** (top-level)
2. Click **Create Output**
3. Enter title, summary, content, and type
4. Set status and visibility
5. Click **Create**

Outputs are also automatically created by automation runs and strategy executions that emit artifacts.

### Viewing Output History

Each output maintains a full version history. View previous versions and compare changes from the output detail page.

### Output Lineage

Outputs track their provenance:
- Which run produced them
- Which automation or agent was responsible
- Which knowledge items were referenced

---

## Tools and Skills

### Built-in Tools

OpenForge comes with 50+ built-in tools organized into 10 categories:

| Category | Tools | Purpose |
|----------|-------|---------|
| **filesystem** | read_file, write_file, list_directory, search_files, file_info, move_file, delete_file | Work with files |
| **shell** | execute, execute_python | Run shell commands and Python scripts |
| **git** | status, log, diff, add, commit, init | Version control operations |
| **language** | parse_ast, find_definition, find_references, apply_diff | Code analysis and modification |
| **workspace** | search, save_knowledge, list_knowledge, delete_knowledge, list_chats, read_chat | Access knowledge and chat history |
| **memory** | store, recall, forget | Ephemeral and persistent memory for agents |
| **http** | get, post, fetch_page, search_web | Web access and search (via SearXNG) |
| **agent** | invoke | Delegate tasks to other agents |
| **task** | create_plan, get_plan, update_step | Task and plan management |
| **skills** | install, list_installed, read, remove, search | Manage custom skills |

Tools are automatically available to agents during conversations. The agent decides which tools to use based on your request. Individual tools can be allowed, blocked, or gated by an agent's `tools` and `confirm_before` blueprint fields.

### Skills

Skills are installable extensions that add new capabilities. Think of them as plugins.

#### Managing Skills

1. Go to **Settings > Skills**
2. **Search** — Find skills from the skills registry
3. **Install** — Click install to add a skill
4. **Remove** — Uninstall skills you no longer need

#### How Skills Work

Skills are script files with a `SKILL.md` descriptor. When installed, they become available as tools that agents can use during conversations.

### Tool Permissions

Control which tools agents can use from **Settings > Tools**:

| Permission Level | Behavior |
|-----------------|----------|
| **Default** | Uses the tool's built-in risk level |
| **Allowed** | Tool executes without any approval |
| **Approval** | Tool pauses and waits for human approval before executing |
| **Blocked** | Tool is disabled and cannot be used |

---

## MCP Servers

MCP (Model Context Protocol) servers let you connect external tool providers to OpenForge.

### Adding an MCP Server

1. Go to **Settings > MCP**
2. Click **Add Server**
3. Enter the server URL, transport type, and authentication details
4. Click **Discover** to auto-detect available tools
5. Configure per-tool overrides (enable/disable, risk level)

### What MCP Provides

MCP servers expose additional tools that agents can use. This lets you:
- Connect to proprietary internal tools
- Integrate with third-party services
- Extend OpenForge without modifying its code

---

## Approvals (Human-in-the-Loop)

OpenForge supports human-in-the-loop (HITL) approval for high-risk operations.

### How It Works

1. An agent encounters a tool call that requires approval (based on risk level or permission config)
2. The agent pauses and creates an approval request
3. You see a notification in the chat timeline
4. Review the request — see what tool, parameters, and context
5. **Approve** to let the agent proceed, or **Deny** to block the action
6. The agent resumes (or adjusts its approach if denied)

### Configuring What Requires Approval

In agent blueprints, use the `confirm_before` field to list tools that should require confirmation. In Settings, configure global tool permission overrides.

---

## Settings

Access settings from the gear icon or navigate to `/settings`.

### Workspaces Tab

Create, edit, merge, and delete workspaces. Configure workspace icons and descriptions.

### AI Models Tab

Configure LLM providers and model assignments:

- **Providers** — Add, edit, test, and remove LLM providers. Set a default provider.
- **Chat** — Assign which model handles conversations
- **Vision** — Assign a vision-capable model for image analysis
- **Embedding** — Configure the text embedding model (local by default)
- **Audio** — Configure speech-to-text and text-to-speech models
- **CLIP** — Configure the visual search model (local by default)
- **PDF** — Configure the PDF processing model

### Pipelines (Jobs) Tab

Manage background task scheduling:
- View scheduled tasks (knowledge embedding, intelligence generation, maintenance)
- Run tasks manually
- Configure automation preferences (auto-intelligence, auto-bookmark extraction)

### Skills Tab

Install and manage custom skills from the skills registry.

### MCP Tab

Configure Model Context Protocol servers for external tool integration.

### Audit Tab

View audit logs:
- Tool call history
- Container logs
- System events

### Import Tab

Import data into OpenForge from JSON backups.

### Export Tab

Export data from OpenForge:
- Export all data
- Export a specific workspace
- Download as JSON

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Cmd/Ctrl + K** | Open command palette (search, navigate, quick actions) |
| **Cmd/Ctrl + B** | Toggle sidebar |
| **Cmd/Ctrl + N** | Create new knowledge item |
| **Enter** | Send message in chat |

### Command Palette

Press **Cmd/Ctrl + K** to open the command palette, which lets you:
- Switch workspaces quickly
- Navigate to any page
- Execute common actions
- Search across the application

---

## Tips for Getting the Most Out of OpenForge

1. **Start with knowledge** — The more knowledge you add, the better your AI conversations become. Add notes, bookmarks, documents, and code snippets that are relevant to your work.

2. **Use tags** — Tag your knowledge items consistently to make filtering and organization easier.

3. **Pin frequently used items** — Pinned knowledge appears in the sidebar for instant access.

4. **Try different models** — Use the model override feature in chat to compare responses from different LLMs.

5. **Explore agent strategies** — Different strategies (researcher, builder, reviewer) produce very different behaviors. Match the strategy to your task.

6. **Set up automations for repetitive work** — If you find yourself doing the same research or analysis regularly, create an automation with appropriate triggers and budgets.

7. **Use HITL for safety** — Configure `confirm_before` in agent blueprints for high-risk tools to maintain control while still benefiting from automation.

8. **Monitor costs** — Check the runs list to track token usage and costs across providers.

9. **Use workspaces for separation** — Create different workspaces for different projects to keep knowledge bases focused and search results relevant.

---

*For technical architecture details, see [Architecture](architecture.md). For deployment instructions, see [Deployment](deployment.md).*
