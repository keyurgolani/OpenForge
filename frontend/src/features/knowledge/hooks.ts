import { useQuery } from '@tanstack/react-query'

import { listKnowledge } from '@/lib/api'

export interface KnowledgeSummaryItem {
  id: string
  type: string
  title: string | null
  ai_title: string | null
  content_preview: string
  updated_at: string
  is_archived: boolean
}

interface KnowledgeSummaryResponse {
  knowledge: KnowledgeSummaryItem[]
  total: number
}

export function useKnowledgeSummaryQuery(workspaceId: string, pageSize = 6) {
  return useQuery<KnowledgeSummaryResponse>({
    queryKey: ['knowledge-summary', workspaceId, pageSize],
    queryFn: () => listKnowledge(workspaceId, { page_size: pageSize, sort_by: 'updated_at', sort_order: 'desc' }),
    enabled: !!workspaceId,
  })
}
