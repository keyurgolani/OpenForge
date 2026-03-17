# OpenForge User Guide

A complete step-by-step walkthrough of every feature in OpenForge. Whether you're setting up for the first time or exploring advanced capabilities, this guide covers it all.

## Table of Contents

- [First-Time Setup (Onboarding)](#first-time-setup-onboarding)
- [Workspaces](#workspaces)
- [Knowledge Management](#knowledge-management)
- [Chat and Conversations](#chat-and-conversations)
- [Search](#search)
- [Agent Profiles](#agent-profiles)
- [Workflows](#workflows)
- [Missions](#missions)
- [Runs](#runs)
- [Artifacts](#artifacts)
- [Catalog](#catalog)
- [Tools and Skills](#tools-and-skills)
- [MCP Servers](#mcp-servers)
- [Approvals (Human-in-the-Loop)](#approvals-human-in-the-loop)
- [Operator Dashboard](#operator-dashboard)
- [Settings](#settings)
- [Keyboard Shortcuts](#keyboard-shortcuts)

---

## First-Time Setup (Onboarding)

When you first open OpenForge, the onboarding wizard guides you through initial configuration.

### Step 1: Welcome Screen

The wizard opens with a welcome screen introducing OpenForge. Click **Next** to begin.

### Step 2: Add an LLM Provider

OpenForge needs at least one LLM (Large Language Model) provider to power its AI features. Choose from:

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
| **Custom** | Any OpenAI-compatible API endpoint |

1. Select your provider from the grid
2. Enter your API key (or URL for local providers)
3. Click **Test Connection** to verify it works
4. Click **Next** to proceed

> **Tip:** You can add more providers later from Settings. Ollama is a great free option for running models locally.

### Step 3: Configure Model Assignments

The wizard walks you through assigning models for different capabilities:

- **Chat Model** — The primary model for conversations (required)
- **Vision Model** — For analyzing images (optional)
- **Embedding Model** — For semantic search (uses built-in local model by default)
- **Speech-to-Text** — For audio transcription (optional)
- **Text-to-Speech** — For audio generation (optional)
- **CLIP Model** — For visual/image search (uses built-in local model by default)
- **PDF Model** — For PDF text extraction (optional)

For each model type, select which provider and model to use. The defaults work well for most setups.

### Step 4: Create Your First Workspace

A workspace is your organizational container. Think of it like a project folder that keeps your knowledge, conversations, and settings separate.

1. Enter a name for your workspace (e.g., "Research", "Work", "Personal")
2. Optionally add a description
3. Click **Create**

### Step 5: Automation Preferences

Choose whether to enable automatic features:

- **Knowledge Intelligence** — Automatically generate summaries, tags, and insights for new knowledge items
- **Bookmark Extraction** — Automatically extract content from bookmarked URLs

Both are recommended for the best experience. Click **Finish** to complete setup.

---

## Workspaces

Workspaces are the top-level organizational unit in OpenForge. Each workspace has its own knowledge base, conversations, and settings.

### Creating a Workspace

1. Go to **Settings > Workspaces**
2. Click **Create Workspace**
3. Enter a name and optional description
4. Click **Create**

### Switching Workspaces

Use the **workspace switcher** in the top-left corner of the sidebar to switch between workspaces. Each workspace maintains its own:

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
- **Gists** — Code editor with syntax highlighting for multiple languages (JavaScript, Python, JSON, HTML, CSS, Markdown, SQL)
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
Toggle prompt optimization to have the agent refine its prompts for better results.

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

Search returns results from:
- Knowledge items (all types)
- Chat conversation history

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

## Agent Profiles

Profiles define how AI agents behave. Think of a profile as a "personality and skill set" for an agent.

### What a Profile Contains

| Component | Purpose |
|-----------|---------|
| **Name & Description** | Human-readable identity |
| **Role** | The agent's role (e.g., "researcher", "writer", "analyst") |
| **System Prompt** | Instructions that shape the agent's behavior |
| **Capability Bundles** | Collections of tools and abilities the agent can use |
| **Model Policy** | Which LLM model the agent should use and constraints |
| **Memory Policy** | How the agent manages context and conversation history |
| **Safety Policy** | Rules and constraints for safe behavior |
| **Output Contract** | Expected output format and behavior |

### Creating a Profile

1. Navigate to **Profiles**
2. Click **Create Profile**
3. Fill in the name, description, and role
4. Configure the system prompt — this is the most important part, as it defines how the agent thinks and responds
5. Optionally attach capability bundles, policies, and contracts
6. Click **Create**

### Using Profiles

Profiles are referenced by workflows and missions to determine which agent behavior to use at each step. OpenForge includes built-in system profiles:

- **Workspace Agent** — The default chat agent for conversations
- **Router Agent** — Routes requests to the best-suited agent
- **Council Agent** — Coordinates multiple agents for complex decisions
- **Optimizer Agent** — Optimizes prompts and responses

---

## Workflows

Workflows are composable execution graphs that define multi-step AI processes.

### What is a Workflow?

A workflow is a directed graph of nodes and edges that describes how work flows from one step to the next. Think of it as a flowchart for AI operations.

### Node Types

| Node Type | Purpose |
|-----------|---------|
| **LLM** | Call a language model with context |
| **Tool** | Execute a tool (file operations, web search, etc.) |
| **Router** | Route execution based on conditions |
| **Fan-out** | Split into parallel execution branches |
| **Join** | Wait for all parallel branches to complete |
| **Reduce** | Aggregate results from parallel branches |
| **Approval** | Pause and wait for human approval |
| **Artifact** | Emit a durable output artifact |
| **Delegate** | Call another workflow |
| **Subworkflow** | Inline another workflow |
| **Handoff** | Delegate to a different agent profile |

### Creating a Workflow

1. Navigate to **Workflows**
2. Click **Create Workflow**
3. Define the workflow name, description, and configuration
4. Add nodes and edges to build the execution graph
5. Configure each node's parameters
6. Save the workflow

### Workflow Versioning

Workflows support versioning. Each time you modify a workflow, you can create a new version while keeping the previous one. This lets you:
- Roll back to earlier versions if needed
- Compare versions side by side
- Track the evolution of your workflows

---

## Missions

Missions are the highest-level autonomous unit in OpenForge. A mission packages together a workflow, agent profiles, and triggers into a deployable unit.

### What Makes Up a Mission?

| Component | Purpose |
|-----------|---------|
| **Workflow** | The execution graph to run |
| **Default Profiles** | Agent profiles to use during execution |
| **Triggers** | When and how the mission should run |
| **Budget Policy** | Resource limits (max runs per day, concurrent runs, token limits) |
| **Approval Policy** | Whether human approval is required before execution |
| **Autonomy Mode** | Supervised (requires approval) or autonomous (runs independently) |

### Creating a Mission

1. Navigate to **Missions**
2. Click **Create Mission**
3. Assign a workflow and default profiles
4. Configure triggers (see below)
5. Set budget and approval policies
6. Click **Create**

### Mission Lifecycle

Missions have a lifecycle:
- **Draft** — Being configured, not yet active
- **Active** — Running according to triggers
- **Paused** — Temporarily stopped
- **Disabled** — Permanently stopped

### Mission Health

The mission detail page shows health metrics:
- Last run time and status
- Success/failure rates
- Associated artifacts
- Trigger history

---

## Runs

A run is a single execution instance of a workflow or mission.

### Viewing Runs

1. Navigate to **Runs**
2. Browse the list of all executions
3. Filter by status (pending, running, completed, failed) or type (workflow run, mission run)

> **Note:** The runs list auto-refreshes every 5 seconds to show real-time status updates.

### Run Detail Page

Click any run to see its full details:

- **Steps** — Tree view of every step the run executed
- **Artifacts** — Any outputs the run produced
- **Events** — Runtime events and logs
- **Lineage** — Which workflow or mission spawned this run
- **Checkpoints** — Saved state snapshots for durability
- **Cost & Tokens** — Token consumption and estimated cost

### Resuming Runs

If a run was paused (e.g., waiting for approval), you can resume it from its detail page.

---

## Artifacts

Artifacts are the durable outputs produced by missions, workflows, and manual creation.

### What is an Artifact?

An artifact is any meaningful output — a document, analysis, report, code, or dataset. Artifacts are first-class objects with:

- **Versioning** — Every material change creates a new version
- **Lineage** — Links back to the run, workflow, or mission that created it
- **Status Lifecycle** — Draft > Active > Superseded or Archived
- **Visibility** — Private, workspace-visible, export-ready, or hidden
- **Tags** — For organization and discovery

### Creating an Artifact

1. Navigate to **Artifacts**
2. Click **Create Artifact**
3. Enter title, summary, content, and type
4. Set status and visibility
5. Click **Create**

Artifacts are also automatically created by workflow/mission runs that include artifact-emitting nodes.

### Viewing Artifact History

Each artifact maintains a full version history. View previous versions and compare changes from the artifact detail page.

---

## Catalog

The catalog is a curated library of pre-built templates you can use as starting points.

### Browsing the Catalog

1. Navigate to **Catalog**
2. Browse available templates by type: Profiles, Workflows, or Missions
3. Toggle **Featured** to see highlighted templates
4. Each template shows a description, difficulty level, and tags

### Cloning from Catalog

1. Find a template you want to use
2. Click **Clone**
3. OpenForge checks prerequisites (e.g., required providers configured)
4. If all prerequisites are met, the template is cloned into your workspace
5. Customize the cloned item as needed

---

## Tools and Skills

### Built-in Tools

OpenForge comes with 50+ built-in tools organized into categories:

| Category | Tools | Purpose |
|----------|-------|---------|
| **Filesystem** | read_file, write_file, list_directory, search_files, file_info, move_file, delete_file | Work with files in your workspace |
| **Shell** | execute, execute_python | Run shell commands and Python scripts |
| **Git** | status, log, diff, add, commit, init | Version control operations |
| **Language** | parse_ast, find_definition, find_references, apply_diff | Code analysis and modification |
| **Workspace** | search, save_knowledge, list_knowledge, delete_knowledge, list_chats, read_chat | Access your knowledge base and chat history |
| **Memory** | store, recall, forget | Ephemeral and persistent memory for agents |
| **HTTP** | get, post, fetch_page, search_web | Web access and search (via SearXNG) |
| **Agent** | invoke | Delegate tasks to other agents |
| **Task** | create_plan, get_plan, update_step | Task and plan management |
| **Skills** | install, list_installed, read, remove, search | Manage custom skills |

Tools are automatically available to agents during conversations. The agent decides which tools to use based on your request.

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

Control which tools agents can use:

1. Go to **Settings > Policies**
2. Set tool permissions: **Allow**, **Block**, or **Require Approval**
3. Each tool has a default risk level (low, medium, high, critical) that determines approval requirements

---

## MCP Servers

MCP (Model Context Protocol) servers let you connect external tool providers to OpenForge.

### Adding an MCP Server

1. Go to **Settings > MCP**
2. Click **Add Server**
3. Enter the server URL and authentication details
4. Click **Discover** to auto-detect available tools
5. Configure per-tool overrides (enable/disable, risk level)

### What MCP Provides

MCP servers expose additional tools that agents can use. This lets you:
- Connect to proprietary internal tools
- Integrate with third-party services
- Extend OpenForge without modifying its code

---

## Approvals (Human-in-the-Loop)

OpenForge supports human-in-the-loop (HITL) approval workflows for high-risk operations.

### How It Works

1. An agent encounters a tool call that requires approval (based on risk level or policy)
2. The agent pauses and creates an approval request
3. You see a notification (bell icon in the top bar shows pending count)
4. Review the request — see what tool, parameters, and context
5. **Approve** to let the agent proceed, or **Deny** to block the action
6. The agent resumes (or adjusts its approach if denied)

### Managing Approvals

- **Settings > Approvals** — View all pending and resolved approval requests
- **Operator Dashboard** — The approval inbox widget shows pending requests for quick action

### Configuring What Requires Approval

In **Settings > Policies**, you can:
- Set specific tools to always require approval
- Configure risk level thresholds
- Simulate policy execution to test your rules

---

## Operator Dashboard

The operator dashboard provides a workspace-level overview of operations and health.

### Accessing the Dashboard

Navigate to **Operator** in your workspace sidebar.

### Dashboard Widgets

| Widget | What It Shows |
|--------|--------------|
| **Approval Inbox** | Pending HITL requests requiring your attention |
| **Cost Hotspots** | Token consumption and estimated costs by model/provider |
| **Failure Rollup** | Analysis of failures grouped by type or object |
| **Evaluation Runs** | Quality and performance evaluation results |
| **Mission Health** | Status and health metrics for active missions |

---

## Settings

Access settings from the gear icon or navigate to `/settings`.

### Workspaces Tab

Create, edit, merge, and delete workspaces.

### AI Models Tab

Configure LLM providers and model assignments:

- **Providers** — Add, edit, test, and remove LLM providers. Set a default provider.
- **Chat** — Assign which model handles conversations
- **Vision** — Assign a vision-capable model for image analysis
- **Embedding** — Configure the text embedding model (local by default)
- **Audio** — Configure speech-to-text and text-to-speech models
- **CLIP** — Configure the visual search model (local by default)
- **PDF** — Configure the PDF processing model

### Prompts Tab

Manage prompt templates:
- View and edit system prompts
- Version history for each prompt
- Preview prompts with variable substitution

### Policies Tab

Configure tool permissions and safety policies:
- Set per-tool permission levels
- Create approval policies
- Simulate policy execution

### Approvals Tab

View pending and resolved approval requests.

### Pipelines (Jobs) Tab

Manage background task scheduling:
- View scheduled tasks
- Run tasks manually
- Check task execution history

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

5. **Explore the catalog** — Pre-built templates give you a head start with common workflows and mission patterns.

6. **Set up HITL for safety** — Configure approval policies for high-risk tools to maintain control while still benefiting from automation.

7. **Monitor costs** — Use the operator dashboard to track token usage and costs across providers.

8. **Use workspaces for separation** — Create different workspaces for different projects to keep knowledge bases focused and search results relevant.

---

*For technical architecture details, see [Architecture](architecture.md). For deployment instructions, see [Deployment](deployment.md).*
