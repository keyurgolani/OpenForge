/**
 * OpenForge Product Vocabulary Module
 *
 * This module defines the canonical domain names, constants, and terminology
 * for the OpenForge product. All product copy, route names, and internal
 * identifiers should reference this file to prevent drift.
 *
 * Core Domain Nouns:
 * - PROFILE: Agent Profile - a worker abstraction defining capabilities
 * - WORKFLOW: Workflow Definition - a composable execution graph
 * - MISSION: Mission Definition - a packaged autonomous unit
 * - TRIGGER: Trigger Definition - an automation rule
 * - RUN: Run - an execution instance
 * - ARTIFACT: Artifact - a produced output
 * - KNOWLEDGE: Knowledge - user-provided context/data
 */

// =============================================================================
// Domain Noun Types
// =============================================================================

export type DomainNoun =
  | 'profile'
  | 'workflow'
  | 'mission'
  | 'trigger'
  | 'run'
  | 'artifact'
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
  | 'paused';

export type ExecutionMode =
  | 'autonomous'
  | 'supervised'
  | 'interactive'
  | 'manual';

export type TriggerType =
  | 'schedule'
  | 'event'
  | 'webhook'
  | 'manual';

export type ArtifactType =
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

// =============================================================================
// Domain Constants
// =============================================================================

export const DOMAIN_NOUNS = {
  PROFILE: 'profile' as DomainNoun,
  WORKFLOW: 'workflow' as DomainNoun,
  MISSION: 'mission' as DomainNoun,
  TRIGGER: 'trigger' as DomainNoun,
  RUN: 'run' as DomainNoun,
  ARTIFACT: 'artifact' as DomainNoun,
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
};

export const EXECUTION_MODES = {
  AUTONOMOUS: 'autonomous' as ExecutionMode,
  SUPERVISED: 'supervised' as ExecutionMode,
  INTERACTIVE: 'interactive' as ExecutionMode,
  MANUAL: 'manual' as ExecutionMode,
};

export const TRIGGER_TYPES = {
  SCHEDULE: 'schedule' as TriggerType,
  EVENT: 'event' as TriggerType,
  WEBHOOK: 'webhook' as TriggerType,
  MANUAL: 'manual' as TriggerType,
};

export const ARTIFACT_TYPES = {
  NOTE: 'note' as ArtifactType,
  DOCUMENT: 'document' as ArtifactType,
  REPORT: 'report' as ArtifactType,
  PLAN: 'plan' as ArtifactType,
  TARGET: 'target' as ArtifactType,
  EVIDENCE_PACKET_REF: 'evidence_packet_ref' as ArtifactType,
  RESEARCH_BRIEF: 'research_brief' as ArtifactType,
  DATASET: 'dataset' as ArtifactType,
  ALERT: 'alert' as ArtifactType,
  EXPERIMENT_RESULT: 'experiment_result' as ArtifactType,
  NOTIFICATION_DRAFT: 'notification_draft' as ArtifactType,
  GENERIC_DOCUMENT: 'generic_document' as ArtifactType,
  CODE: 'code' as ArtifactType,
  DATA: 'data' as ArtifactType,
  IMAGE: 'image' as ArtifactType,
  SUMMARY: 'summary' as ArtifactType,
  INSIGHT: 'insight' as ArtifactType,
  OTHER: 'other' as ArtifactType,
};

// =============================================================================
// User-Facing Labels
// =============================================================================

export const DOMAIN_LABELS: Record<DomainNoun, string> = {
  profile: 'Profile',
  workflow: 'Workflow',
  mission: 'Mission',
  trigger: 'Trigger',
  run: 'Run',
  artifact: 'Artifact',
  knowledge: 'Knowledge',
};

export const DOMAIN_LABELS_PLURAL: Record<DomainNoun, string> = {
  profile: 'Profiles',
  workflow: 'Workflows',
  mission: 'Missions',
  trigger: 'Triggers',
  run: 'Runs',
  artifact: 'Artifacts',
  knowledge: 'Knowledge',
};

export const DOMAIN_DESCRIPTIONS: Record<DomainNoun, string> = {
  profile: 'Agent profiles define the capabilities, prompts, and behaviors of AI workers.',
  workflow: 'Workflows are composable execution graphs that define how tasks are performed.',
  mission: 'Missions are packaged autonomous units that combine workflows, profiles, and triggers.',
  trigger: 'Triggers define when and how missions are automatically executed.',
  run: 'Runs are execution instances of workflows or missions.',
  artifact: 'Artifacts are outputs produced by mission runs.',
  knowledge: 'Knowledge is user-provided context and data for AI processing.',
};

