/**
 * Canonical frontend route definitions.
 *
 * Workspace-specific pages (Knowledge, Chat, Search) live under /w/:workspaceId.
 * Domain entities (Agents, Automations, Runs, Outputs) are
 * workspace-agnostic and live at the top level.
 */

const WORKSPACE_PREFIX = '/w/:workspaceId';

export const ROUTES = {
  LOGIN: '/login',
  ONBOARDING: '/onboarding',

  // Settings routes (global, not workspace-scoped)
  SETTINGS: '/settings',
  SETTINGS_WORKSPACES: '/settings/workspaces',
  SETTINGS_MODELS: '/settings/models',
  SETTINGS_MODELS_PROVIDERS: '/settings/models/providers',
  SETTINGS_MODELS_REASONING: '/settings/models/reasoning',
  SETTINGS_MODELS_VISION: '/settings/models/vision',
  SETTINGS_MODELS_EMBEDDING: '/settings/models/embedding',
  SETTINGS_MODELS_AUDIO: '/settings/models/audio',
  SETTINGS_MODELS_CLIP: '/settings/models/clip',
  SETTINGS_MODELS_PDF: '/settings/models/pdf',
  SETTINGS_PIPELINES: '/settings/pipelines',
  SETTINGS_SKILLS: '/settings/skills',
  SETTINGS_MCP: '/settings/mcp',
  SETTINGS_AUDIT: '/settings/audit',
  SETTINGS_IMPORT: '/settings/import',
  SETTINGS_EXPORT: '/settings/export',
  // Legacy routes (redirect to new structure)
  SETTINGS_PROVIDERS: '/settings/models/providers',
  SETTINGS_TOOLS: '/settings/skills',

  // Workspace-scoped routes
  WORKSPACE: WORKSPACE_PREFIX,
  DASHBOARD: WORKSPACE_PREFIX,
  KNOWLEDGE: `${WORKSPACE_PREFIX}/knowledge`,
  KNOWLEDGE_ITEM: `${WORKSPACE_PREFIX}/knowledge/:knowledgeId`,
  CHAT: `${WORKSPACE_PREFIX}/chat`,
  CHAT_CONVERSATION: `${WORKSPACE_PREFIX}/chat/:conversationId`,
  SEARCH: `${WORKSPACE_PREFIX}/search`,

  // Domain entity routes (workspace-agnostic)
  AGENTS: '/agents',
  AGENT_DETAIL: '/agents/:agentId',
  AUTOMATIONS: '/automations',
  AUTOMATION_DETAIL: '/automations/:automationId',
  RUNS: '/runs',
  RUN_DETAIL: '/runs/:runId',
  OUTPUTS: '/outputs',
  OUTPUT_DETAIL: '/outputs/:outputId',
  /** @deprecated Use OUTPUTS */
  ARTIFACTS: '/outputs',
  /** @deprecated Use OUTPUT_DETAIL */
  ARTIFACT_DETAIL: '/outputs/:outputId',
} as const;

export function routeWithParams(
  route: string,
  params: Record<string, string | number | undefined | null>,
): string {
  let result = route;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    result = result.replace(`:${key}`, String(value));
  }
  return result;
}

export function workspaceRoute(workspaceId: string, suffix = ''): string {
  const normalizedSuffix = suffix.startsWith('/') || suffix === '' ? suffix : `/${suffix}`;
  return `/w/${workspaceId}${normalizedSuffix}`;
}

export function dashboardRoute(workspaceId: string): string {
  return routeWithParams(ROUTES.DASHBOARD, { workspaceId });
}

export function knowledgeRoute(workspaceId: string, knowledgeId?: string): string {
  if (knowledgeId) {
    return routeWithParams(ROUTES.KNOWLEDGE_ITEM, { workspaceId, knowledgeId });
  }
  return routeWithParams(ROUTES.KNOWLEDGE, { workspaceId });
}

export function chatRoute(workspaceId: string, conversationId?: string): string {
  if (conversationId) {
    return routeWithParams(ROUTES.CHAT_CONVERSATION, { workspaceId, conversationId });
  }
  return routeWithParams(ROUTES.CHAT, { workspaceId });
}

export function searchRoute(workspaceId: string): string {
  return routeWithParams(ROUTES.SEARCH, { workspaceId });
}

export function agentsRoute(agentId?: string): string {
  if (agentId) {
    return routeWithParams(ROUTES.AGENT_DETAIL, { agentId });
  }
  return ROUTES.AGENTS;
}

export function automationsRoute(automationId?: string): string {
  if (automationId) {
    return routeWithParams(ROUTES.AUTOMATION_DETAIL, { automationId });
  }
  return ROUTES.AUTOMATIONS;
}

export function runsRoute(runId?: string): string {
  if (runId) {
    return routeWithParams(ROUTES.RUN_DETAIL, { runId });
  }
  return ROUTES.RUNS;
}

export function outputsRoute(outputId?: string): string {
  if (outputId) {
    return routeWithParams(ROUTES.OUTPUT_DETAIL, { outputId });
  }
  return ROUTES.OUTPUTS;
}

/** @deprecated Use outputsRoute instead */
export function artifactsRoute(artifactId?: string): string {
  return outputsRoute(artifactId);
}

export default ROUTES;
