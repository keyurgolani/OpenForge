/**
 * Canonical frontend route definitions for the v2 UI.
 *
 * Workspace-specific pages (Knowledge, Chat, Search) live under /v2/w/:workspaceId.
 * Domain entities (Agents, Automations, Runs, Outputs) are
 * workspace-agnostic and live at the top level under /v2.
 */

const V2 = '/v2';
const WORKSPACE_PREFIX = `${V2}/w/:workspaceId`;

export const ROUTES = {
  LOGIN: `${V2}/login`,
  ONBOARDING: `${V2}/onboarding`,

  // Settings routes (global, not workspace-scoped)
  SETTINGS: `${V2}/settings`,
  SETTINGS_WORKSPACES: `${V2}/settings/workspaces`,
  SETTINGS_MODELS: `${V2}/settings/models`,
  SETTINGS_MODELS_PROVIDERS: `${V2}/settings/models/providers`,
  SETTINGS_MODELS_REASONING: `${V2}/settings/models/reasoning`,
  SETTINGS_MODELS_VISION: `${V2}/settings/models/vision`,
  SETTINGS_MODELS_EMBEDDING: `${V2}/settings/models/embedding`,
  SETTINGS_MODELS_AUDIO: `${V2}/settings/models/audio`,
  SETTINGS_MODELS_CLIP: `${V2}/settings/models/clip`,
  SETTINGS_MODELS_PDF: `${V2}/settings/models/pdf`,
  SETTINGS_TOOLS: `${V2}/settings/tools`,
  SETTINGS_DATA: `${V2}/settings/data`,
  SETTINGS_ADVANCED: `${V2}/settings/advanced`,

  // Workspace-scoped routes
  WORKSPACE: WORKSPACE_PREFIX,
  DASHBOARD: WORKSPACE_PREFIX,
  KNOWLEDGE: `${WORKSPACE_PREFIX}/knowledge`,
  KNOWLEDGE_ITEM: `${WORKSPACE_PREFIX}/knowledge/:knowledgeId`,
  CHAT: `${WORKSPACE_PREFIX}/chat`,
  CHAT_CONVERSATION: `${WORKSPACE_PREFIX}/chat/:conversationId`,
  SEARCH: `${WORKSPACE_PREFIX}/search`,

  // Global chat routes
  CHAT_GLOBAL: `${V2}/chat`,
  CHAT_GLOBAL_CONVERSATION: `${V2}/chat/:conversationId`,

  // Domain entity routes (workspace-agnostic)
  AGENTS: `${V2}/agents`,
  AGENT_CREATE: `${V2}/agents/new`,
  AGENT_DETAIL: `${V2}/agents/:agentId`,
  AUTOMATIONS: `${V2}/automations`,
  AUTOMATION_DETAIL: `${V2}/automations/:automationId`,
  DEPLOYMENTS: `${V2}/deployments`,
  DEPLOYMENT_DETAIL: `${V2}/deployments/:deploymentId`,
  DEPLOYMENT_RUN_DETAIL: `${V2}/deployments/:deploymentId/runs/:runId`,
  RUNS: `${V2}/runs`,
  RUN_DETAIL: `${V2}/runs/:runId`,
  OUTPUTS: `${V2}/outputs`,
  OUTPUT_DETAIL: `${V2}/outputs/:outputId`,
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
  return `/v2/w/${workspaceId}${normalizedSuffix}`;
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

export function globalChatRoute(conversationId?: string): string {
  if (conversationId) {
    return routeWithParams(ROUTES.CHAT_GLOBAL_CONVERSATION, { conversationId });
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

export function outputsRoute(outputId?: string): string {
  if (outputId) {
    return routeWithParams(ROUTES.OUTPUT_DETAIL, { outputId });
  }
  return ROUTES.OUTPUTS;
}

export default ROUTES;
