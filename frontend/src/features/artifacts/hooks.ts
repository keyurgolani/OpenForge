import { useQuery } from '@tanstack/react-query'

import { listArtifacts } from '@/lib/api'
import type { Artifact } from '@/types/artifacts'

interface ArtifactsResponse {
  artifacts: Artifact[]
  total: number
}

interface ArtifactQueryOptions {
  workspaceId?: string
  limit?: number
}

export function useArtifactsQuery({ workspaceId, limit = 100 }: ArtifactQueryOptions = {}) {
  return useQuery<ArtifactsResponse>({
    queryKey: ['artifacts', workspaceId ?? 'all', limit],
    queryFn: () => listArtifacts({ workspace_id: workspaceId, limit }),
    enabled: workspaceId !== '',
  })
}
