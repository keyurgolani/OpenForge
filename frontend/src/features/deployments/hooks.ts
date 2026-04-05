import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import {
  deployAutomation,
  listDeployments,
  getDeployment,
  pauseDeployment,
  resumeDeployment,
  teardownDeployment,
  runDeploymentNow,
  promoteDeploymentWorkspace,
  getTemplateReference,
} from '@/lib/api'
import type { Deployment, DeploymentListResponse, TemplateReferenceData } from '@/types/deployments'

interface DeploymentsQueryOptions {
  status?: string
  automation_id?: string
  skip?: number
  limit?: number
}

export function useDeploymentsQuery(options: DeploymentsQueryOptions = {}) {
  return useQuery<DeploymentListResponse>({
    queryKey: ['deployments', options],
    queryFn: () => listDeployments(options),
  })
}

export function useDeploymentQuery(id?: string) {
  return useQuery<Deployment>({
    queryKey: ['deployment', id],
    queryFn: () => getDeployment(id as string),
    enabled: Boolean(id),
  })
}

export function useDeployAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ automationId, data }: { automationId: string; data: { input_values: Record<string, unknown>; schedule_expression?: string; interval_seconds?: number; enable_workspace?: boolean } }) =>
      deployAutomation(automationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
    },
  })
}

export function usePauseDeployment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pauseDeployment(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['deployment', id] })
    },
  })
}

export function useResumeDeployment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => resumeDeployment(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['deployment', id] })
    },
  })
}

export function useTeardownDeployment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => teardownDeployment(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['deployment', id] })
    },
  })
}

export function useRunDeploymentNow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => runDeploymentNow(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['deployment', id] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    },
  })
}

export function usePromoteDeploymentWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => promoteDeploymentWorkspace(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['deployment', id] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}

export function useTemplateReferenceQuery() {
  return useQuery<TemplateReferenceData>({
    queryKey: ['template-reference'],
    queryFn: getTemplateReference,
    staleTime: 60 * 60_000, // cache for 1 hour
  })
}
