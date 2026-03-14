import { useQuery } from '@tanstack/react-query'

import { listProfiles } from '@/lib/api'
import type { AgentProfile } from '@/types/profiles'

interface ProfilesResponse {
  profiles: AgentProfile[]
  total: number
}

export function useProfilesQuery(limit = 100) {
  return useQuery<ProfilesResponse>({
    queryKey: ['profiles', limit],
    queryFn: () => listProfiles({ limit }),
  })
}
