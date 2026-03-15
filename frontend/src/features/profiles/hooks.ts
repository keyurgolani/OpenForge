import { useQuery } from '@tanstack/react-query'

import { getProfile, listProfiles, resolveProfile, validateProfile } from '@/lib/api'
import type { AgentProfile, ProfileValidation, ResolvedProfile } from '@/types/profiles'

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

export function useProfileQuery(profileId?: string) {
  return useQuery<AgentProfile>({
    queryKey: ['profile', profileId],
    queryFn: () => getProfile(profileId as string),
    enabled: Boolean(profileId),
  })
}

export function useResolvedProfileQuery(profileId?: string) {
  return useQuery<ResolvedProfile>({
    queryKey: ['profile', profileId, 'resolve'],
    queryFn: () => resolveProfile(profileId as string),
    enabled: Boolean(profileId),
  })
}

export function useProfileValidationQuery(profileId?: string) {
  return useQuery<ProfileValidation>({
    queryKey: ['profile', profileId, 'validate'],
    queryFn: () => validateProfile(profileId as string),
    enabled: Boolean(profileId),
  })
}
