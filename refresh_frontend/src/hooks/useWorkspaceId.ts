import { useParams } from 'react-router-dom'
import { useUIStore } from '@/stores/uiStore'

/**
 * Resolves the effective workspace UUID.
 *
 * Workspace-scoped routes use /v2/w/:workspaceId/... where the param
 * might be a UUID (correct) or a slug (from manual URL entry).
 * This hook checks whether the route param looks like a UUID; if not,
 * it falls back to the store's activeWorkspaceId which is always a UUID
 * set by AppShell on workspace fetch.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function useWorkspaceId(): string | undefined {
  const { workspaceId: paramId } = useParams<{ workspaceId: string }>()
  const storeId = useUIStore((s) => s.activeWorkspaceId)

  // If the route param is a valid UUID, use it directly
  if (paramId && UUID_RE.test(paramId)) {
    return paramId
  }

  // Otherwise fall back to the store's active workspace (always a UUID)
  return storeId ?? undefined
}
