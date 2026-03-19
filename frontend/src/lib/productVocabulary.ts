/**
 * OpenForge Product Vocabulary Module
 *
 * This module defines the canonical domain names, constants, and terminology
 * for the OpenForge product. All product copy, route names, and internal
 * identifiers should reference this file to prevent drift.
 *
 * Core Domain Nouns:
 * - AGENT: Agent - an AI worker definition with capabilities and blueprint
 * - AUTOMATION: Automation - a packaged autonomous agent execution
 * - RUN: Run - an execution instance
 * - OUTPUT: Output - a produced output
 * - KNOWLEDGE: Knowledge - user-provided context/data
 */

// =============================================================================
// Domain Noun Types
// =============================================================================

export type DomainNoun =
  | 'agent'
  | 'automation'
  | 'run'
  | 'output'
  | 'knowledge';

export type DomainStatus =
  | 'draft'
  | 'active'
  | 'archived'
  | 'deleted'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'disabled';

export type ExecutionMode =
  | 'interactive'
  | 'background'
  | 'hybrid';

export type OutputType =
  | 'note'
  | 'document'
  | 'report'
  | 'plan'
  | 'target'
  | 'evidence_packet_ref'
  | 'research_brief'
  | 'dataset'
  | 'alert'
  | 'experiment_result'
  | 'notification_draft'
  | 'generic_document'
  | 'code'
  | 'data'
  | 'image'
  | 'summary'
  | 'insight'
  | 'other';

export type Visibility =
  | 'private'
  | 'workspace'
  | 'organization'
  | 'public';

// Backward-compatible alias
/** @deprecated Use OutputType instead */
export type ArtifactType = OutputType;

// =============================================================================
// Domain Constants
// =============================================================================

export const DOMAIN_NOUNS = {
  AGENT: 'agent' as DomainNoun,
  AUTOMATION: 'automation' as DomainNoun,
  RUN: 'run' as DomainNoun,
  OUTPUT: 'output' as DomainNoun,
  KNOWLEDGE: 'knowledge' as DomainNoun,
};

export const DOMAIN_STATUSES = {
  DRAFT: 'draft' as DomainStatus,
  ACTIVE: 'active' as DomainStatus,
  ARCHIVED: 'archived' as DomainStatus,
  DELETED: 'deleted' as DomainStatus,
  PENDING: 'pending' as DomainStatus,
  RUNNING: 'running' as DomainStatus,
  COMPLETED: 'completed' as DomainStatus,
  FAILED: 'failed' as DomainStatus,
  CANCELLED: 'cancelled' as DomainStatus,
  PAUSED: 'paused' as DomainStatus,
  DISABLED: 'disabled' as DomainStatus,
};

export const EXECUTION_MODES = {
  INTERACTIVE: 'interactive' as ExecutionMode,
  BACKGROUND: 'background' as ExecutionMode,
  HYBRID: 'hybrid' as ExecutionMode,
};

export const OUTPUT_TYPES = {
  NOTE: 'note' as OutputType,
  DOCUMENT: 'document' as OutputType,
  REPORT: 'report' as OutputType,
  PLAN: 'plan' as OutputType,
  TARGET: 'target' as OutputType,
  EVIDENCE_PACKET_REF: 'evidence_packet_ref' as OutputType,
  RESEARCH_BRIEF: 'research_brief' as OutputType,
  DATASET: 'dataset' as OutputType,
  ALERT: 'alert' as OutputType,
  EXPERIMENT_RESULT: 'experiment_result' as OutputType,
  NOTIFICATION_DRAFT: 'notification_draft' as OutputType,
  GENERIC_DOCUMENT: 'generic_document' as OutputType,
  CODE: 'code' as OutputType,
  DATA: 'data' as OutputType,
  IMAGE: 'image' as OutputType,
  SUMMARY: 'summary' as OutputType,
  INSIGHT: 'insight' as OutputType,
  OTHER: 'other' as OutputType,
};

/** @deprecated Use OUTPUT_TYPES instead */
export const ARTIFACT_TYPES = OUTPUT_TYPES;

// =============================================================================
// User-Facing Labels
// =============================================================================

export const DOMAIN_LABELS: Record<DomainNoun, string> = {
  agent: 'Agent',
  automation: 'Automation',
  run: 'Run',
  output: 'Output',
  knowledge: 'Knowledge',
};

export const DOMAIN_LABELS_PLURAL: Record<DomainNoun, string> = {
  agent: 'Agents',
  automation: 'Automations',
  run: 'Runs',
  output: 'Outputs',
  knowledge: 'Knowledge',
};

export const DOMAIN_DESCRIPTIONS: Record<DomainNoun, string> = {
  agent: 'Agents define capabilities, blueprints, and behaviors for AI workers.',
  automation: 'Automations run agents on triggers and schedules.',
  run: 'Runs are execution instances of agent strategies.',
  output: 'Outputs are durable results produced by agent runs.',
  knowledge: 'Knowledge is user-provided context and data for AI processing.',
};

// =============================================================================
// Navigation Labels
// =============================================================================

export const NAV_ITEMS = [
  { key: 'workspace', label: 'Workspace', route: '/' },
  { key: 'knowledge', label: 'Knowledge', route: '/knowledge' },
  { key: 'chat', label: 'Chat', route: '/chat' },
  { key: 'agents', label: 'Agents', route: '/agents' },
  { key: 'automations', label: 'Automations', route: '/automations' },
  { key: 'runs', label: 'Runs', route: '/runs' },
  { key: 'outputs', label: 'Outputs', route: '/outputs' },
  { key: 'settings', label: 'Settings', route: '/settings' },
] as const;

// =============================================================================
// Route Keys
// =============================================================================

