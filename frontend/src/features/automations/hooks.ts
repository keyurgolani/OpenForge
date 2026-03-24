import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import {
  listAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  compileAutomation,
  pauseAutomation,
  resumeAutomation,
  activateAutomation,
  getAutomationHealth,
  runAutomation,
  listAutomationTemplates,
  getAutomationGraph,
  saveAutomationGraph,
  getDeploymentSchema,
} from '@/lib/api'
import type {
  Automation,
  AutomationCreate,
  AutomationListResponse,
  AutomationRunRequest,
  AutomationUpdate,
} from '@/types/automations'

interface AutomationsQueryOptions {
  status?: string
  agent_id?: string
  skip?: number
  limit?: number
}

export function useAutomationsQuery(options: AutomationsQueryOptions = {}) {
  return useQuery<AutomationListResponse>({
    queryKey: ['automations', options],
    queryFn: () => listAutomations(options),
  })
}

export function useAutomationQuery(id?: string) {
  return useQuery<Automation>({
    queryKey: ['automation', id],
    queryFn: () => getAutomation(id as string),
    enabled: Boolean(id),
  })
}

export function useAutomationTemplatesQuery(params?: { skip?: number; limit?: number }) {
  return useQuery<AutomationListResponse>({
    queryKey: ['automations', 'templates', params],
    queryFn: () => listAutomationTemplates(params),
  })
}

export function useAutomationHealthQuery(id?: string) {
  return useQuery({
    queryKey: ['automation', id, 'health'],
    queryFn: () => getAutomationHealth(id as string),
    enabled: Boolean(id),
  })
}

export function useCreateAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: AutomationCreate) => createAutomation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
    },
  })
}

export function useUpdateAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AutomationUpdate }) => updateAutomation(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      queryClient.invalidateQueries({ queryKey: ['automation', variables.id] })
    },
  })
}

export function useDeleteAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
    },
  })
}

export function useCompileAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => compileAutomation(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['automation', id] })
    },
  })
}

export function usePauseAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pauseAutomation(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      queryClient.invalidateQueries({ queryKey: ['automation', id] })
    },
  })
}

export function useResumeAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => resumeAutomation(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      queryClient.invalidateQueries({ queryKey: ['automation', id] })
    },
  })
}

export function useActivateAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => activateAutomation(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      queryClient.invalidateQueries({ queryKey: ['automation', id] })
    },
  })
}

export function useRunAutomation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AutomationRunRequest }) => runAutomation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    },
  })
}

export function useAutomationGraphQuery(id?: string) {
  return useQuery({
    queryKey: ['automation', id, 'graph'],
    queryFn: () => getAutomationGraph(id as string),
    enabled: Boolean(id),
  })
}

export function useSaveAutomationGraph() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, graph }: { id: string; graph: { nodes: unknown[]; edges: unknown[]; static_inputs: unknown[] } }) =>
      saveAutomationGraph(id, graph),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automation', variables.id, 'graph'] })
      queryClient.invalidateQueries({ queryKey: ['automation', variables.id] })
    },
  })
}

export function useDeploymentSchemaQuery(id?: string) {
  return useQuery({
    queryKey: ['automation', id, 'deployment-schema'],
    queryFn: () => getDeploymentSchema(id as string),
    enabled: Boolean(id),
  })
}
