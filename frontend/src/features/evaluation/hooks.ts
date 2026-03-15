import { useQuery } from '@tanstack/react-query'

import api from '@/lib/api'
import type {
  EvaluationResult,
  EvaluationRun,
  EvaluationScenario,
} from '@/types/observability'

interface ScenariosResponse {
  items: EvaluationScenario[]
  count: number
}

interface EvaluationRunsResponse {
  items: EvaluationRun[]
  count: number
}

interface EvaluationResultsResponse {
  items: EvaluationResult[]
  count: number
}

interface BaselineEntry {
  suite_name: string
  metric_name: string
  baseline_value: number
  updated_at: string
}

interface BaselinesResponse {
  items: BaselineEntry[]
  count: number
}

export function useEvaluationScenariosQuery(suiteName?: string) {
  return useQuery<ScenariosResponse>({
    queryKey: ['evaluation-scenarios', suiteName ?? 'all'],
    queryFn: () => api.get('/evaluation/scenarios', { params: suiteName ? { suite_name: suiteName } : undefined }).then(r => r.data),
  })
}

export function useEvaluationRunsQuery(suiteName?: string, status?: string) {
  return useQuery<EvaluationRunsResponse>({
    queryKey: ['evaluation-runs', suiteName ?? 'all', status ?? 'all'],
    queryFn: () => api.get('/evaluation/runs', { params: { suite_name: suiteName, status } }).then(r => r.data),
  })
}

export function useEvaluationRunQuery(evalRunId?: string) {
  return useQuery<EvaluationRun>({
    queryKey: ['evaluation-run', evalRunId],
    queryFn: () => api.get(`/evaluation/runs/${evalRunId}`).then(r => r.data),
    enabled: Boolean(evalRunId),
  })
}

export function useEvaluationResultsQuery(evalRunId?: string) {
  return useQuery<EvaluationResultsResponse>({
    queryKey: ['evaluation-results', evalRunId],
    queryFn: () => api.get(`/evaluation/runs/${evalRunId}/results`).then(r => r.data),
    enabled: Boolean(evalRunId),
  })
}

export function useEvaluationBaselinesQuery(suiteName?: string) {
  return useQuery<BaselinesResponse>({
    queryKey: ['evaluation-baselines', suiteName ?? 'all'],
    queryFn: () => api.get('/evaluation/baselines', { params: suiteName ? { suite_name: suiteName } : undefined }).then(r => r.data),
  })
}
