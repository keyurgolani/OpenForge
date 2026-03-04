import { useQuery } from '@tanstack/react-query'
import { getOnboarding, listWorkspaces } from '@/lib/api'

export function useOnboarding() {
    return useQuery({ queryKey: ['onboarding'], queryFn: getOnboarding, staleTime: 0 })
}

export function useWorkspaces() {
    return useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
}

export function useWorkspace(id: string | undefined) {
    const { data: workspaces } = useWorkspaces()
    return (workspaces as { id: string }[] | undefined)?.find(w => w.id === id)
}
