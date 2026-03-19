import { useQuery } from '@tanstack/react-query'

import { getRun, getRunCompositeDebug, getRunLineage, listRunCheckpoints, listRunEvents, listRunSteps, listRuns } from '@/lib/api'
import type { Checkpoint, Run, RunCompositeDebug, RunLineage, RunStep, RunType, RuntimeEvent } from '@/types/runs'
import type { ExecutionStatus } from '@/types/common'

interface RunsResponse {
  runs: Run[]
  total: number
}

interface RunQueryOptions {
  limit?: number
  status?: ExecutionStatus
  runType?: RunType
  agentId?: string
  automationId?: string
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

export function useRunsQuery({ limit = 100, status, runType, agentId, automationId }: RunQueryOptions = {}) {
  return useQuery<RunsResponse>({
    queryKey: ['runs', limit, status ?? 'all', runType ?? 'all', agentId ?? 'all', automationId ?? 'all'],
    queryFn: () => listRuns({ limit, status, run_type: runType, agent_id: agentId, automation_id: automationId }),
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
