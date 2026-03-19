import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  compileAgent,
  listAgentSpecs,
  listAgentTemplates,
  cloneAgentTemplate,
} from '@/lib/api'
import type { Agent, AgentCreate, AgentListResponse, AgentUpdate, CompiledSpec } from '@/types/agents'

interface AgentsQueryOptions {
  status?: string
  mode?: string
  is_template?: boolean
  skip?: number
  limit?: number
}

export function useAgentsQuery(options: AgentsQueryOptions = {}) {
  return useQuery<AgentListResponse>({
    queryKey: ['agents', options],
    queryFn: () => listAgents(options),
  })
}

export function useAgentQuery(id?: string) {
  return useQuery<Agent>({
    queryKey: ['agent', id],
    queryFn: () => getAgent(id as string),
    enabled: Boolean(id),
  })
}

export function useAgentTemplatesQuery(params?: { skip?: number; limit?: number }) {
  return useQuery<AgentListResponse>({
    queryKey: ['agents', 'templates', params],
    queryFn: () => listAgentTemplates(params),
  })
}

export function useAgentSpecsQuery(id?: string) {
  return useQuery<{ specs: CompiledSpec[]; total: number }>({
    queryKey: ['agent', id, 'specs'],
    queryFn: () => listAgentSpecs(id as string),
    enabled: Boolean(id),
  })
}

export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: AgentCreate) => createAgent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useUpdateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AgentUpdate }) => updateAgent(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['agent', variables.id] })
    },
  })
}

export function useDeleteAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useCompileAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => compileAgent(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['agent', id] })
      queryClient.invalidateQueries({ queryKey: ['agent', id, 'specs'] })
    },
  })
}

export function useCloneAgentTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: { name?: string; slug?: string } }) =>
      cloneAgentTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}
