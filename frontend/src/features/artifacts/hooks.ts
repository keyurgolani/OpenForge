import { useQuery } from '@tanstack/react-query'

import {
  getArtifact,
  getArtifactLineage,
  getArtifactVersionDiff,
  listArtifacts,
  listArtifactSinks,
  listArtifactVersions,
} from '@/lib/api'
import type {
  Artifact,
  ArtifactDiff,
  ArtifactLineage,
  ArtifactsResponse,
  ArtifactQueryParams,
  ArtifactSinksResponse,
  ArtifactStatus,
  ArtifactVersionsResponse,
  ArtifactVisibility,
} from '@/types/artifacts'

interface ArtifactQueryOptions {
  workspaceId?: string
  limit?: number
  q?: string
  artifactType?: ArtifactQueryParams['artifact_type']
  status?: ArtifactStatus
  visibility?: ArtifactVisibility
  sourceRunId?: string
  sourceWorkflowId?: string
  sourceMissionId?: string
  createdByType?: string
}

export function useArtifactsQuery({
  workspaceId,
  limit = 100,
  q,
  artifactType,
  status,
  visibility,
  sourceRunId,
  sourceWorkflowId,
  sourceMissionId,
  createdByType,
}: ArtifactQueryOptions = {}) {
  return useQuery<ArtifactsResponse>({
    queryKey: ['artifacts', workspaceId ?? 'all', limit, q ?? '', artifactType ?? 'all', status ?? 'all', visibility ?? 'all', sourceRunId ?? 'all', sourceWorkflowId ?? 'all', sourceMissionId ?? 'all', createdByType ?? 'all'],
    queryFn: () => listArtifacts({
      workspace_id: workspaceId,
      limit,
      q,
      artifact_type: artifactType,
      status,
      visibility,
      source_run_id: sourceRunId,
      source_workflow_id: sourceWorkflowId,
      source_mission_id: sourceMissionId,
      created_by_type: createdByType,
    }),
    enabled: workspaceId !== '',
  })
}

export function useArtifactQuery(artifactId?: string) {
  return useQuery<Artifact>({
    queryKey: ['artifact', artifactId],
    queryFn: () => getArtifact(artifactId as string),
    enabled: Boolean(artifactId),
  })
}

export function useArtifactVersionsQuery(artifactId?: string) {
  return useQuery<ArtifactVersionsResponse>({
    queryKey: ['artifact', artifactId, 'versions'],
    queryFn: () => listArtifactVersions(artifactId as string),
    enabled: Boolean(artifactId),
  })
}

export function useArtifactLineageQuery(artifactId?: string) {
  return useQuery<ArtifactLineage>({
    queryKey: ['artifact', artifactId, 'lineage'],
    queryFn: () => getArtifactLineage(artifactId as string),
    enabled: Boolean(artifactId),
  })
}

export function useArtifactSinksQuery(artifactId?: string) {
  return useQuery<ArtifactSinksResponse>({
    queryKey: ['artifact', artifactId, 'sinks'],
    queryFn: () => listArtifactSinks(artifactId as string),
    enabled: Boolean(artifactId),
  })
}

export function useArtifactVersionDiffQuery(artifactId?: string, versionId?: string, compareToVersionId?: string) {
  return useQuery<ArtifactDiff>({
    queryKey: ['artifact', artifactId, 'diff', versionId, compareToVersionId],
    queryFn: () => getArtifactVersionDiff(artifactId as string, versionId as string, compareToVersionId as string),
    enabled: Boolean(artifactId && versionId && compareToVersionId && versionId !== compareToVersionId),
  })
}
