# OpenForge Roadmap

## Comprehensive Improvement & Evolution Plan

All changes were individually reviewed and approved through interactive brainstorming. Where specific tools or libraries are named, these were selected through comparative evaluation of 2-5+ alternatives per category. Recommendations, not mandates.

Priority tiers: **P0** (foundation/blocking), **P1** (high-impact), **P2** (valuable), **P3** (future/exploratory)

---

## Conceptual Grouping

Items across all tracks, grouped by domain rather than implementation order.

| Group                                    | Items                                              | Description                                                                                                                         |
| ---------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Tool Execution Resilience & Optimization | 1.2, 1.4, 1.6, 1.7, 1.9, 1.12, 1.14, 4.2, 4.3, 4.4 | Failure handling, caching, concurrent execution, recovery hints, narrator mode, tool fixes and macros                               |
| Context & Token Management               | 1.3, 1.5, 1.8, 1.15                                | Compaction tiers, disk persistence for tool results, compositional prompts with cache-aware assembly, small-model context budgeting |
| Memory System                            | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9        | Typed memories, temporal management, hybrid retrieval, auto-capture, consolidation/extraction/learning daemons, progressive loading |
| Knowledge Ingestion & Processing         | 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 7.1             | Pipeline framework, CLIP embedding, content normalization, faster-whisper, pipeline model selection, model download management       |
| Agent Behavior & Quality                 | 1.13, 5.1, 5.2, 5.3                                | Plan-mode default, delegation guidance with loop prevention, verification-before-done, hierarchical tool scoping                    |
| Missions & Deployments                   | 1.10, 1.11, 6.1, 6.2, 6.3, 6.4, 6.5                | Progress persistence, sprint contracts, health monitor, agent messaging, templates, webhook and event triggers                      |
| Browser & Web Interaction                | 4.1                                                | PinchTab for interactive browsing, Crawl4AI for content extraction                                                                  |
| Local / Native AI                        | 7.2, 7.3                                           | Ollama in Docker stack, Liquid AI LFM2.5 integration                                                                                |
| UI/UX                                    | 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7                  | Chat streaming fix, inline artifacts, Kanban view, NL scheduling, smart polling, design audit, journal UI                           |
| Developer Experience & Extensibility     | 9.1, 9.2                                           | Autoresearch optimization pattern, RepoLens codebase understanding tool                                                             |

---

## Track 1: Execution Engine & Runtime

### 1.1 Strategy System Cleanup — P0 ✅ DONE

The strategy system has been fully removed. The `strategies/` directory, `strategy_executor.py`, and `strategy_plugins` DB table (migration 015) are all gone. All execution now flows through `agent_executor.py` → `tool_loop` directly.

### 1.2 Consecutive Tool Failure Cap — P0

In `execute_tool_loop()`, track consecutive failures per tool. After 3 consecutive failures on the same tool, stop retrying and inject a system message: "Tool `{name}` has failed 3 consecutive times. Do not retry it. Use an alternative approach." Reset counter on any success. ~15 lines in `tool_loop.py`.

### 1.3 Context Management System — P1

#### 1.3a Three-Tier Context Compaction

- **Tier 1: HeadTail** — Zero LLM calls. Keep system prompt + last N messages, drop the middle.
- **Tier 2: LLM Summarization** — Summarize the middle using the cheaper intelligence model.
- **Tier 3: Full Context Reset** — Write a structured handoff artifact, clear everything, restart with the handoff. For missions and long automations only.

Add a `CompactionStrategy` protocol to `tool_loop.py`. Trigger at configurable context fill percentage (defaults: 60% Tier 1, 80% Tier 2, 90% Tier 3). Configurable per agent template.

#### 1.3b Context Window Monitoring & Adaptive Behavior

Track real-time context consumption in `execute_tool_loop()`. Surface as a subtle progress bar in the chat UI (thin line under composer, color shifts neutral → amber → red). Inject system reminders at threshold crossings: "You have used 70% of your context window. Be concise."

#### 1.3c Circuit Breaker on Compaction Failures

After 3 consecutive compaction failures, disable compaction for the session. Prevents runaway API waste. ~10 lines alongside the compaction logic.

### 1.4 Speculative Read-Only Tool Execution — P1

When the LLM returns multiple tool calls in a single turn, classify by risk level (the policy engine already has `ToolRiskCategory`) and execute all read-only tools concurrently with `asyncio.gather`, then mutating tools sequentially. Latency reduction of 3-5x for research-heavy agents issuing multiple search/fetch calls per turn.

### 1.5 Tool Result Disk Persistence — P1

After each tool call, write full result to a temp file keyed by run ID + step index. Replace result in context with a short summary reference. Add a `read_tool_result` meta-tool for agents to retrieve full results when needed. Prevents context bloat from large tool outputs (a single `fetch_page` can be 5,000-15,000 tokens).

### 1.6 Structured Error Recovery Hierarchy — P1

Replace binary success/fail with four-level recovery:

1. **Retry with updated context** — Same tool, refined parameters based on error message
2. **Rollback to checkpoint** — Revert to last known-good state, try alternative approach
3. **Decompose** — Break the failing operation into smaller sub-steps
4. **Human escalation** — HITL approval (already exists)

Levels attempted in order. The failure cap (1.2) gates between levels — 3 failures at Level 1 escalates to Level 2, etc.

### 1.7 Tool Error Recovery Hints — P1

When a tool fails, the tool server returns structured recovery hints alongside the error. Tool-specific guidance: a 404 means "search for the correct URL," permission denied means "try a different path." Injected as part of the error message to the LLM. Incremental — start with HTTP, filesystem, shell tools.

### 1.8 Compositional Prompt Architecture — P1

#### 1.8a Compositional Prompt Fragments

Refactor preamble/postamble from monolithic templates into tagged, conditionally-loaded fragments. Each fragment has: name, category (identity/behavior/tools/context/reminders), condition (when to load), content, cacheable flag, order. ~15-20 fragments replace the monolithic templates. New features (verbosity, memory harness, delegation guidance) register as new fragments rather than editing a growing template.

