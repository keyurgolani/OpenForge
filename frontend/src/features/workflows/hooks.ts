import { useQuery } from '@tanstack/react-query'

import { listWorkflows } from '@/lib/api'
import type { WorkflowDefinition } from '@/types/workflows'

interface WorkflowsResponse {
  workflows: WorkflowDefinition[]
  total: number
}

export function useWorkflowsQuery(limit = 100) {
  return useQuery<WorkflowsResponse>({
    queryKey: ['workflows', limit],
    queryFn: () => listWorkflows({ limit }),
  })
}
