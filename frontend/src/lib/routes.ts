/**
 * Route Definitions
 *
 * Centralized route constants for the frontend application.
 */

export const ROUTES = {
  // Auth
  LOGIN: '/login',

  // Onboarding
  ONBOARDING: '/onboarding',

  // Workspace
  HOME: '/',
  WORKSPACE: '/workspaces/:workspaceId',
  WORKSPACE_HOME: '/workspaces/:workspaceId/home',

  // Agent/Chat
  AGENT: '/workspaces/:workspaceId/agent',
  AGENT_CONVERSATION: '/workspaces/:workspaceId/agent/:conversationId',

  // Knowledge
  KNOWLEDGE: '/workspaces/:workspaceId/knowledge',
  KNOWLEDGE_ITEM: '/workspaces/:workspaceId/knowledge/:knowledgeId',

  // Search
  SEARCH: '/workspaces/:workspaceId/search',

  // Executions
  EXECUTIONS: '/workspaces/:workspaceId/executions',
  EXECUTION_DETAIL: '/workspaces/:workspaceId/executions/:executionId',

  // Settings
  SETTINGS: '/settings',
  SETTINGS_PROVIDERS: '/settings/providers',
  SETTINGS_TOOLS: '/settings/tools',
  SETTINGS_MCP: '/settings/mcp',

  // Profiles (new architecture)
  PROFILES: '/profiles',
  PROFILE_DETAIL: '/profiles/:profileId',

  // Workflows (new architecture)
  WORKFLOWS: '/workflows',
  WORKFLOW_DETAIL: '/workflows/:workflowId',

  // Missions (new architecture)
  MISSIONS: '/missions',
  MISSION_DETAIL: '/missions/:missionId',

  // Triggers (new architecture)
  TRIGGERS: '/triggers',
  TRIGGER_DETAIL: '/triggers/:triggerId',

  // Runs (new architecture)
  RUNS: '/runs',
  RUN_DETAIL: '/runs/:runId',

  // Artifacts (new architecture)
  ARTIFACTS: '/artifacts',
  ARTIFACT_DETAIL: '/artifacts/:artifactId',
} as const;

/**
 * Helper to create route with workspace ID
 */
export function workspaceRoute(route: string, workspaceId: string): string {
  return route.replace(':workspaceId', workspaceId);
}

/**
 * Helper to create route with multiple params
 */
export function routeWithParams(route: string, params: Record<string, string>): string {
  let result = route;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, value);
  }
  return result;
}

export default ROUTES;
