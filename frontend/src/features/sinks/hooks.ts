import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listSinks, getSink, createSink, updateSink, deleteSink } from '@/lib/api'
import type { SinkQueryParams, SinkCreate, SinkUpdate } from '@/types/sinks'

export function useSinksQuery(params?: SinkQueryParams) {
  return useQuery({
    queryKey: ['sinks', params],
    queryFn: () => listSinks(params),
  })
}

export function useSinkQuery(sinkId: string | undefined) {
  return useQuery({
    queryKey: ['sinks', sinkId],
    queryFn: () => getSink(sinkId!),
    enabled: !!sinkId,
  })
}

export function useCreateSinkMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: SinkCreate) => createSink(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sinks'] })
    },
  })
}

export function useUpdateSinkMutation(sinkId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: SinkUpdate) => updateSink(sinkId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sinks'] })
    },
  })
}

export function useDeleteSinkMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sinkId: string) => deleteSink(sinkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sinks'] })
    },
  })
}
