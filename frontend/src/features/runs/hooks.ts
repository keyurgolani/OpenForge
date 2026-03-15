import { useQuery } from '@tanstack/react-query'

import { getRun, getRunCompositeDebug, getRunLineage, listRunCheckpoints, listRunEvents, listRunSteps, listRuns } from '@/lib/api'
import type { Checkpoint, Run, RunCompositeDebug, RunLineage, RunStep, RunType, RuntimeEvent } from '@/types/runs'
import type { ExecutionStatus } from '@/types/common'

interface RunsResponse {
  runs: Run[]
  total: number
}

interface RunQueryOptions {
  workspaceId?: string
  limit?: number
  status?: ExecutionStatus
  runType?: RunType
}

interface RunStepsResponse {
  steps: RunStep[]
  total: number
}

interface RunCheckpointsResponse {
  checkpoints: Checkpoint[]
  total: number
}

interface RunEventsResponse {
  events: RuntimeEvent[]
  total: number
}

export function useRunsQuery({ workspaceId, limit = 100, status, runType }: RunQueryOptions = {}) {
  return useQuery<RunsResponse>({
    queryKey: ['runs', workspaceId ?? 'all', limit, status ?? 'all', runType ?? 'all'],
    queryFn: () => listRuns({ workspace_id: workspaceId, limit, status, run_type: runType }),
    enabled: workspaceId !== '',
  })
}

export function useRunQuery(runId?: string) {
  return useQuery<Run>({
    queryKey: ['run', runId],
    queryFn: () => getRun(runId as string),
    enabled: Boolean(runId),
  })
}

export function useRunStepsQuery(runId?: string) {
  return useQuery<RunStepsResponse>({
    queryKey: ['run', runId, 'steps'],
    queryFn: () => listRunSteps(runId as string),
    enabled: Boolean(runId),
  })
}

export function useRunLineageQuery(runId?: string) {
  return useQuery<RunLineage>({
    queryKey: ['run', runId, 'lineage'],
    queryFn: () => getRunLineage(runId as string),
    enabled: Boolean(runId),
  })
}

export function useRunCheckpointsQuery(runId?: string) {
  return useQuery<RunCheckpointsResponse>({
    queryKey: ['run', runId, 'checkpoints'],
    queryFn: () => listRunCheckpoints(runId as string),
    enabled: Boolean(runId),
  })
}

export function useRunEventsQuery(runId?: string) {
  return useQuery<RunEventsResponse>({
    queryKey: ['run', runId, 'events'],
    queryFn: () => listRunEvents(runId as string),
    enabled: Boolean(runId),
  })
}

export function useRunCompositeDebugQuery(runId?: string) {
  return useQuery<RunCompositeDebug>({
    queryKey: ['run', runId, 'composite'],
    queryFn: () => getRunCompositeDebug(runId as string),
    enabled: Boolean(runId),
  })
}