#### 1.8b Cache-Aware Prompt Assembly

Split stable (agent identity, platform rules, tool descriptions) from dynamic (current date, workspace listing, system reminders) with explicit cache boundary. Stable block first, dynamic block after. Providers with prompt caching (Anthropic, Google) reuse the stable prefix at ~90% cost reduction. ~10x reduction in system prompt token costs for multi-turn conversations.

#### 1.8c System Reminder Injection

Inject contextual system messages mid-conversation triggered by events:

- Knowledge item created/updated in a workspace the agent accessed
- Tool server restart
- MCP server connection change
- Time-based ("You have been executing for N minutes")

`ReminderService` subscribes to existing Redis pub/sub channels, maintains per-conversation queue, injects before each LLM call. Batches duplicate events.

#### 1.8d Verbosity Setting Per Agent

Five levels: `verbose`, `normal`, `concise`, `caveman`, `minimal`.

- `verbose` — Full explanations, reasoning, examples. For teaching/tutoring agents.
- `normal` — Default. Balanced prose.
- `concise` — Bullets, no filler.
- `caveman` — Short words. No grammar. Point made. Fun for user interaction.
- `minimal` — Raw data and conclusions only. Structured output.

When agents invoke other agents (delegation), automatically drop to `concise` or `minimal`. 50-75% token reduction for inter-agent communication. New `verbosity` field on agent definition, dropdown in agent config UI.

### 1.9 Narrator Mode on Tools — P1

Tools can optionally implement a narrator mode returning pre-computed structured facts alongside raw output. Prevents hallucinated numbers in data-sensitive tasks. `narrator_mode_supported: boolean` flag on tool definitions. When enabled, the tool returns a facts object the LLM narrates from rather than re-interpreting raw data.

Agent system prompts for relevant agents (Financial Analyst, Data Analyst) include guidance: "When tools return pre-computed facts, always use those rather than extracting numbers from raw output."

### 1.10 Progress State Persistence — P1

Missions and long automations maintain a structured progress record persisted to DB:

```json
{
  "completed": ["list of accomplished items"],
  "in_progress": "current work",
  "remaining": ["known remaining tasks"],
  "decisions": [{ "what": "...", "why": "...", "when": "..." }],
  "blockers": ["anything preventing progress"]
}
```

New `progress_state` JSON column on `MissionModel` and `DeploymentModel`. Read at start of each cycle/run, updated at end. Survives context resets, worker restarts, and session boundaries. Mission detail page gains a "Progress" tab.

### 1.11 Sprint Contracts for OODA Cycles — P2

Each mission cycle's Plan phase produces a testable contract — specific deliverables and success criteria. The Evaluate phase checks against the contract rather than making a subjective assessment. Failed evaluations trigger re-planning. Stored on `MissionCycle` record. Prevents self-evaluation bias.

### 1.12 Tool Call Extension via HITL — P1

When `execute_tool_loop()` exhausts `max_iterations` and the model is still calling tools, pause and ask the user: "Agent has used N tool calls. Allow N more?" On approval, extend the loop. On denial, instruct the agent to wrap up. Eliminates silent truncation and raw `<tool_call>` tag leakage.

### 1.13 Plan-Mode as Default for Non-Trivial Tasks — P1

New `plan_first: boolean` on agent config (default `true` for automation/mission, `false` for chat). Preamble fragment instructs the agent to use `task.create_plan` before acting. Execution timeline starts with a visible "Plan" step.

### 1.14 Tool Result Caching (300s TTL) — P1

Cache tool results per-execution with 300-second TTL in Redis. Cache key: `(run_id, tool_name, sorted(parameters))`. Identical tool calls within the same execution return cached results. Prevents redundant API calls and tool server processing.

### 1.15 Tool Loop Context Budget for Small-Context Models — P0

Local models with small context windows (4k-8k) are overwhelmed after a single tool call — the system prompt, tool definitions, tool result, and conversation history fill the context, evicting the user's original request. The tool loop needs context-aware budgeting: measure available context before each LLM call, truncate or summarize tool results to fit, and ensure the user's request is never evicted. This is distinct from 1.3 (compaction tiers for long conversations) — this is about surviving the very first tool turn on constrained models.

---

## Track 2: Knowledge System

### 2.1 Knowledge Pipeline Framework — P1

Implement a configurable knowledge extraction pipeline as a DAG of **capability slots**. Each slot defines what it does. Users snap in their preferred model/library per slot and toggle slots on/off. Parallel slots run concurrently. Outputs pass through content normalization, then a **consolidation LLM node** that merges the best parts.

#### Pipeline: Documents (PDF, DOCX, PPTX, XLSX)

| Slot                      | Purpose                     | Options                               |
| ------------------------- | --------------------------- | ------------------------------------- |
| Text Extraction           | Extract text with structure | Marker (default), Docling             |
| Table Extraction          | Structured table data       | Docling (default), Marker (--use_llm) |
| Embedded Image Extraction | Pull images from document   | PyMuPDF, Docling                      |
| Metadata Extraction       | Title, author, dates        | PyMuPDF, python-docx, built-in        |

#### Pipeline: Images

| Slot                     | Purpose                    | Options                                         |
| ------------------------ | -------------------------- | ----------------------------------------------- |
| Text/OCR Extraction      | Text found in image        | dots.mocr, Docling, Tesseract                   |
| Scene Description        | Visual content description | Configurable vision model via provider settings |
| Chart/Diagram Extraction | Structured data or SVG     | dots.mocr                                       |
| Visual Embedding (CLIP)  | Visual similarity vector   | OpenCLIP, SigLIP, any CLIP model via provider   |
| Metadata Extraction      | EXIF, dimensions           | Pillow, built-in                                |

#### Pipeline: Audio

