import type { ReactNode } from 'react'
import { create } from 'zustand'

interface UIState {
    sidebarOpen: boolean
    toggleSidebar: () => void
    setSidebarOpen: (open: boolean) => void

    commandPaletteOpen: boolean
    setCommandPaletteOpen: (open: boolean) => void
    toggleCommandPalette: () => void

    activeWorkspaceId: string | null
    setActiveWorkspaceId: (id: string | null) => void

    /** Last visited knowledge ID per workspace */
    lastKnowledgeId: Record<string, string>
    setLastKnowledgeId: (workspaceId: string, knowledgeId: string) => void

    /** Page-specific action buttons shown in the AppShell header */
    headerActions: ReactNode | null
    setHeaderActions: (actions: ReactNode | null) => void

    /** Optimistic chat title override — set by chat page on send, cleared when server title arrives */
    chatHeaderOverride: string | null
    setChatHeaderOverride: (title: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
    sidebarOpen: true,
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),

    commandPaletteOpen: false,
    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
    toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

    activeWorkspaceId: null,
    setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

    lastKnowledgeId: {},
    setLastKnowledgeId: (workspaceId, knowledgeId) =>
        set((s) => ({ lastKnowledgeId: { ...s.lastKnowledgeId, [workspaceId]: knowledgeId } })),

    headerActions: null,
    setHeaderActions: (actions) => set({ headerActions: actions }),

    chatHeaderOverride: null,
    setChatHeaderOverride: (title) => set({ chatHeaderOverride: title }),
}))
