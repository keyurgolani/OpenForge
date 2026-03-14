import { useQuery } from '@tanstack/react-query'

import { listRuns } from '@/lib/api'
import type { Run } from '@/types/runs'

interface RunsResponse {
  runs: Run[]
  total: number
}

interface RunQueryOptions {
  workspaceId?: string
  limit?: number
}

export function useRunsQuery({ workspaceId, limit = 100 }: RunQueryOptions = {}) {
  return useQuery<RunsResponse>({
    queryKey: ['runs', workspaceId ?? 'all', limit],
    queryFn: () => listRuns({ workspace_id: workspaceId, limit }),
    enabled: workspaceId !== '',
  })
}