| Slot                | Purpose                    | Options                                     |
| ------------------- | -------------------------- | ------------------------------------------- |
| Transcription       | Timestamped text           | faster-whisper (default), Cohere Transcribe |
| Speaker Diarization | Speaker labels per segment | pyannote, Falcon (Picovoice)                |
| Metadata Extraction | Duration, sample rate      | FFmpeg, built-in                            |

#### Pipeline: Video (new knowledge type)

| Slot                    | Purpose                              | Options                                                           |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| Audio Extraction        | Audio track                          | FFmpeg                                                            |
| Scene Detection         | Scene boundaries + keyframes         | PySceneDetect (AdaptiveDetector), FFmpeg scene filter             |
| Frame Description       | Visual descriptions at intervals     | Configurable vision model (LFM2.5-VL recommended for self-hosted) |
| Frame Text/OCR          | Text in frames (slides, whiteboards) | dots.mocr, Docling                                                |
| Visual Embedding (CLIP) | Per-keyframe visual vector           | OpenCLIP, SigLIP                                                  |
| Metadata Extraction     | Duration, resolution, codec          | FFmpeg                                                            |

Audio feeds into Audio pipeline. All slot outputs → normalization → consolidation LLM → chunking (timestamp-aligned ~30s chunks for video) → AI intelligence generation → embedding → memory extraction daemon.

#### Pipeline: Bookmarks/URLs

| Slot                | Purpose                                     | Options                                           |
| ------------------- | ------------------------------------------- | ------------------------------------------------- |
| Content Extraction  | Page content as markdown                    | Crawl4AI (default), Jina Reader, Chromium scraper |
| Screenshot          | Visual snapshot of page                     | PinchTab, Chromium                                |
| Metadata Extraction | Title, description, favicon, published date | OpenGraph parser, built-in                        |

#### Key design points:

- Every slot independently toggleable (on/off)
- Every slot has one active backend snapped in
- Parallel slots run concurrently via `asyncio.gather` or Celery group
- Consolidation LLM configurable (uses intelligence model)
- Pipeline configuration per-workspace or global
- Content normalization step between extraction and consolidation standardizes output format

**Recommended implementations:**

| Category                | Primary                         | Alternative             | Rationale                                                                                  |
| ----------------------- | ------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| Document parsing        | Marker (keep)                   | Docling (add)           | Marker: widest format support, GPU speed. Docling: 97.9% table accuracy, 5x faster on CPU. |
| OCR                     | dots.mocr                       | Tesseract, PaddleOCR    | 3B VLM, 100+ languages, charts→SVG, runs via vLLM                                          |
| Video transcription     | WhisperX (faster-whisper based) | Moonshine v2 (CPU-only) | 4x faster than openai-whisper, bundled alignment + diarization                             |
| Scene detection         | PySceneDetect                   | FFmpeg scene filter     | Content-aware AdaptiveDetector handles camera motion                                       |
| Video frame description | LFM2.5-VL via Ollama            | GPT-4o, Qwen2.5-VL      | Free, <2GB, processes keyframes locally                                                    |
| Bookmark extraction     | Crawl4AI                        | Jina Reader             | LLM-optimized markdown, anti-bot handling, 62K stars                                       |

### 2.2 Video Knowledge Type — P1

Add `VIDEO = "video"` to `KnowledgeType` enum. Create `video_processor.py`. Processing queued on `q_heavy_multimodal` Celery queue. GPU semaphore prevents concurrent multimodal tasks. Show "estimated processing: ~N minutes" feedback.

Retrieval returns timestamp deep-links — agents cite "the meeting at 14:32." Workspace search results for video chunks show keyframe alongside transcript excerpt.

### 2.3 Speech-to-Text Provider Abstraction — P1

Replace `openai-whisper` with a configurable STT provider system:

