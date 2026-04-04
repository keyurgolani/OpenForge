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
  SETTINGS_TOOLS: '/settings/tools',
  SETTINGS_DATA: '/settings/data',
  SETTINGS_ADVANCED: '/settings/advanced',

  // Workspace-scoped routes
  WORKSPACE: WORKSPACE_PREFIX,
  DASHBOARD: WORKSPACE_PREFIX,
  KNOWLEDGE: `${WORKSPACE_PREFIX}/knowledge`,
  KNOWLEDGE_ITEM: `${WORKSPACE_PREFIX}/knowledge/:knowledgeId`,
  CHAT: `${WORKSPACE_PREFIX}/chat`,
  CHAT_CONVERSATION: `${WORKSPACE_PREFIX}/chat/:conversationId`,
  SEARCH: `${WORKSPACE_PREFIX}/search`,

  // Global chat routes
  CHAT_GLOBAL: '/chat',
  CHAT_GLOBAL_CONVERSATION: '/chat/:conversationId',

  // Domain entity routes (workspace-agnostic)
  AGENTS: '/agents',
  AGENT_CREATE: '/agents/new',
  AGENT_DETAIL: '/agents/:agentId',
  AUTOMATIONS: '/automations',
  AUTOMATION_CREATE: '/automations/new',
  AUTOMATION_DETAIL: '/automations/:automationId',
  DEPLOYMENTS: '/deployments',
  DEPLOYMENT_DETAIL: '/deployments/:deploymentId',
  DEPLOYMENT_RUN_DETAIL: '/deployments/:deploymentId/runs/:runId',
  RUNS: '/runs',
  RUN_DETAIL: '/runs/:runId',
  MISSIONS: '/missions',
  MISSION_DETAIL: '/missions/:missionId',
  SINKS: '/sinks',
  SINK_CREATE: '/sinks/new',
  SINK_DETAIL: '/sinks/:sinkId',
  // Legacy routes — kept for backward compat redirects
  OUTPUTS: '/outputs',
  OUTPUT_DETAIL: '/outputs/:outputId',
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

export function globalChatRoute(conversationId?: string, options?: { agentId?: string }): string {
  if (conversationId) {
    return routeWithParams(ROUTES.CHAT_GLOBAL_CONVERSATION, { conversationId });
  }
  if (options?.agentId) {
    return `${ROUTES.CHAT_GLOBAL}?agent=${encodeURIComponent(options.agentId)}`;
  }
  return ROUTES.CHAT_GLOBAL;
}

export function agentsRoute(agentId?: string): string {
  if (agentId) {
    return routeWithParams(ROUTES.AGENT_DETAIL, { agentId });
  }
  return ROUTES.AGENTS;
}

export function agentCreateRoute(): string {
  return ROUTES.AGENT_CREATE;
}

export function automationsRoute(automationId?: string): string {
  if (automationId) {
    return routeWithParams(ROUTES.AUTOMATION_DETAIL, { automationId });
  }
  return ROUTES.AUTOMATIONS;
}

export function automationCreateRoute(): string {
  return ROUTES.AUTOMATION_CREATE;
}

export function deploymentsRoute(deploymentId?: string): string {
  if (deploymentId) {
    return routeWithParams(ROUTES.DEPLOYMENT_DETAIL, { deploymentId });
  }
  return ROUTES.DEPLOYMENTS;
}

export function deploymentRunRoute(deploymentId: string, runId: string): string {
  return routeWithParams(ROUTES.DEPLOYMENT_RUN_DETAIL, { deploymentId, runId });
}

export function runsRoute(runId?: string): string {
  if (runId) {
    return routeWithParams(ROUTES.RUN_DETAIL, { runId });
  }
  return ROUTES.RUNS;
}

export function missionsRoute(missionId?: string): string {
  if (missionId) {
    return routeWithParams(ROUTES.MISSION_DETAIL, { missionId });
  }
  return ROUTES.MISSIONS;
}

export function sinksRoute(sinkId?: string): string {
  if (sinkId) {
    return routeWithParams(ROUTES.SINK_DETAIL, { sinkId });
  }
  return ROUTES.SINKS;
}

/** @deprecated Use sinksRoute instead */
export function outputsRoute(outputId?: string): string {
  if (outputId) {
    return routeWithParams(ROUTES.OUTPUT_DETAIL, { outputId });
  }
  return ROUTES.OUTPUTS;
}

export default ROUTES;
