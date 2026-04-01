import { useQuery } from '@tanstack/react-query'

import {
  getOutput,
  getOutputLineage,
  getOutputVersionDiff,
  listOutputs,
  listOutputSinks,
  listOutputVersions,
} from '@/lib/api'
import type {
  Output,
  OutputDiff,
  OutputLineage,
  OutputsResponse,
  OutputQueryParams,
  OutputSinksResponse,
  OutputStatus,
  OutputVersionsResponse,
  OutputVisibility,
} from '@/types/outputs'

interface OutputQueryOptions {
  limit?: number
  q?: string
  artifactType?: OutputQueryParams['artifact_type']
  status?: OutputStatus
  visibility?: OutputVisibility
  sourceRunId?: string
  createdByType?: string
}

export function useOutputsQuery({
  limit = 100,
  q,
  artifactType,
  status,
  visibility,
  sourceRunId,
  createdByType,
}: OutputQueryOptions = {}) {
  return useQuery<OutputsResponse>({
    queryKey: ['outputs', limit, q ?? '', artifactType ?? 'all', status ?? 'all', visibility ?? 'all', sourceRunId ?? 'all', createdByType ?? 'all'],
    queryFn: () => listOutputs({
      limit,
      q,
      artifact_type: artifactType,
      status,
      visibility,
      source_run_id: sourceRunId,
      created_by_type: createdByType,
    }),
  })
}

export function useOutputQuery(outputId?: string) {
  return useQuery<Output>({
    queryKey: ['output', outputId],
    queryFn: () => getOutput(outputId as string),
    enabled: Boolean(outputId),
  })
}

export function useOutputVersionsQuery(outputId?: string) {
  return useQuery<OutputVersionsResponse>({
    queryKey: ['output', outputId, 'versions'],
    queryFn: () => listOutputVersions(outputId as string),
    enabled: Boolean(outputId),
  })
}

export function useOutputLineageQuery(outputId?: string) {
  return useQuery<OutputLineage>({
    queryKey: ['output', outputId, 'lineage'],
    queryFn: () => getOutputLineage(outputId as string),
    enabled: Boolean(outputId),
  })
}

export function useOutputSinksQuery(outputId?: string) {
  return useQuery<OutputSinksResponse>({
    queryKey: ['output', outputId, 'sinks'],
    queryFn: () => listOutputSinks(outputId as string),
    enabled: Boolean(outputId),
  })
}

export function useOutputVersionDiffQuery(outputId?: string, versionId?: string, compareToVersionId?: string) {
  return useQuery<OutputDiff>({
    queryKey: ['output', outputId, 'diff', versionId, compareToVersionId],
    queryFn: () => getOutputVersionDiff(outputId as string, versionId as string, compareToVersionId as string),
    enabled: Boolean(outputId && versionId && compareToVersionId && versionId !== compareToVersionId),
  })
}

// Backward-compatible aliases
export {
  useOutputsQuery as useArtifactsQuery,
  useOutputQuery as useArtifactQuery,
  useOutputVersionsQuery as useArtifactVersionsQuery,
  useOutputLineageQuery as useArtifactLineageQuery,
  useOutputSinksQuery as useArtifactSinksQuery,
  useOutputVersionDiffQuery as useArtifactVersionDiffQuery,
}
