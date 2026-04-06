# OpenForge Vision

OpenForge is a self-hosted AI agent platform for knowledge management, agent orchestration, and autonomous workflows. This document describes the product vision — what OpenForge is, how its entities relate, and where it's heading. Implementation details and specific improvement plans live in [roadmap.md](roadmap.md).

---

## Core Entities

| Entity | Role | Scope |
|--------|------|-------|
| **Agent** | A structured blueprint defining what an agent does — system prompt, parameters, outputs, tools, LLM config. Also serves as node type in automations. | Global (workspace-agnostic) |
| **Sink** | Defines what happens with agent output — create knowledge, call APIs, send notifications, write documents, log to history. Six types. | Global |
| **Automation** | A DAG workflow wiring agent nodes and sink nodes on a drag-and-drop canvas. Does nothing until deployed. | Global |
| **Deployment** | A live instance of an automation with concrete inputs and a trigger (manual, cron, interval, webhook, event). | Global |
| **Run** | A single execution of a deployment. Tracks steps, events, outputs, checkpoints. | Global |
| **Mission** | A goal-directed autonomous agent running continuously toward an objective via OODA cycles. | Global |
| **Chat** | Direct agent invocation via conversational UI. No hidden automations or deployments. | Global |
| **Workspace** | Root isolation boundary for knowledge. The only workspace-scoped concept. | Scoped |

### Entity Relationships

```
Agent Definition
  |-- version snapshots (immutable, one per save)
  |-- used as nodes in Automations
  |-- invoked directly via Chat
  |-- assigned to Missions

Automation (DAG)
  |-- Agent Nodes + Sink Nodes with wiring
  |-- does nothing until deployed

Deployment (live instance)
  |-- instantiates one Automation
  |-- triggers: manual, cron, interval, webhook, event
  |-- optionally owns a Workspace for cross-run persistence

Mission (autonomous agent)
  |-- OODA cycles: perceive → plan → act → evaluate → reflect
  |-- owns a Workspace for cross-cycle persistence
  |-- rubric ratchet evaluation (scores only increase)
  |-- scheduled via Celery Beat (60s poll interval)

Chat (direct execution)
  |-- agent executes with chat-context preamble/postamble
  |-- no automation/deployment/run artifacts
```

---

## Workspaces

Workspaces are knowledge containers. All other entities are workspace-agnostic.

- **User workspaces** — created by users, appear in navigation
- **Deployment workspaces** — owned by deployments, read-only UI, auto-teardown
- **Mission workspaces** — owned by missions, cross-cycle persistence, auto-teardown

Agents see all workspace names/descriptions in their system prompt and choose which to query. Workspace agents (one per workspace) appear in the chat agent list.

---

## Knowledge

Knowledge items are workspace-scoped. Types: note, fleeting note, bookmark, gist, image, audio, video, pdf, document, sheet, slides, journal.

Knowledge is processed through a **configurable extraction pipeline** — a DAG of capability slots (text extraction, table extraction, OCR, scene description, visual embedding, etc.) running in parallel, with a consolidation LLM merging outputs. Users configure which backends power each slot. See [roadmap.md](roadmap.md) Track 2 for pipeline architecture.

Search uses hybrid multi-representation retrieval in Qdrant (dense + sparse + summary vectors + RRF fusion) with optional cross-encoder reranking.

---

## Agents

OpenForge ships with curated agent templates covering research, analysis, writing, code, planning, and more. Each template defines a complete configuration. Users can use, edit, clone, or delete them.

### Agent Definition

Structured entity with typed fields: name, slug, description, icon, tags, system_prompt (parameterized template), llm_config, tools_config (per-tool allowed/HITL), memory_config, parameters (typed inputs), output_definitions (structured outputs), verbosity setting, version snapshots.

### System Prompt Architecture

Three sections: **preamble** (read-only, context-aware) → **user-editable section** → **postamble** (read-only, context-aware). Built from compositional prompt fragments — tagged, conditionally-loaded, cache-aware. Different content for chat vs automation vs mission contexts.

Template engine supports variables, loops, conditionals, 40+ built-in functions, output references.

---

## Chat

Direct agent invocation. Agent selection → input extraction from message → agent execution → streamed response with timeline visualization (thinking events, tool calls, sub-agent invocations, HITL approvals).