// =============================================================================
// Navigation Labels
// =============================================================================

export const NAV_ITEMS = [
  { key: 'workspace', label: 'Workspace', route: '/' },
  { key: 'knowledge', label: 'Knowledge', route: '/knowledge' },
  { key: 'chat', label: 'Chat', route: '/chat' },
  { key: 'profiles', label: 'Profiles', route: '/profiles' },
  { key: 'workflows', label: 'Workflows', route: '/workflows' },
  { key: 'missions', label: 'Missions', route: '/missions' },
  { key: 'runs', label: 'Runs', route: '/runs' },
  { key: 'artifacts', label: 'Artifacts', route: '/artifacts' },
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
  PROFILES: '/profiles',
  WORKFLOWS: '/workflows',
  MISSIONS: '/missions',
  RUNS: '/runs',
  ARTIFACTS: '/artifacts',
  SETTINGS: '/settings',
} as const;

// =============================================================================
// Route Segment Constants
// =============================================================================

export const ROUTE_SEGMENTS: Record<DomainNoun, string> = {
  profile: 'profiles',
  workflow: 'workflows',
  mission: 'missions',
  trigger: 'triggers',
  run: 'runs',
  artifact: 'artifacts',
  knowledge: 'knowledge',
};

export const API_PREFIXES: Record<DomainNoun, string> = {
  profile: '/api/v1/profiles',
  workflow: '/api/v1/workflows',
  mission: '/api/v1/missions',
  trigger: '/api/v1/triggers',
  run: '/api/v1/runs',
  artifact: '/api/v1/artifacts',
  knowledge: '/api/v1/knowledge',
};

// =============================================================================
// Empty State Copy Seeds
// =============================================================================

export const EMPTY_STATE_COPY: Record<DomainNoun, { title: string; description: string; cta: string }> = {
  profile: {
    title: 'No profiles yet',
    description: 'Create your first agent profile to define capabilities and behaviors.',
    cta: 'Create Profile',
  },
  workflow: {
    title: 'No workflows yet',
    description: 'Build your first workflow to define how tasks are executed.',
    cta: 'Create Workflow',
  },
  mission: {
    title: 'No missions yet',
    description: 'Deploy your first mission to run autonomous workflows.',
    cta: 'Create Mission',
  },
  trigger: {
    title: 'No triggers yet',
    description: 'Set up triggers to automate mission execution.',
    cta: 'Create Trigger',
  },
  run: {
    title: 'No runs yet',
    description: 'Execute a mission or workflow to see runs here.',
    cta: 'Start Run',
  },
  artifact: {
    title: 'No artifacts yet',
    description: 'Artifacts produced by your missions will appear here.',
    cta: 'View Missions',
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
  | 'prompts'
  | 'policies'
  | 'approvals'
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
  prompts: 'Prompts',
  policies: 'Policies',
  approvals: 'Approvals',
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
  prompts: 'Manage prompt templates for agent profiles.',
  policies: 'Define execution policies and guardrails.',
  approvals: 'Review and approve pending human-in-the-loop items.',
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
  audio: 'Audio',
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
 * 1. "Mission" is the packaged autonomous concept.
 *    - A Mission combines: Workflow + Profile(s) + Trigger(s) + Policies
 *    - Users deploy Missions, not individual Agents
 *
 * 2. "Profile" (Agent Profile) is a worker abstraction, NOT the top-level product unit.
 *    - Profiles define capabilities, prompts, and behaviors
 *    - Profiles are used BY Missions, they are not standalone products
 *
 * 3. "Hand" is REJECTED as a product term.
 *    - The term "Hand" is not used in the product vocabulary
 *    - Use "Mission" for autonomous units
 *
 * 4. "Agent" is a generic term for AI behavior, not a specific product noun.
 *    - Use "Profile" when referring to the configuration
 *    - Use "Mission" when referring to the deployed autonomous unit
 *
 * 5. Legacy terms to avoid in new code:
 *    - AgentDefinition → Use AgentProfile or Profile
 *    - AgentSchedule → Use Trigger
 *    - ContinuousTarget → Use Artifact or Mission output
 */
