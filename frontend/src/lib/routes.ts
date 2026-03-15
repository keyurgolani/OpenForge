/**
 * Canonical frontend route definitions.
 *
 * These helpers keep the workspace IA aligned with the final product nouns:
 * Workspace, Knowledge, Chat, Profiles, Workflows, Missions, Runs, Artifacts.
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
  SETTINGS_PROMPTS: '/settings/prompts',
  SETTINGS_POLICIES: '/settings/policies',
  SETTINGS_APPROVALS: '/settings/approvals',
  SETTINGS_PIPELINES: '/settings/pipelines',
  SETTINGS_SKILLS: '/settings/skills',
  SETTINGS_MCP: '/settings/mcp',
  SETTINGS_AUDIT: '/settings/audit',
  SETTINGS_IMPORT: '/settings/import',
  SETTINGS_EXPORT: '/settings/export',
  // Legacy routes (redirect to new structure)
  SETTINGS_PROVIDERS: '/settings/models/providers',
  SETTINGS_TOOLS: '/settings/skills',

  WORKSPACE: WORKSPACE_PREFIX,
  WORKSPACE_OVERVIEW: WORKSPACE_PREFIX,
  KNOWLEDGE: `${WORKSPACE_PREFIX}/knowledge`,
  KNOWLEDGE_ITEM: `${WORKSPACE_PREFIX}/knowledge/:knowledgeId`,
  CHAT: `${WORKSPACE_PREFIX}/chat`,
  CHAT_CONVERSATION: `${WORKSPACE_PREFIX}/chat/:conversationId`,
  SEARCH: `${WORKSPACE_PREFIX}/search`,
  PROFILES: `${WORKSPACE_PREFIX}/profiles`,
  PROFILE_DETAIL: `${WORKSPACE_PREFIX}/profiles/:profileId`,
  WORKFLOWS: `${WORKSPACE_PREFIX}/workflows`,
  WORKFLOW_DETAIL: `${WORKSPACE_PREFIX}/workflows/:workflowId`,
  MISSIONS: `${WORKSPACE_PREFIX}/missions`,
  MISSION_DETAIL: `${WORKSPACE_PREFIX}/missions/:missionId`,
  RUNS: `${WORKSPACE_PREFIX}/runs`,
  RUN_DETAIL: `${WORKSPACE_PREFIX}/runs/:runId`,
  ARTIFACTS: `${WORKSPACE_PREFIX}/artifacts`,
  ARTIFACT_DETAIL: `${WORKSPACE_PREFIX}/artifacts/:artifactId`,
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

export function workspaceOverviewRoute(workspaceId: string): string {
  return routeWithParams(ROUTES.WORKSPACE_OVERVIEW, { workspaceId });
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

export function profilesRoute(workspaceId: string, profileId?: string): string {
  if (profileId) {
    return routeWithParams(ROUTES.PROFILE_DETAIL, { workspaceId, profileId });
  }
  return routeWithParams(ROUTES.PROFILES, { workspaceId });
}

export function workflowsRoute(workspaceId: string, workflowId?: string): string {
  if (workflowId) {
    return routeWithParams(ROUTES.WORKFLOW_DETAIL, { workspaceId, workflowId });
  }
  return routeWithParams(ROUTES.WORKFLOWS, { workspaceId });
}

export function missionsRoute(workspaceId: string, missionId?: string): string {
  if (missionId) {
    return routeWithParams(ROUTES.MISSION_DETAIL, { workspaceId, missionId });
  }
  return routeWithParams(ROUTES.MISSIONS, { workspaceId });
}

export function runsRoute(workspaceId: string, runId?: string): string {
  if (runId) {
    return routeWithParams(ROUTES.RUN_DETAIL, { workspaceId, runId });
  }
  return routeWithParams(ROUTES.RUNS, { workspaceId });
}

export function artifactsRoute(workspaceId: string, artifactId?: string): string {
  if (artifactId) {
    return routeWithParams(ROUTES.ARTIFACT_DETAIL, { workspaceId, artifactId });
  }
  return routeWithParams(ROUTES.ARTIFACTS, { workspaceId });
}

export default ROUTES;
