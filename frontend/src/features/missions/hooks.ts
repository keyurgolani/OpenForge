import { useQuery } from '@tanstack/react-query'

import { listMissions } from '@/lib/api'
import type { MissionDefinition } from '@/types/missions'

interface MissionsResponse {
  missions: MissionDefinition[]
  total: number
}

export function useMissionsQuery(limit = 100) {
  return useQuery<MissionsResponse>({
    queryKey: ['missions', limit],
    queryFn: () => listMissions({ limit }),
  })
}