| Backend           | Default? | WER                       | Speed       | VRAM   |
| ----------------- | -------- | ------------------------- | ----------- | ------ |
| faster-whisper    | Yes      | ~7.4%                     | 4x baseline | 2-6 GB |
| Cohere Transcribe | No       | 5.42% (#1 HF leaderboard) | Moderate    | ~4 GB  |
| Moonshine v2      | Future   | 6.65%                     | 100x on CPU | <1 GB  |

`SpeechProvider` protocol with `transcribe()` method. Settings dropdown under AI Capabilities. Both audio and video pipelines call through the abstraction.

### 2.4 CLIP Embedding — P2

Separate vector stored as named `clip_vector` in Qdrant alongside `text_vector`. Enables visual similarity search. Applied to images and video keyframes. `workspace.search` gets optional `search_mode` parameter: `text` (default), `visual`, `hybrid`. Uses the CLIP model configured in provider settings.

### 2.5 Content Normalization — P2 ✅ DONE

Implemented in `normalizer.py` — stateless, deterministic markdown normalization applied to all slot outputs. Strips tool-specific page markers, normalizes heading levels, list markers, table formatting, and collapses excessive newlines.

### 2.6 Pipeline Model Selection — P1

Move model selection for intelligence (title/summary/tags/insights) and vision (frame description, image captioning) from per-workspace settings into the pipeline configuration UI. Pipeline-configured models apply globally across all workspaces. When no pipeline model is configured, fall back to the default model configured in AI Models settings.

Requires: update `resolve_provider()` to check pipeline config before workspace/global defaults, add model picker schemas to the pipeline backend-schemas endpoint, wire the intelligence job and vision backend to accept overrides from pipeline config.

### 2.7 Pipeline Model Download Management — P1

Unified model download page under AI Models settings for all locally-cached pipeline models: Marker (PDF extraction), OpenCLIP (visual search), Tesseract language packs, faster-whisper (STT), sentence-transformers (embedding/reranking). Each model shows download status, disk usage, and a download/remove button. Consolidates the previously separate PDF model page with all other pipeline model dependencies into one management surface.

### 2.8 Content Normalization — P2 ✅ DONE

See 2.5 above.

---

## Track 3: Memory System

### Architecture Overview

**Core design decisions:**

- All memories are **global** with optional reference fields (workspace_id, knowledge_id, agent_id, run_id) for provenance — not scoping
- **Multiple tiers** (short-term → long-term) with daemons that promote through distillation
- **Typed**: fact, preference, lesson, context, decision, experience
- **Timestamped** with `observed_at` — default retrieval filters to recent window, expandable on demand
- **Garbage collection** by daemons — invalidated memories hard-deleted after 90 days, unpromoted short-term after 30 days
- **Stored in PostgreSQL + Qdrant** — no new dependencies

### 3.1 Structured Memory Types — P1

Extend `memory.store` with typed categories:

| Type         | What it captures            | Consolidation behavior                              |
| ------------ | --------------------------- | --------------------------------------------------- |
| `fact`       | Verified information        | Deduplicate by entity, resolve conflicts temporally |
| `preference` | User's working style        | Merge into profile, never auto-delete               |
| `lesson`     | Mistakes and corrections    | Accumulate, never contradict                        |
| `context`    | Background for ongoing work | Short-lived, auto-expire if not promoted            |
| `decision`   | Decisions and rationale     | Preserve with full reasoning chain                  |
| `experience` | Tool/execution outcomes     | Aggregate into patterns                             |

New `memory_type` enum column on memory table. Optional `type` parameter on `memory.store` (default `context`). Optional `type` filter on `memory.recall`.

### 3.2 Temporal Memory Management — P1

All memories get `observed_at` timestamp (set at creation) and nullable `invalidated_at` (set on soft-delete). Default recall queries filter to last 30 days active memories. Agents can widen window explicitly. `memory.forget` sets `invalidated_at` instead of `DELETE`.

**Garbage collection** (by consolidation daemon):

- Invalidated memories: hard-delete after 90 days
- Active short-term never promoted: hard-delete after 30 days
- Active long-term: never auto-deleted, flag if not recalled in 6+ months
- Retention periods configurable in settings

### 3.3 Hybrid Retrieval for Memory — P1

Enhance `memory.recall` with three retrieval methods fused via Reciprocal Rank Fusion:

1. **Vector similarity** — Qdrant (already exists)
2. **Keyword matching** — PostgreSQL full-text search via `tsvector`/`tsquery` with GIN index (zero new dependencies)
3. **Relationship traversal** — Follow `memory_links` rows between related memories (created by consolidation daemon)

All three run in parallel. RRF merges results. Tool interface unchanged — agents get better results transparently.

### 3.4 Experiential Memory Auto-Capture — P1

System automatically writes short-term memories on notable events:

- Tool call failed with specific error
- Tool call sequence achieved a goal
- User correction after agent response
- Mission cycle met/missed sprint contract
- Automation run completed/failed

Each produces type `experience` memory with structured fields. Lightweight writes, no LLM calls. Consolidation daemon distills patterns later.

### 3.5 Agent Harness Memory Encouragement — P1

Preamble prompt fragment (~150-200 tokens) encouraging all agents to write memories:

- User preferences → `preference` type
- Important findings → `fact` type
- Corrections/mistakes → `lesson` type
- Notable tool outcomes → `experience` type
- Decisions with rationale → `decision` type
- Keep concise — one idea per memory
- Don't duplicate what's in the knowledge base

### 3.6 Memory Consolidation Daemon — P1

Celery Beat periodic task (every 15-30 minutes, configurable). Each run:

1. **Fetch** — Short-term memories older than 5-minute settling period
2. **Cluster** — Group semantically similar memories (vector similarity > 0.90)
3. **Deduplicate** — Within clusters, keep most complete version, invalidate rest
4. **Resolve conflicts** — Prefer newer observations, invalidate stale ones
5. **Distill** — For clusters with 3+ memories, LLM synthesizes a single consolidated memory
6. **Promote** — Frequently recalled or high-value memories promoted to long-term tier
7. **Garbage collect** — Hard-delete invalidated memories past retention window

Uses the configured intelligence model (cheaper). Logs operations to `consolidation_log` table.

### 3.7 Knowledge Extraction Daemon — P1

Background process bridging knowledge → memory:

**Reactive (on knowledge ingestion):**

- After extraction pipeline completes, produce memory fragments: key facts, entities, relationships
- Update workspace manifest memory (lightweight index for progressive loading)
- Flag conflicts with existing memories

**Proactive (periodic sweep, every 2 hours configurable):**

- Scan for knowledge items without corresponding memory fragments
- Find cross-document patterns — themes spanning multiple items
- Produce synthesis memories: "Workspace X contains 12 articles about Y with consensus on Z"
- Update workspace manifests

Each memory references `{workspace_id, knowledge_id}` for provenance. Memories are global — accessible to any agent.

### 3.8 Learning Extraction Daemon — P1

Background process reading execution records → producing learning memories:

- **Tool usage patterns** — Which tools succeed/fail for which task types
- **User preference patterns** — Aggregated from individual corrections
- **Mission learnings** — From sprint contract pass/fail history

Runs less frequently (every 6 hours or daily). Reads from `runs`, `run_steps`, `usage_records`, `mission_cycles` tables. Produces `lesson` type memories.

### 3.9 Progressive Knowledge Loading — P1

Workspace manifests live in memory (not system prompt). The knowledge extraction daemon produces and maintains per-workspace manifest memories (title, type, tags, short summary per item). Agents access via `memory.recall` when they need to know what's in a workspace. Zero baseline token cost. Manifest can be richer than system prompt injection since it's on-demand.

---

## Track 4: Tools & Capabilities

### 4.1 Native Browser Automation — P1

**Two-tool strategy:**

**PinchTab (interactive browsing)** — Docker sidecar, HTTP API, ~800 tokens/page.

| Tool                   | Purpose                               |
| ---------------------- | ------------------------------------- |
| `browser.navigate`     | Open a URL                            |
| `browser.snapshot`     | Get page structure                    |
| `browser.click`        | Click element by ref                  |
| `browser.type`         | Type text into element                |
| `browser.fill_form`    | Fill multiple form fields             |
| `browser.extract_text` | Clean text content (~800 tokens)      |
| `browser.screenshot`   | Screenshot (for vision models)        |
| `browser.evaluate`     | Execute JavaScript (defaults to HITL) |
| `browser.list_tabs`    | List open tabs                        |
| `browser.close_tab`    | Close a tab                           |

```yaml
# docker-compose.yml
pinchtab:
  image: pinchtab/pinchtab
  shm_size: 2g
  volumes:
    - pinchtab-data:/data
  networks:
    - openforge-internal
```

**Crawl4AI (web reading/extraction)** — Docker sidecar, REST API, LLM-optimized markdown. Replaces or supplements Jina Reader for bookmark content extraction. Also serves as a backend option in the knowledge pipeline's bookmark/URL content extraction slot.

**Why PinchTab + Crawl4AI:**

- PinchTab: Only tool with HTTP API + no agent loop + 800 tokens/page. Evaluated against browser-use (86K stars, agent loop conflict), Playwright MCP (114K tokens/session), Stagehand (agent loop conflict), Steel (no interactive REST API), and 10+ others.
- Crawl4AI: Best-in-class content extraction (62K stars), anti-bot handling, but can't drive interactive sessions. Complementary.

### 4.2 Tool Fixes & New Tools — P1

**Fix manifests:** `search_news` and `fetch_multiple` exist as code but are not in http/manifest.yaml — add them.

**Create mission tools:** `platform.mission.create` and `platform.mission.status` — tool server wrappers around existing backend API endpoints.

### 4.3 Tool Improvements — P1

- Add `published_date` to `http.search_web` results
- Add extraction mode options to `http.fetch_page` (markdown, text, structured)
- Add `--timeout` parameter to HTTP tools
- Add content type detection to `filesystem.read_file` for binary files
- Add `working_directory` parameter to `shell.execute`
- Add agent assignment to `task.create_plan` steps

### 4.4 Tool Chains / Macros — P2

Define common tool sequences as single callable units via YAML:

```yaml
name: research
steps:
  - tool: http.search_web
    inputs: { query: "{{query}}" }
    outputs: { urls: "results[].url" }
  - tool: http.fetch_multiple
    inputs: { urls: "{{urls}}" }
  - tool: memory.store
    inputs: { content: "{{content}}", type: "fact" }
```

Chains appear as regular tools (e.g., `chain.research`). Intermediate results hidden from LLM. Users can define custom chains.

---

## Track 5: Agent Quality & Behavior

### 5.1 Subagent Delegation Guidance — P1

Preamble prompt fragment guiding when and how to delegate:

- For 3+ step tasks involving different expertise, delegate subtasks
- One task per delegation for focused execution
- Check `system.agents` for available specialists

**Loop prevention (two mechanisms):**

1. **Invocation context:** When invoked by another agent, preamble says: "You were invoked by {parent_agent_name} to handle: {task_description}. Do NOT re-delegate this task. Complete it directly."
2. **Depth limit:** Track `delegation_depth` counter. Default max depth of 2. At max, `platform.agent.invoke` refuses and returns "Maximum delegation depth reached. Complete this task directly."

### 5.2 Verification-Before-Done Pattern — P1

Preamble fragment for automation/mission contexts (~80 tokens):

- Before marking complete, verify your work
- If you wrote code, run tests
- If you produced data, sanity-check key numbers
- If you cited sources, verify accessibility

### 5.3 Hierarchical Tool Scoping — P2

Curated agent templates ship with curated tool allowlists:

| Agent Role        | Tool Categories                          |
| ----------------- | ---------------------------------------- |
| Researcher        | http, browser, memory, workspace         |
| Code Engineer     | filesystem, shell, git, language, memory |
| Data Analyst      | data, filesystem, memory, workspace      |
| Knowledge Curator | workspace, memory, platform              |
| General Assistant | all (unchanged)                          |

Framework already supports this via `tools_config`. This is a data change on templates. User-created agents default to all tools.

---

## Track 6: Missions & Deployments

> Note: Mission system core (OODA executor, scheduler, rubric ratchet, workspaces, journals, phase sinks, auto-termination, budget limits) and deployment workspaces are **already implemented**.

### 6.1 Mission Health Monitor — P1

Celery Beat health check pass after mission cycle firing:

- **Stuck detection** — Rubric scores unchanged across N consecutive cycles (default 3) → auto-pause
- **Budget proximity** — 80% spent → warn, 90% → auto-pause
- **Failure rate** — Last N cycles all failed → auto-pause
- **Cycle duration anomaly** — 5x longer than rolling average → flag

Mission page shows health indicators (green/yellow/red). Notifications explain auto-pause reason.

### 6.2 Agent-to-Agent Messaging Within Missions — P2

Lightweight message bus for multi-agent coordination:

- `mission.post_message` / `mission.read_messages` tools
- Messages injected into context at cycle start
- Configurable `max_hops` (default 4) — prevents runaway inter-agent conversations
- Mission detail page shows "Messages" tab

### 6.3 Mission Templates — P2

| Template                       | Agent             | Cadence      | Goal Pattern                          |
| ------------------------------ | ----------------- | ------------ | ------------------------------------- |
| Continuous Market Intelligence | Deep Researcher   | Weekly       | Monitor {sector/topic}, weekly digest |
| Research Deep Dive             | Deep Researcher   | Daily        | Explore {topic} over {timeframe}      |
| Knowledge Base Maintenance     | Knowledge Curator | Weekly       | Review and improve {workspace}        |
| Competitive Landscape Monitor  | Deep Researcher   | Bi-weekly    | Track {competitors} changes           |
| Periodic Data Analysis         | Data Analyst      | Configurable | Analyze {data source}, report trends  |

Seed data with pre-filled fields and placeholder variables. "Start from template" option in Create Mission dialog.

### 6.4 Webhook Trigger Implementation — P1

The `WEBHOOK` enum value exists but has no handler. Implement:

1. `POST /api/v1/webhooks/{deployment_id}` endpoint
2. Optional HMAC validation via `webhook_secret`
3. Payload mapping using existing `payload_template` field
4. Run creation via existing Celery dispatch
5. Frontend: show generated URL and secret when trigger type is "webhook"

### 6.5 Event-Driven Triggers — P2

The `EVENT` enum value exists. Implement `EventTriggerHandler` subscribing to Redis pub/sub:

| Event                | Trigger                         |
| -------------------- | ------------------------------- |
| Knowledge created    | New item in specific workspace  |
| Knowledge updated    | Item modified                   |
| Mission completed    | Mission reaches completed state |
| Run completed/failed | Automation run finishes         |

Configuration: `event_type` (enum) + `filter` (JSON conditions). Enables reactive workflows.

---

## Track 7: Native LLM & Local AI

### 7.1 Replace openai-whisper with faster-whisper — P0

Drop-in replacement in `audio_processor.py`. Same model weights, same accuracy, 4x faster, 3x less memory. Swap `import whisper` for `from faster_whisper import WhisperModel`. Highest-impact, lowest-effort change in this roadmap.

### 7.2 Native Ollama Provider in Docker Stack — P1

Ollama becomes part of `docker-compose.yml` — not an external service. Appears as "OpenForge Native" provider.

- **Docker Compose** gets `ollama` service with volume for model storage
- **Auto-configured** on first boot — system detects native instance, creates provider automatically
- **Model management** through OpenForge settings UI — pull/remove models, assign to capabilities
- **Guided first-run** — detect hardware, suggest appropriate models, one-click pull
- **Capability gap detection** — "You're missing a vision model. Pull SmolVLM2 (<1GB)?"
- **Health monitoring** — connection status and model availability in settings

External Ollama instances can still be added as separate providers.

### 7.3 Liquid AI LFM2.5 Integration — P2

Add to native provider's recommended models:

- `lfm2.5-1.2b-instruct` — chat, 856MB RAM, 116 tok/s on CPU
- `lfm2.5-vl-1.6b` — vision, <2GB
- `lfm2.5-audio-1.5b` — native speech I/O, <2GB

Complete local multimodal stack under 3GB. Recommended for resource-constrained deployments.

---

## Track 8: UI/UX

### 8.1 Chat UI Polish — P0

Fix the 4-layer streaming pipeline:

- `useAgentStream` (ingestion) — verify event typing
- `useAgentPhase` (phase coordination) — fix state machine transitions
- `useStreamRenderer` (rendering) — fix RAF smoothing, auto-scroll logic
- `useThoughtQueue` (thought display) — fix timing and drain signaling

Also: stream state persistence to Redis for refresh recovery.

### 8.2 Inline Artifact Previews — P1

Small, compact preview cards within chat timeline when agents produce artifacts:

- Code files → syntax-highlighted preview
- Images/charts → thumbnail
- Knowledge items → title + summary card

Click to expand opens artifact preview modal (same pattern as existing attachment content preview). No sidebar — clean inline approach with modal for full view.

### 8.3 Mission Dashboard — Kanban View — P2

Six-column Kanban board (draft, active, paused, review, completed, terminated) alongside existing list view. Toggle in page header. Cards show mission name, agent, cycle count, last activity, health indicator. Drag-and-drop between columns triggers corresponding API action.

### 8.4 Natural Language Scheduling — P2

`POST /api/v1/utils/parse-schedule` — accepts natural language, one-shot LLM prompt to convert to cron, validated by `croniter`. Frontend text input with placeholder, shows parsed cron for confirmation. Raw cron input as "Advanced" toggle.

### 8.5 Smart Polling — P2

`useTabVisibility` hook listening to `document.visibilitychange`. On tab hidden: buffer server-side (Redis pub/sub preserves events). On tab visible: flush buffered events, resume rendering. Reduces backend load for users with multiple open tabs.

### 8.6 Design System Audit — P3

Audit against AI-app anti-patterns (default fonts, purple gradients, excessive card nesting, poor contrast). Establish documented design tokens: font families, size scale, spacing scale, semantic color palette. Surgical fixes, not a redesign.

### 8.7 Journal Knowledge Type — Distinct UI & Personality — P1

Journal entries currently render identically to Notes. Journals need their own visual identity and interaction patterns — date-anchored timeline view, mood/energy tagging, daily/weekly grouping, calendar heat-map navigation, and a distinct editor experience (prompts, reflection cues). Design the Journal as a first-class knowledge type with its own page layout, card style, and creation flow rather than reusing the Note editor verbatim.

---

## Track 9: Developer Experience

### 9.1 Autoresearch Optimization Pattern — P2

New skill template for iterative keep-or-revert optimization. Agent modifies a target, measures against a metric, keeps if improved, reverts if not, repeats. Used by the Optimizer Agent template for prompt tuning, code performance, hyperparameter search.

### 9.2 RepoLens / Codebase Understanding Tool — P3

New `code.analyze_repo` tool: accepts Git URL, clones to temp, analyzes structure (directory tree, language detection, dependencies, README, entry points), returns structured summary. One tool call replaces 15+ manual exploration calls.

---

## Implementation Phasing

### Phase 1: Foundation (Weeks 1-4)

- **[1.1]** ~~Strategy system cleanup (P0)~~ ✅ Done
- **[1.2]** Consecutive tool failure cap (P0)
- **[7.1]** Replace openai-whisper with faster-whisper (P0)
- **[8.1]** Chat UI polish (P0)
- **[4.2]** Fix tool manifests + create mission tools (P1)
- **[4.3]** Tool improvements (published_date, extraction modes, timeouts) (P1)
- **[1.12]** Tool call extension via HITL (P1)

### Phase 2: Memory & Context (Weeks 5-8)

- **[3.1]** Structured memory types (P1)
- **[3.2]** Temporal memory management (P1)
- **[3.3]** Hybrid retrieval for memory (P1)
- **[3.4]** Experiential memory auto-capture (P1)
- **[3.5]** Agent harness memory encouragement (P1)
- **[3.6]** Memory consolidation daemon (P1)
- **[1.3]** Context management system (compaction + monitoring + circuit breaker) (P1)
- **[1.5]** Tool result disk persistence (P1)

### Phase 3: Knowledge & Pipeline (Weeks 9-12)

- **[2.1]** Knowledge pipeline framework (P1)
- **[2.2]** Video knowledge type (P1)
- **[2.3]** Speech-to-text provider abstraction (P1)
- **[3.7]** Knowledge extraction daemon (P1)
- **[3.8]** Learning extraction daemon (P1)
- **[3.9]** Progressive knowledge loading (P1)

### Phase 4: Browser, Tools & Prompt Architecture (Weeks 13-16)

- **[4.1]** Native browser automation (PinchTab + Crawl4AI) (P1)
- **[1.8]** Compositional prompt architecture (fragments, caching, reminders, verbosity) (P1)
- **[1.4]** Speculative read-only tool execution (P1)
- **[1.6]** Structured error recovery hierarchy (P1)
- **[1.7]** Tool error recovery hints (P1)
- **[1.9]** Narrator mode on tools (P1)
- **[5.1]** Subagent delegation guidance with loop prevention (P1)
- **[5.2]** Verification-before-done pattern (P1)

### Phase 5: Missions, Deployments & Native AI (Weeks 17-22)

- **[6.1]** Mission health monitor (P1)
- **[6.4]** Webhook trigger implementation (P1)
- **[1.10]** Progress state persistence (P1)
- **[1.13]** Plan-mode as default (P1)
- **[1.14]** Tool result caching (P1)
- **[7.2]** Native Ollama provider in Docker stack (P1)
- **[8.2]** Inline artifact previews (P1)

### Phase 6: Polish & Advanced (Weeks 23-30)

- **[1.11]** Sprint contracts for OODA cycles (P2)
- **[2.4]** CLIP embedding (P2)
- **[2.5]** Content normalization (P2)
- **[4.4]** Tool chains / macros (P2)
- **[5.3]** Hierarchical tool scoping (P2)
- **[6.2]** Agent-to-agent messaging in missions (P2)
- **[6.3]** Mission templates (P2)
- **[6.5]** Event-driven triggers (P2)
- **[7.3]** Liquid AI LFM2.5 integration (P2)
- **[8.3]** Mission Kanban view (P2)
- **[8.4]** Natural language scheduling (P2)
- **[8.5]** Smart polling (P2)
- **[9.1]** Autoresearch optimization pattern (P2)

### Phase 7: Optional / Future (Ongoing)

- **[8.6]** Design system audit (P3)
- **[9.2]** RepoLens codebase understanding tool (P3)
- Agent sandbox / Sandcastle pattern (P3)
- A2A protocol compliance (P2)
- MCP server mode (P2)
- Extension system architecture (P1)
- Token usage dashboard (P1)
- Generator-evaluator pattern (P2)
- Automation canvas improvements (P1)
- Tool performance telemetry (P2)
- Recommended model registry (P2)
- Agent trust scoring (P2)
- Provider benchmarking (P2)
- Page/section citation metadata (P2)
- Learning from corrections (P2)
- Query intent classification for memory (P2)
- Anti-distillation / request signing (P3)
- Improve existing re-embedding mechanism (P2)

---

## Appendix A: Tool & Library Recommendations

### Document Parsing

| Role             | Recommended   | Alternatives Evaluated        | Why                                                                    |
| ---------------- | ------------- | ----------------------------- | ---------------------------------------------------------------------- |
| Primary parser   | Marker (keep) | Docling, LiteParse, MinerU    | Widest format support, GPU speed. Already integrated.                  |
| Secondary parser | Docling (add) | LiteParse, MinerU             | 97.9% table accuracy, 5x faster on CPU. Dual role: documents + images. |
| OCR              | dots.mocr     | Tesseract, EasyOCR, PaddleOCR | 3B VLM, 100+ languages, charts→SVG. Local via vLLM.                    |

### Video Pipeline

| Component         | Recommended                      | Alternatives Evaluated                         | Why                                                         |
| ----------------- | -------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Transcription     | WhisperX (faster-whisper based)  | openai-whisper, Whisper.cpp, Cohere Transcribe | 4x faster, bundled alignment + diarization                  |
| Scene detection   | PySceneDetect                    | FFmpeg scene filter                            | Content-aware AdaptiveDetector                              |
| Frame description | Configurable (LFM2.5-VL default) | GPT-4o, Qwen2.5-VL                             | Free, <2GB, local                                           |
| Diarization       | pyannote (via WhisperX)          | Falcon (Picovoice)                             | Integrated. Use Falcon if GPU-constrained (0.1 vs 1.5 GiB). |

### Browser Automation

| Role        | Recommended | Alternatives Evaluated                                                       | Why                                                          |
| ----------- | ----------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Interactive | PinchTab    | browser-use, Playwright MCP, Stagehand, Steel, Crawl4AI, Skyvern, 10+ others | HTTP API, no agent loop, 800 tokens/page, MIT, Docker-native |
| Web reading | Crawl4AI    | Jina Reader, Chromium scraper                                                | LLM-optimized markdown, anti-bot, 62K stars                  |

### Knowledge Graph (Future)

| Role            | Recommended     | Alternatives Evaluated    | Why                                                    |
| --------------- | --------------- | ------------------------- | ------------------------------------------------------ |
| Document graphs | LightRAG        | GraphRAG, Neo4j, NetworkX | 1/100th LLM cost, PostgreSQL backend (already running) |
| Temporal memory | Graphiti/Zep CE | Mem0, Letta               | 15-point LongMemEval advantage, temporal awareness     |

### Speech-to-Text

| Role              | Recommended       | Alternatives Evaluated      | Why                                  |
| ----------------- | ----------------- | --------------------------- | ------------------------------------ |
| Default           | faster-whisper    | openai-whisper, Whisper.cpp | Drop-in, 4x faster, 3x less memory   |
| Best accuracy     | Cohere Transcribe | NVIDIA Parakeet             | 5.42% WER, Apache 2.0, self-hostable |
| CPU-only (future) | Moonshine v2      | Whisper.cpp                 | 100x faster on CPU, 245M params      |

### Workflow Engine

| Role          | Recommended                 | Alternatives Evaluated     | Why                                                                         |
| ------------- | --------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| DAG execution | Custom GraphExecutor (keep) | Temporal, Prefect, Dagster | Already integrated, zero extra containers. Add checkpoint/resume if needed. |

---

## Appendix B: Source Material Index

| #   | Source                                       | Key Insight for OpenForge                                                                      |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Karpathy LLM Wiki gist                       | Pre-compiled knowledge compounds over time. Adapted to memory daemon architecture.             |
| 2   | Anthropic harness design blog                | Generator/evaluator separation. Context resets > compaction. Sprint contracts. Progress.json.  |
| 3   | Claude Code source leak analysis             | Compositional prompts, speculative execution, compaction circuit breaker, 250K API call waste. |
| 4   | InfoQ agentic engineering patterns           | Plan-first, subagent strategy, self-improvement loops, verification-before-done.               |
| 5   | Caveman mode for Claude                      | 50-75% token reduction via verbosity control.                                                  |
| 6   | freeCodeCamp MCP financial assistant         | Narrator pattern — deterministic facts before LLM narration. Audit trails.                     |
| 7   | IMPACT framework (morphllm.com)              | Four-level error recovery hierarchy.                                                           |
| 8   | Claude Code best practices / system prompts  | 110+ conditionally-loaded fragments, cache boundaries, three-layer memory.                     |
| 9   | AgentChattr                                  | Agent-to-agent messaging, loop guards, hop limits.                                             |
| 10  | Agentic platform engineering (dev.to)        | Hierarchical tool scoping, capability discovery.                                               |
| 11  | NousResearch/hermes-agent                    | Skill extraction from completions, natural-language cron.                                      |
| 12  | agentscope-ai/agentscope                     | Message hub, pipeline wrappers, agent-oriented programming.                                    |
| 13  | PinchTab (8.5K stars)                        | Token-efficient browser control (~800 tokens/page), HTTP API, no agent loop.                   |
| 14  | Crawl4AI (62K stars)                         | LLM-optimized web content extraction, anti-bot, REST API.                                      |
| 15  | browser-use (86K stars)                      | Leading AI browser lib — but has own agent loop, disqualified for OpenForge.                   |
| 16  | Playwright MCP (30K stars)                   | Full tool surface but 114K tokens/session. Optional secondary.                                 |
| 17  | Steel Browser (8.5K stars)                   | Good scraping REST API, but no interactive browsing via REST.                                  |
| 18  | Marker                                       | Document parsing — widest format support, GPU speed. Already integrated.                       |
| 19  | Docling (IBM)                                | 97.9% table accuracy, 5x faster on CPU than Marker.                                            |
| 20  | dots.mocr                                    | 3B VLM OCR, 100+ languages, charts→SVG.                                                        |
| 21  | Markit                                       | Universal content-to-markdown converter.                                                       |
| 22  | LiteParse                                    | Fast parser but sacrifices structure — poor fit for knowledge base.                            |
| 23  | WhisperX                                     | Integrated faster-whisper + pyannote + alignment.                                              |
| 24  | PySceneDetect                                | Content-aware video scene detection.                                                           |
| 25  | Liquid AI LFM2.5                             | On-device multimodal stack under 3GB.                                                          |
| 26  | Cohere Transcribe                            | #1 on HF Open ASR Leaderboard (5.42% WER).                                                     |
| 27  | Moonshine v2                                 | 245M param ASR, 100x faster on CPU.                                                            |
| 28  | LightRAG                                     | 1/100th LLM cost of GraphRAG, PostgreSQL backend.                                              |
| 29  | Graphiti/Zep                                 | Temporal knowledge graph, 15-point LongMemEval advantage over Mem0.                            |
| 30  | MAGMA (arxiv)                                | Multi-graph agentic memory, dual-stream ingestion.                                             |
| 31  | A-MEM (arxiv)                                | Zettelkasten self-organizing memory, retroactive updates.                                      |
| 32  | Mission Control (builderz-labs)              | Kanban dashboard, trust scoring, NL scheduling.                                                |
| 33  | AionUI                                       | Artifact preview patterns.                                                                     |
| 34  | Impeccable                                   | Design system audit, anti-pattern guidance.                                                    |
| 35  | WecoAI/awesome-autoresearch                  | Autoresearch keep-or-revert optimization pattern.                                              |
| 36  | Second Brain Skills                          | Progressive disclosure, skill packaging.                                                       |
| 37  | OpenPaper AI                                 | Citation-grounded responses, schema-based extraction.                                          |
| 38  | RepoLens AI                                  | Smart content filtering, output normalization.                                                 |
| 39  | A2A protocol (Google, IBM, Linux Foundation) | Industry standard for agent interoperability.                                                  |
| 40  | MCP (Anthropic, AAIF)                        | Tool/data access standard, 97M monthly SDK downloads.                                          |
| 41  | Talat app                                    | On-device meeting transcription, webhook export.                                               |
| 42  | AgentDiscuss                                 | Tool performance telemetry, peer evaluation.                                                   |
| 43  | Donut Browser                                | AI-native headless browser with MCP.                                                           |
| 44  | Sandcastle (mattpocock)                      | Sandboxed agent orchestration.                                                                 |
| 45  | neo4j-labs/create-context-graph              | POLE+O entity model, reasoning memory.                                                         |
| 46  | Skyvern                                      | Browser automation — disqualified (tightly coupled agent loop).                                |
| 47  | Lightpanda                                   | 11x faster browser engine — no REST API, future consideration.                                 |
| 48  | Browserless                                  | Mature infrastructure — SSPL license problematic.                                              |

---

_This roadmap is a living document. Items will be refined through brainstorming and adjusted based on implementation learnings. Last updated: April 5, 2026._
