import { useQuery } from '@tanstack/react-query'

import api from '@/lib/api'
import type {
  CostHotspot,
  FailureEvent,
  FailureRollupItem,
  RunTelemetrySummary,
  UsageSummary,
} from '@/types/observability'

interface FailuresResponse {
  items: FailureEvent[]
  count: number
}

interface CostHotspotsResponse {
  items: CostHotspot[]
  count: number
}

interface FailureRollupResponse {
  items: FailureRollupItem[]
  count: number
  group_by: string
}

export function useRunUsageQuery(runId?: string) {
  return useQuery<UsageSummary>({
    queryKey: ['run-usage', runId],
    queryFn: () => api.get(`/observability/usage/run/${runId}`).then(r => r.data),
    enabled: Boolean(runId),
  })
}

export function useRunFailuresQuery(runId?: string) {
  return useQuery<FailuresResponse>({
    queryKey: ['run-failures', runId],
    queryFn: () => api.get(`/observability/failures/run/${runId}`).then(r => r.data),
    enabled: Boolean(runId),
  })
}

export function useMissionUsageQuery(missionId?: string) {
  return useQuery<UsageSummary>({
    queryKey: ['mission-usage', missionId],
    queryFn: () => api.get(`/observability/usage/mission/${missionId}`).then(r => r.data),
    enabled: Boolean(missionId),
  })
}

export function useMissionFailuresQuery(missionId?: string) {
  return useQuery<FailuresResponse>({
    queryKey: ['mission-failures', missionId],
    queryFn: () => api.get(`/observability/failures/mission/${missionId}`).then(r => r.data),
    enabled: Boolean(missionId),
  })
}

export function useCostHotspotsQuery(workspaceId?: string) {
  return useQuery<CostHotspotsResponse>({
    queryKey: ['cost-hotspots', workspaceId],
    queryFn: () => api.get('/observability/usage/hotspots', { params: { workspace_id: workspaceId } }).then(r => r.data),
    enabled: Boolean(workspaceId),
  })
}

export function useRunTelemetryQuery(runId?: string) {
  return useQuery<RunTelemetrySummary>({
    queryKey: ['run-telemetry', runId],
    queryFn: () => api.get(`/observability/telemetry/run/${runId}`).then(r => r.data),
    enabled: Boolean(runId),
  })
}

export function useFailureRollupQuery(workspaceId?: string, groupBy: string = 'failure_class') {
  return useQuery<FailureRollupResponse>({
    queryKey: ['failure-rollup', workspaceId, groupBy],
    queryFn: () => api.get('/observability/failures/rollup', { params: { workspace_id: workspaceId, group_by: groupBy } }).then(r => r.data),
    enabled: Boolean(workspaceId),
  })
}
