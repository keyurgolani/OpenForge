import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  activateMission, createMission, deleteMission, disableMission,
  getMission, getMissionArtifacts, getMissionDiagnostics,
  getMissionHealth, getMissionRuns, launchMission, listMissions,
  pauseMission, resumeMission, updateMission,
} from '@/lib/api'
import type { MissionDefinition } from '@/types/missions'

interface MissionsResponse { missions: MissionDefinition[]; total: number }
interface MissionQueryOptions { limit?: number; status?: string }

export function useMissionsQuery({ limit = 100, status }: MissionQueryOptions = {}) {
  return useQuery<MissionsResponse>({
    queryKey: ['missions', limit, status ?? 'all'],
    queryFn: () => listMissions({ limit, status }),
  })
}

export function useMissionQuery(missionId?: string) {
  return useQuery<MissionDefinition>({
    queryKey: ['mission', missionId],
    queryFn: () => getMission(missionId as string),
    enabled: Boolean(missionId),
  })
}

export function useMissionHealthQuery(missionId?: string) {
  return useQuery({
    queryKey: ['mission', missionId, 'health'],
    queryFn: () => getMissionHealth(missionId as string),
    enabled: Boolean(missionId),
    refetchInterval: 30000,
  })
}

export function useMissionRunsQuery(missionId?: string, limit = 20) {
  return useQuery({
    queryKey: ['mission', missionId, 'runs', limit],
    queryFn: () => getMissionRuns(missionId as string, { limit }),
    enabled: Boolean(missionId),
  })
}

export function useMissionArtifactsQuery(missionId?: string, limit = 20) {
  return useQuery({
    queryKey: ['mission', missionId, 'artifacts', limit],
    queryFn: () => getMissionArtifacts(missionId as string, { limit }),
    enabled: Boolean(missionId),
  })
}

export function useMissionDiagnosticsQuery(missionId?: string) {
  return useQuery({
    queryKey: ['mission', missionId, 'diagnostics'],
    queryFn: () => getMissionDiagnostics(missionId as string),
    enabled: Boolean(missionId),
  })
}

export function useCreateMission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: object) => createMission(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['missions'] }) },
  })
}

export function useUpdateMission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => updateMission(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      qc.invalidateQueries({ queryKey: ['mission', vars.id] })
    },
  })
}

export function useLaunchMission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: object }) => launchMission(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['mission', vars.id] })
      qc.invalidateQueries({ queryKey: ['missions'] })
    },
  })
}

export function usePauseMission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pauseMission(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      qc.invalidateQueries({ queryKey: ['mission', id] })
    },
  })
}

export function useResumeMission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => resumeMission(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      qc.invalidateQueries({ queryKey: ['mission', id] })
    },
  })
}

export function useDisableMission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => disableMission(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      qc.invalidateQueries({ queryKey: ['mission', id] })
    },
  })
}

export function useActivateMission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => activateMission(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      qc.invalidateQueries({ queryKey: ['mission', id] })
    },
  })
}

export function useDeleteMission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteMission(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['missions'] }) },
  })
}
