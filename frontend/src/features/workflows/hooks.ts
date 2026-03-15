import { useQuery } from '@tanstack/react-query'

import { getWorkflow, getWorkflowTemplate, getWorkflowVersion, listWorkflowTemplates, listWorkflowVersions, listWorkflows } from '@/lib/api'
import type { WorkflowDefinition, WorkflowStatus, WorkflowVersion } from '@/types/workflows'

interface WorkflowsResponse {
  workflows: WorkflowDefinition[]
  total: number
}

interface WorkflowQueryOptions {
  workspaceId?: string
  limit?: number
  status?: WorkflowStatus
  isSystem?: boolean
  isTemplate?: boolean
}

interface WorkflowVersionsResponse {
  versions: WorkflowVersion[]
  total: number
}

export function useWorkflowsQuery({
  workspaceId,
  limit = 100,
  status,
  isSystem,
  isTemplate,
}: WorkflowQueryOptions = {}) {
  return useQuery<WorkflowsResponse>({
    queryKey: ['workflows', workspaceId ?? 'all', limit, status ?? 'all', isSystem ?? 'all', isTemplate ?? 'all'],
    queryFn: () => listWorkflows({
      workspace_id: workspaceId,
      limit,
      status,
      is_system: isSystem,
      is_template: isTemplate,
    }),
  })
}

export function useWorkflowQuery(workflowId?: string) {
  return useQuery<WorkflowDefinition>({
    queryKey: ['workflow', workflowId],
    queryFn: () => getWorkflow(workflowId as string),
    enabled: Boolean(workflowId),
  })
}

export function useWorkflowVersionsQuery(workflowId?: string) {
  return useQuery<WorkflowVersionsResponse>({
    queryKey: ['workflow', workflowId, 'versions'],
    queryFn: () => listWorkflowVersions(workflowId as string),
    enabled: Boolean(workflowId),
  })
}

export function useWorkflowVersionQuery(workflowId?: string, versionId?: string) {
  return useQuery<WorkflowVersion>({
    queryKey: ['workflow', workflowId, 'versions', versionId],
    queryFn: () => getWorkflowVersion(workflowId as string, versionId as string),
    enabled: Boolean(workflowId && versionId),
  })
}

export function useWorkflowTemplatesQuery(templateKind?: string) {
  return useQuery<WorkflowsResponse>({
    queryKey: ['workflow-templates', templateKind ?? 'all'],
    queryFn: () => listWorkflowTemplates({ template_kind: templateKind }),
  })
}

export function useWorkflowTemplateQuery(workflowId?: string) {
  return useQuery<WorkflowDefinition>({
    queryKey: ['workflow-template', workflowId],
    queryFn: () => getWorkflowTemplate(workflowId as string),
    enabled: Boolean(workflowId),
  })
}