export const ROUTE_KEYS = {
  HOME: '/',
  WORKSPACE: '/',
  KNOWLEDGE: '/knowledge',
  CHAT: '/chat',
  AGENTS: '/agents',
  AUTOMATIONS: '/automations',
  RUNS: '/runs',
  OUTPUTS: '/outputs',
  SETTINGS: '/settings',
} as const;

// =============================================================================
// Route Segment Constants
// =============================================================================

export const ROUTE_SEGMENTS: Record<DomainNoun, string> = {
  agent: 'agents',
  automation: 'automations',
  run: 'runs',
  output: 'outputs',
  knowledge: 'knowledge',
};

export const API_PREFIXES: Record<DomainNoun, string> = {
  agent: '/api/v1/agents',
  automation: '/api/v1/automations',
  run: '/api/v1/runs',
  output: '/api/v1/outputs',
  knowledge: '/api/v1/knowledge',
};

// =============================================================================
// Empty State Copy Seeds
// =============================================================================

export const EMPTY_STATE_COPY: Record<DomainNoun, { title: string; description: string; cta: string }> = {
  agent: {
    title: 'No agents yet',
    description: 'Create your first agent to define capabilities and behaviors.',
    cta: 'Create Agent',
  },
  automation: {
    title: 'No automations yet',
    description: 'Create your first automation to run agents on triggers and schedules.',
    cta: 'Create Automation',
  },
  run: {
    title: 'No runs yet',
    description: 'Execute an agent or automation to see runs here.',
    cta: 'Start Run',
  },
  output: {
    title: 'No outputs yet',
    description: 'Outputs produced by your agent runs will appear here.',
    cta: 'View Agents',
  },
  knowledge: {
    title: 'No knowledge yet',
    description: 'Add documents, notes, and other context for AI processing.',
    cta: 'Add Knowledge',
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

export function getLabel(domain: DomainNoun, plural: boolean = false): string {
  if (plural) {
    return DOMAIN_LABELS_PLURAL[domain] || domain;
  }
  return DOMAIN_LABELS[domain] || domain;
}

export function getRouteSegment(domain: DomainNoun): string {
  return ROUTE_SEGMENTS[domain] || domain;
}

export function getApiPrefix(domain: DomainNoun): string {
  return API_PREFIXES[domain] || `/api/v1/${domain}`;
}

export function getDescription(domain: DomainNoun): string {
  return DOMAIN_DESCRIPTIONS[domain] || '';
}

export function getEmptyStateCopy(domain: DomainNoun): { title: string; description: string; cta: string } {
  return EMPTY_STATE_COPY[domain] || { title: 'No items', description: '', cta: 'Create' };
}

// =============================================================================
// Settings Section Labels
// =============================================================================

export type SettingsSection =
  | 'workspaces'
  | 'models'
  | 'tools'
  | 'pipelines'
  | 'skills'
  | 'mcp'
  | 'audit'
  | 'import'
  | 'export';

export type SettingsModelSubsection =
  | 'providers'
  | 'reasoning'
  | 'vision'
  | 'embedding'
  | 'audio'
  | 'clip'
  | 'pdf';

export const SETTINGS_LABELS: Record<SettingsSection, string> = {
  workspaces: 'Workspaces',
  models: 'AI Models',
  tools: 'Tools',
  pipelines: 'Pipelines',
  skills: 'Skills',
  mcp: 'MCP Servers',
  audit: 'Audit',
  import: 'Import',
  export: 'Export',
};

export const SETTINGS_DESCRIPTIONS: Record<SettingsSection, string> = {
  workspaces: 'Manage workspaces and their configurations.',
  models: 'Configure AI model providers and model assignments.',
  tools: 'View and manage native agent tools and permissions.',
  pipelines: 'Configure data processing pipelines.',
  skills: 'Manage custom skills and capabilities.',
  mcp: 'Configure Model Context Protocol servers.',
  audit: 'View audit logs and container logs.',
  import: 'Import data from external sources.',
  export: 'Export workspace data.',
};

export const SETTINGS_MODEL_LABELS: Record<SettingsModelSubsection, string> = {
  providers: 'Providers',
  reasoning: 'Reasoning',
  vision: 'Vision',
  embedding: 'Embedding',
  audio: 'Speech',
  clip: 'CLIP',
  pdf: 'PDF',
};

export const SETTINGS_MODEL_DESCRIPTIONS: Record<SettingsModelSubsection, string> = {
  providers: 'Configure LLM provider credentials and settings.',
  reasoning: 'Assign reasoning models for chat and analysis.',
  vision: 'Assign vision models for image understanding.',
  embedding: 'Assign embedding models for vector search.',
  audio: 'Assign audio models for speech processing.',
  clip: 'Assign CLIP models for multimodal search.',
  pdf: 'Assign PDF processing models.',
};

// =============================================================================
// Terminology Notes
// =============================================================================

/**
 * IMPORTANT TERMINOLOGY DECISIONS:
 *
 * 1. "Agent" is the primary worker abstraction.
 *    - Agents define capabilities, blueprints, and behaviors
 *    - Agents power both interactive chat and background automations
 *
 * 2. "Automation" is the packaged autonomous concept.
 *    - An Automation combines: Agent + Trigger Config + Budget + Output Config
 *    - Users deploy Automations for unattended agent execution
 *
 * 3. "Output" is the durable result produced by agent runs.
 *    - Outputs are versioned, linkable, and publishable
 *    - Previously called "Artifact" -- renamed for clarity
 *
 * 4. Legacy terms no longer used in the frontend:
 *    - Profile → replaced by Agent
 *    - Workflow → removed (agents use strategies directly)
 *    - Mission → replaced by Automation
 *    - Trigger → folded into Automation trigger_config
 *    - Catalog → removed
 *    - Artifact → replaced by Output
 */
