---
name: Automation Design
slug: automation-design
description: Design patterns for OpenForge automations. Covers DAG workflow design, agent node wiring, sink configuration, deployment strategy, and trigger selection.
tags:
  - automation
  - design
  - patterns
---

# Automation Design Skill for OpenForge

## Core Concepts

An **automation** is a DAG (directed acyclic graph) of agent nodes and sink nodes.
- **Agent nodes**: Execute an agent with inputs, produce structured outputs
- **Sink nodes**: Accept agent outputs and perform an action (save to knowledge, call API, notify, etc.)
- **Wiring**: Connects agent outputs to other agent inputs or to sink inputs
- **Static inputs**: Values set at design time (baked into the automation)
- **Deployment inputs**: Values that must be provided when deploying (unfilled + unwired inputs)

## Design Patterns

### Sequential Pipeline
Agent A -> Agent B -> Agent C -> Sink
- Good for: research -> analysis -> writing pipelines
- Each agent enriches the output of the previous one

### Fan-out / Fan-in
Agent A -> [Agent B, Agent C, Agent D] -> Agent E -> Sink
- Good for: multi-dimensional analysis (parallel specialists feeding a synthesizer)
- Agents B/C/D run in parallel, E combines their outputs

### Monitor + React
Agent A (monitors) -> Agent B (analyzes if threshold met) -> Sink (notifies)
- Good for: news monitoring, price alerts, change detection
- Agent A runs on schedule, Agent B only fires if Agent A finds something

## Wiring Rules

- Output type must be compatible with input type (text to text, json to text OK)
- Any input not wired AND not given a static value becomes a deployment input
- Sinks accept ANY output — they're flexible endpoints

## Trigger Selection

| Trigger | When to Use |
|---------|-------------|
| **Manual** | One-off tasks, testing, on-demand reports |
| **Cron** | Daily/weekly/monthly scheduled tasks (e.g., `0 7 * * 1-5` = weekdays 7 AM) |
| **Interval** | Continuous monitoring (e.g., every 6 hours) |

## Common Automation Templates

1. **Daily Digest**: researcher -> writer -> knowledge_create sink
2. **Watchdog**: monitor agent -> researcher -> notification sink
3. **Content Pipeline**: researcher -> writer -> article sink
4. **Multi-Source Analysis**: [researcher A, researcher B, researcher C] -> synthesizer -> knowledge sink