4-layer streaming pipeline: ingestion → phase coordination → stream rendering → thought queue. State persisted to Redis for refresh recovery. WebSocket per conversation via Redis pub/sub relay.

---

## Automations & Deployments

Automations are DAG workflows with agent nodes and sink nodes. Deployments are live instances with triggers. Graph execution: topological sort → parallel level execution → output routing to sinks. All agent invocations flow through a single `execute_agent()` path.

Triggers: manual, cron, interval, webhook (external POSTs), event (internal OpenForge events).

---

## Missions

Goal-directed autonomous agents. OODA cycles (perceive → plan → act → evaluate → reflect). Rubric ratchet evaluation. Celery Beat scheduling. Mission workspaces for cross-cycle persistence. Journal knowledge type for agent reflections. Phase sinks for output routing. Auto-termination on budget exhaustion, rubric completion, or unrecoverable error.

---

## Memory System

Global, multi-tier memory accessible to all agents. Agents are encouraged via system prompt harness to write memories actively. Types: fact, preference, lesson, context, decision, experience.

Three background daemons maintain the memory system:
- **Consolidation daemon** — promotes short-term to long-term via deduplication, conflict resolution, distillation, garbage collection
- **Knowledge extraction daemon** — bridges workspace knowledge into memory fragments (reactive on ingestion + proactive sweeps)
- **Learning extraction daemon** — extracts patterns from execution outcomes into lessons

Temporal management: `observed_at` timestamps, default time-window filtering, soft-delete with `invalidated_at`, configurable retention-based garbage collection.

Retrieval: hybrid (vector similarity + PostgreSQL FTS keyword matching + relationship traversal) fused via RRF. Stored in PostgreSQL + Qdrant.

---

## Tool System

Tools run in a separate microservice (tool-server) with security boundaries. Categories: filesystem, shell, data, git, language, memory, http, browser, task, skills, platform (workspace, agent, automation, deployment, sink, mission).

Browser automation via PinchTab (interactive, ~800 tokens/page) and Crawl4AI (web reading/extraction) as Docker sidecars.

Skills: installable extensions with `SKILL.md` descriptors. Native skills + external skills installed at first boot.

MCP integration for external tool providers. HITL for sensitive tools. Tool result caching (300s TTL). Tool error recovery hints. Tool chains (YAML-defined sequences as single callable units).

---

## LLM Provider System

Standard providers: OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, Mistral, OpenRouter, xAI, Cohere, ZhipuAI, HuggingFace, Ollama, custom compatible endpoints.

Virtual providers: Router (load balancing), Council (multi-model consensus), Optimizer (prompt optimization).

**OpenForge Native** — Built-in Ollama instance in the Docker stack. Zero-config local AI. Guided first-run setup with hardware-aware model recommendations.

Per-capability model assignment: chat, vision, embedding, speech-to-text, text-to-speech, CLIP.

Speech-to-text provider abstraction: faster-whisper (default), Cohere Transcribe (higher accuracy), extensible.

All API keys encrypted at rest (Fernet).

---

## Authentication

Optional password-based authentication with JWT sessions. When `ADMIN_PASSWORD` is set, all routes require valid session. When unset, authentication is disabled.

---

## UI/UX Principles

- No browser-native dialogs — always custom UI
- Workspace-agnostic pages use workspace-agnostic endpoints
- Full dark/light theme support
- Command palette (`Cmd/Ctrl+K`)
- Streaming polish: RAF rendering, thought queue staggering, auto-scroll, shimmer animations
- Inline artifact previews with modal expansion for agent-produced content

---

## Future Direction

The following represent longer-term vision areas. Detailed plans and phasing are in [roadmap.md](roadmap.md).

- **Standards compliance** — A2A protocol for agent interoperability, MCP server mode for tool exposure to external agents
- **Extensions** — Connect external services (Karakeep, Immich, Gmail, Google Drive) with standardized auth, entity models, and tool sets
- **Advanced knowledge graphs** — LightRAG/Graphiti for entity graphs and multi-hop reasoning on top of the existing memory and knowledge systems
- **Agent self-improvement** — Skill extraction from successful completions, autoresearch optimization patterns
- **Observability** — Token usage dashboards, agent trust scoring, provider benchmarking, tool performance telemetry
