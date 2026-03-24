import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  listAgentVersions,
  getAgentVersion,
} from '@/lib/api'
import type {
  AgentDefinition,
  AgentDefinitionCreate,
  AgentDefinitionListResponse,
  AgentDefinitionUpdate,
  AgentDefinitionVersion,
  AgentDefinitionVersionListResponse,
} from '@/types/agents'

interface AgentsQueryOptions {
  skip?: number
  limit?: number
}

export function useAgentsQuery(options: AgentsQueryOptions = {}) {
  return useQuery<AgentDefinitionListResponse>({
    queryKey: ['agents', options],
    queryFn: () => listAgents(options),
  })
}

export function useAgentQuery(id?: string) {
  return useQuery<AgentDefinition>({
    queryKey: ['agent', id],
    queryFn: () => getAgent(id as string),
    enabled: Boolean(id),
  })
}

export function useAgentVersionsQuery(agentId: string) {
  return useQuery<AgentDefinitionVersionListResponse>({
    queryKey: ['agent', agentId, 'versions'],
    queryFn: () => listAgentVersions(agentId),
    enabled: Boolean(agentId),
  })
}

export function useAgentVersionQuery(agentId: string, versionId: string) {
  return useQuery<AgentDefinitionVersion>({
    queryKey: ['agent', agentId, 'version', versionId],
    queryFn: () => getAgentVersion(agentId, versionId),
    enabled: Boolean(agentId) && Boolean(versionId),
  })
}

export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: AgentDefinitionCreate) => createAgent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useUpdateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AgentDefinitionUpdate }) => updateAgent(id, data),
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
