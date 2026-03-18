import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listCatalog, checkCatalogReadiness, listProfileTemplates, cloneProfileTemplate, listMissionTemplates, cloneMissionTemplate, cloneWorkflowTemplate, getCatalogDependencies, executeCatalogClone } from '@/lib/api'
import type { CatalogItemType, CatalogListResponse, CatalogReadinessResponse, CatalogQueryParams, DependencyTree, UnifiedCloneRequest, UnifiedCloneResponse } from '@/types/catalog'

export function useCatalogQuery(params?: CatalogQueryParams) {
  return useQuery<CatalogListResponse>({
    queryKey: ['catalog', params?.catalog_type ?? 'all', params?.is_featured ?? 'all', ...(params?.tags ?? [])],
    queryFn: () => listCatalog(params),
  })
}

export function useCatalogReadinessQuery(catalogType?: CatalogItemType, itemId?: string) {
  return useQuery<CatalogReadinessResponse>({
    queryKey: ['catalog-readiness', catalogType, itemId],
    queryFn: () => checkCatalogReadiness(catalogType as string, itemId as string),
    enabled: Boolean(catalogType && itemId),
  })
}

export function useProfileTemplatesQuery(params?: { is_featured?: boolean; tags?: string[] }) {
  return useQuery({
    queryKey: ['profile-templates', params?.is_featured ?? 'all'],
    queryFn: () => listProfileTemplates(params),
  })
}

export function useMissionTemplatesQuery(params?: { is_featured?: boolean; tags?: string[] }) {
  return useQuery({
    queryKey: ['mission-templates', params?.is_featured ?? 'all'],
    queryFn: () => listMissionTemplates(params),
  })
}

export function useCloneProfileTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: { name?: string; slug?: string } }) =>
      cloneProfileTemplate(templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useCloneMissionTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: { workspace_id?: string; name?: string; slug?: string } }) =>
      cloneMissionTemplate(templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
    },
  })
}

export function useCloneWorkflowTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: { workspace_id?: string; name?: string; slug?: string } }) =>
      cloneWorkflowTemplate(templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}

export function useDependencyTreeQuery(catalogType?: CatalogItemType, itemId?: string) {
  return useQuery<DependencyTree>({
    queryKey: ['catalog-dependencies', catalogType, itemId],
    queryFn: () => getCatalogDependencies(catalogType as string, itemId as string),
    enabled: Boolean(catalogType && itemId),
  })
}

export function useUnifiedCloneMutation() {
  const queryClient = useQueryClient()
  return useMutation<UnifiedCloneResponse, Error, UnifiedCloneRequest>({
    mutationFn: (body: UnifiedCloneRequest) => executeCatalogClone(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['missions'] })
      queryClient.invalidateQueries({ queryKey: ['catalog'] })
    },
  })
}
