import { create } from 'zustand'

export interface Workspace {
  id: string
  name: string
  description?: string | null
  created_at?: string | null
  updated_at?: string | null
}

interface UIState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void

  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void

  activeWorkspaceId: string | null
  setActiveWorkspaceId: (id: string | null) => void

  /** Cached workspace list */
  workspaces: Workspace[]
  setWorkspaces: (workspaces: Workspace[]) => void

  /** Last visited knowledge ID per workspace */
  lastKnowledgeId: Record<string, string>
  setLastKnowledgeId: (workspaceId: string, knowledgeId: string) => void
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

  workspaces: [],
  setWorkspaces: (workspaces) => set({ workspaces }),

  lastKnowledgeId: {},
  setLastKnowledgeId: (workspaceId, knowledgeId) =>
    set((s) => ({ lastKnowledgeId: { ...s.lastKnowledgeId, [workspaceId]: knowledgeId } })),
}))
