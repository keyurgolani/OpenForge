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

    /** Last visited note ID per workspace */
    lastNoteId: Record<string, string>
    setLastNoteId: (workspaceId: string, noteId: string) => void
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

    lastNoteId: {},
    setLastNoteId: (workspaceId, noteId) =>
        set((s) => ({ lastNoteId: { ...s.lastNoteId, [workspaceId]: noteId } })),
}))
