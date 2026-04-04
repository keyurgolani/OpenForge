import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import {
  listMissions,
  getMission,
  createMission,
  updateMission,
  deleteMission,
  activateMission,
  pauseMission,
  terminateMission,
  listMissionCycles,
  promoteMissionWorkspace,
} from '@/lib/api'

interface MissionsQueryOptions {
  status?: string
}

export function useMissionsQuery(options: MissionsQueryOptions = {}) {
  return useQuery({
    queryKey: ['missions', options],
    queryFn: () => listMissions(options),
  })
}

export function useMissionQuery(id?: string) {
  return useQuery({
    queryKey: ['mission', id],
    queryFn: () => getMission(id as string),
    enabled: Boolean(id),
  })
}

export function useCreateMission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: object) => createMission(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
    },
  })
}

export function useUpdateMission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => updateMission(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
      queryClient.invalidateQueries({ queryKey: ['mission', id] })
    },
  })
}

export function useDeleteMission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteMission(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
    },
  })
}

export function useActivateMission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => activateMission(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
      queryClient.invalidateQueries({ queryKey: ['mission', id] })
    },
  })
}

export function usePauseMission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pauseMission(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
      queryClient.invalidateQueries({ queryKey: ['mission', id] })
    },
  })
}

export function useTerminateMission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => terminateMission(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
      queryClient.invalidateQueries({ queryKey: ['mission', id] })
    },
  })
}

export function useMissionCyclesQuery(id?: string, options: { status?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['mission-cycles', id, options],
    queryFn: () => listMissionCycles(id as string, options),
    enabled: Boolean(id),
  })
}

export function usePromoteMissionWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => promoteMissionWorkspace(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['mission', id] })
      queryClient.invalidateQueries({ queryKey: ['missions'] })
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}
