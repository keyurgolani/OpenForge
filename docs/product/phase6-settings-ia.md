# Phase 6 Settings IA

## Purpose

Settings owns global system configuration. It should not be used as a dumping ground for workspace content or runtime execution state.

## Implemented Sections

| Section | Route | Scope |
|---------|-------|-------|
| Workspaces | `/settings/workspaces` | system/workspace administration |
| Models | `/settings/models/*` | provider and model assignment |
| Prompts | `/settings/prompts` | managed prompt catalog |
| Policies | `/settings/policies` | tool and trust policies |
| Approvals | `/settings/approvals` | approval inbox |
| Pipelines | `/settings/pipelines` | processing configuration |
| Skills | `/settings/skills` | installed skill management |
| MCP | `/settings/mcp` | external capability servers |
| Audit | `/settings/audit` | operator logs |
| Import | `/settings/import` | system data intake |
| Export | `/settings/export` | system data export |

## Redirect Rules

- `/settings` routes through the settings landing/index surface.
- `/settings/models` redirects to `/settings/models/providers`.
- legacy aliases such as `llm`, `tools`, and `hitl` should redirect into the canonical settings sections instead of preserving old information architecture terms.

## Ownership Rule

Settings should configure prompts, policies, models, MCP, and workspace administration.
Profiles, workflows, missions, runs, artifacts, and knowledge remain in the workspace shell.
