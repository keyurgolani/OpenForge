import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, PanelLeft, Plus, WifiOff } from 'lucide-react'

import { listConversations, listKnowledge, listRuns, listWorkspaces, updateConversation, deleteConversation, permanentlyDeleteConversation } from '@/lib/api'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { useUIStore } from '@/stores/uiStore'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { getShortcutDisplay } from '@/lib/keyboard'
import { onQuickKnowledgeOpen, type QuickKnowledgeType } from '@/lib/quick-knowledge'
import { artifactsRoute, catalogRoute, chatRoute, knowledgeRoute, missionsRoute, profilesRoute, runsRoute, searchRoute, workspaceOverviewRoute, workflowsRoute } from '@/lib/routes'
import CommandPalette from '@/components/shared/CommandPalette'
import CreateDispatcher from '@/components/knowledge/create/CreateDispatcher'
import KnowledgeTypeGrid from '@/components/knowledge/KnowledgeTypeGrid'
import { ModeToggle } from '@/components/mode-toggle'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { PrimaryNavCollapsed } from '@/components/layout/PrimaryNavCollapsed'
import { PrimaryNavExpanded } from '@/components/layout/PrimaryNavExpanded'
import { PendingApprovalsBell } from '@/components/layout/PendingApprovalsBell'
import { WorkspaceInsightsRail, type WorkspaceInsightSource } from '@/components/layout/WorkspaceInsightsRail'
import { getWorkspaceIcon, type WorkspaceInfo } from '@/components/layout/WorkspaceSwitcher'

type SidebarConversation = {
  id: string
  title: string | null
  message_count?: number
  updated_at?: string
  last_message_at?: string | null
}

type KnowledgeItem = WorkspaceInsightSource & {
  title: string
  ai_title: string
  type: string
  is_pinned: boolean
}

type RunItem = {
  id: string
  workspace_id: string
  run_type: string
  status: string
  started_at?: string | null
}

type SectionMeta = {
  title: string
  description: string
}

export default function AppShell() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { setCommandPaletteOpen } = useUIStore()
  const { isConnected, on } = useWorkspaceWebSocket(workspaceId, 'system')

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showKnowledgeCreate, setShowKnowledgeCreate] = useState(false)
  const [createDispatchType, setCreateDispatchType] = useState<QuickKnowledgeType>('note')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<{ id: string; title: string | null } | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const isAgnosticPage = !workspaceId

  const { data: workspaceData = [], isFetched: workspacesFetched } = useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  })
  const { data: knowledgeData } = useQuery({
    queryKey: ['knowledge', workspaceId],
    queryFn: () => listKnowledge(workspaceId, { page_size: 200 }),
    enabled: !!workspaceId,
  })
  const { data: conversationData = [] } = useQuery({
    queryKey: ['conversations', workspaceId],
    queryFn: () => listConversations(workspaceId, { category: 'chats' }),
    enabled: !!workspaceId,
  })
  const { data: runsData } = useQuery<{ runs: RunItem[]; total: number }>({
    queryKey: ['runs', workspaceId, 'sidebar'],
    queryFn: () => listRuns({ workspace_id: workspaceId, limit: 25 }),
    enabled: !!workspaceId,
    refetchInterval: 5000,
  })

  const workspaces = workspaceData as WorkspaceInfo[]
  const conversations = conversationData as SidebarConversation[]
  const knowledgeItems = useMemo(
    () => ((knowledgeData?.knowledge ?? []) as KnowledgeItem[]),
    [knowledgeData],
  )
  const pinnedKnowledge = useMemo(
    () => knowledgeItems.filter(item => item.is_pinned),
    [knowledgeItems],
  )
  const runs = runsData?.runs ?? []
  const currentWorkspace = workspaces.find(workspace => workspace.id === workspaceId)

  useEffect(() => {
    if (isAgnosticPage || !workspacesFetched || currentWorkspace) return
    if (workspaces.length === 0) {
      navigate('/onboarding', { replace: true })
      return
    }
    navigate('/settings', { replace: true })
  }, [currentWorkspace, isAgnosticPage, navigate, workspaces, workspacesFetched])

  const openQuickPanel = useCallback((type: QuickKnowledgeType = 'note') => {
    setCreateDispatchType(type)
    setShowKnowledgeCreate(true)
  }, [])

  const handleNewKnowledge = useCallback(() => {
    openQuickPanel('note')
  }, [openQuickPanel])

  useKeyboardShortcut('b', true, () => setSidebarOpen(prev => !prev), { ignoreInputs: false })
  useKeyboardShortcut('n', true, handleNewKnowledge)

  const shortcutDisplay = useMemo(() => ({
    commandPalette: getShortcutDisplay('commandPalette'),
    toggleSidebar: getShortcutDisplay('toggleSidebar'),
    newKnowledge: getShortcutDisplay('newKnowledge'),
  }), [])

  useEffect(() => onQuickKnowledgeOpen(openQuickPanel), [openQuickPanel])

  useEffect(() => {
    return on('knowledge_updated', (message: Record<string, unknown>) => {
      const updatedKnowledgeId = typeof message.knowledge_id === 'string' ? message.knowledge_id : null
      queryClient.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
      if (updatedKnowledgeId) {
        queryClient.invalidateQueries({ queryKey: ['knowledge-item', updatedKnowledgeId] })
      }
    })
  }, [on, queryClient, workspaceId])

  const handleRenameConversation = useCallback(async (conversationId: string, newTitle: string) => {
    await updateConversation(workspaceId, conversationId, { title: newTitle, title_locked: true })
    queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })
    queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId, 'archived'] })
    queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
  }, [queryClient, workspaceId])

  const handleTrashConversation = useCallback(async (conversationId: string) => {
    await deleteConversation(workspaceId, conversationId)
    queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })
    if (location.pathname.includes(`/chat/${conversationId}`)) {
      navigate(chatRoute(workspaceId))
    }
  }, [location.pathname, navigate, queryClient, workspaceId])

  const handlePermanentDeleteRequest = useCallback(async (conversationId: string) => {
    const targetConversation = conversations.find(conversation => conversation.id === conversationId)
    setConversationToDelete({
      id: conversationId,
      title: targetConversation?.title ?? null,
    })
    setDeleteModalOpen(true)
  }, [conversations])

  const handlePermanentDeleteConversation = useCallback(async () => {
    if (!conversationToDelete) return

    setDeleteLoading(true)
    try {
      await deleteConversation(workspaceId, conversationToDelete.id)
      await permanentlyDeleteConversation(workspaceId, conversationToDelete.id)
      queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })
      if (location.pathname.includes(`/chat/${conversationToDelete.id}`)) {
        navigate(chatRoute(workspaceId))
      }
    } catch (error) {
      console.error('Failed to permanently delete conversation:', error)
    } finally {
      setDeleteLoading(false)
      setDeleteModalOpen(false)
      setConversationToDelete(null)
    }
  }, [conversationToDelete, location.pathname, navigate, queryClient, workspaceId])

  const currentSectionMeta = useMemo<SectionMeta>(() => {
    if (location.pathname.includes('/chat')) {
      return {
        title: 'Chat',
        description: 'Ask questions, review context, and manage conversations.',
      }
    }
    if (location.pathname.includes('/search')) {
      return {
        title: 'Search',
        description: 'Search across workspace knowledge without changing the primary IA.',
      }
    }
    if (location.pathname.includes('/settings')) {
      return {
        title: 'Settings',
        description: 'Manage workspace configuration, providers, and defaults.',
      }
    }
    if (location.pathname.includes('/runs')) {
      return {
        title: 'Runs',
        description: 'Durable execution records and current run activity.',
      }
    }
    if (location.pathname.includes('/profiles')) {
      return {
        title: 'Profiles',
        description: 'Reusable worker definitions, prompts, and capability bundles.',
      }
    }
    if (location.pathname.includes('/workflows')) {
      return {
        title: 'Workflows',
        description: 'Composable execution graphs and orchestration definitions.',
      }
    }
    if (location.pathname.includes('/missions')) {
      return {
        title: 'Missions',
        description: 'Packaged autonomous work that assembles workflows, profiles, and triggers.',
      }
    }
    if (location.pathname.includes('/catalog')) {
      return {
        title: 'Catalog',
        description: 'Browse and clone pre-built profiles, workflows, and missions.',
      }
    }
    if (location.pathname.includes('/artifacts')) {
      return {
        title: 'Artifacts',
        description: 'Persistent outputs produced by workspace runs and missions.',
      }
    }
    if (location.pathname.includes('/knowledge/')) {
      return {
        title: 'Knowledge Details',
        description: 'Review and edit a single knowledge item in full detail.',
      }
    }
    if (location.pathname.includes('/knowledge')) {
      return {
        title: 'Knowledge',
        description: 'Filter, scan, and act on workspace context and source material.',
      }
    }
    return {
      title: 'Workspace',
      description: 'Overview of the canonical domain surfaces in this workspace.',
    }
  }, [location.pathname])

  const routes = useMemo(() => ({
    workspace: workspaceOverviewRoute(workspaceId),
    knowledge: knowledgeRoute(workspaceId),
    knowledgeItem: (knowledgeId: string) => `/w/${workspaceId}/knowledge/${knowledgeId}`,
    chat: chatRoute(workspaceId),
    chatConversation: (conversationId: string) => chatRoute(workspaceId, conversationId),
    profiles: profilesRoute(),
    workflows: workflowsRoute(),
    missions: missionsRoute(),
    runs: runsRoute(),
    artifacts: artifactsRoute(),
    catalog: catalogRoute(),
    settings: '/settings',
  }), [workspaceId])

  const isWorkspaceHome = location.pathname === workspaceOverviewRoute(workspaceId)
  const isKnowledgeBoardPage = location.pathname === knowledgeRoute(workspaceId)
  const isSearchPage = location.pathname.includes('/search')
  const isSettingsPage = location.pathname.includes('/settings')
  const isWorkspaceAgentPage = location.pathname.includes('/chat')
  const isKnowledgePage = location.pathname.includes('/knowledge/')
  const isRunsPage = location.pathname.includes('/runs')
  const isProfilesPage = location.pathname.includes('/profiles')
  const isWorkflowsPage = location.pathname.includes('/workflows')
  const isMissionsPage = location.pathname.includes('/missions')
  const isArtifactsPage = location.pathname.includes('/artifacts')
  const isCatalogPage = location.pathname.includes('/catalog')
  const isPrimarySurface = (
    isWorkspaceHome
    || isKnowledgeBoardPage
    || isSearchPage
    || isSettingsPage
    || isWorkspaceAgentPage
    || isKnowledgePage
    || isRunsPage
    || isProfilesPage
    || isWorkflowsPage
    || isMissionsPage
    || isArtifactsPage
    || isCatalogPage
  )

  return (
    <div className="relative flex h-screen gap-3 overflow-hidden p-3">
      <CommandPalette />

      <aside className={`${sidebarOpen ? 'w-72' : 'w-14'} flex-shrink-0 transition-[width] duration-300`}>
        {sidebarOpen ? (
          <PrimaryNavExpanded
            workspaceId={workspaceId}
            workspaces={workspaces}
            currentWorkspace={currentWorkspace}
            isConnected={isConnected}
            isAgnosticPage={isAgnosticPage}
            activePath={location.pathname}
            conversations={conversations}
            runs={runs}
            pinnedKnowledge={pinnedKnowledge}
            routes={routes}
            onCreateWorkspace={() => navigate('/settings/workspaces?newWorkspace=1')}
            onRenameConversation={handleRenameConversation}
            onDeleteConversation={handleTrashConversation}
            onPermanentDeleteConversation={handlePermanentDeleteRequest}
          />
        ) : (
          <PrimaryNavCollapsed
            workspaceId={workspaceId}
            isConnected={isConnected}
            isAgnosticPage={isAgnosticPage}
            activePath={location.pathname}
            routes={routes}
            onExpand={() => setSidebarOpen(true)}
            workspaceIcon={getWorkspaceIcon(currentWorkspace?.icon ?? null)}
          />
        )}
      </aside>

      <div className="glass-card flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-40 flex flex-shrink-0 items-center gap-3 border-b border-border/60 bg-card/40 px-5 py-3 backdrop-blur-md">
          <button
            className="btn-ghost -ml-1 border border-border/60 bg-card/35 p-2"
            onClick={() => setSidebarOpen(prev => !prev)}
            title={`Toggle sidebar (${shortcutDisplay.toggleSidebar})`}
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0 max-w-[min(56vw,720px)] flex flex-col leading-tight">
            <p className="truncate text-sm font-semibold">{currentSectionMeta.title}</p>
            <p className="hidden truncate text-xs text-muted-foreground/90 sm:block">
              {currentSectionMeta.description}
            </p>
          </div>

          <div className="flex-1" />

          {!isAgnosticPage && !isConnected && (
            <div className="glass-card flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-400 animate-pulse">
              <WifiOff className="h-3 w-3" />
              Reconnecting...
            </div>
          )}

          <button
            className="btn-ghost hidden items-center gap-1.5 border border-border/60 bg-card/35 p-2 text-xs sm:flex"
            onClick={() => setCommandPaletteOpen(true)}
            title={`Command palette (${shortcutDisplay.commandPalette})`}
            aria-label="Open command palette"
          >
            <span className="font-mono text-muted-foreground">{shortcutDisplay.commandPalette}</span>
          </button>

          {!isAgnosticPage && (
            <div className="group relative inline-flex h-8 rounded-md shadow-sm">
              <button
                className="flex items-center gap-1.5 rounded-l-md border-r border-accent-foreground/20 bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                onClick={handleNewKnowledge}
                title={`New knowledge (${shortcutDisplay.newKnowledge})`}
              >
                <Plus className="h-3.5 w-3.5" />
                New Knowledge
              </button>
              <button className="rounded-r-md bg-accent px-2 text-accent-foreground transition-colors hover:bg-accent/90">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>

              <div className="invisible absolute right-0 top-full z-[140] mt-1 w-[340px] origin-top-right rounded-2xl border border-border bg-card p-3 opacity-0 shadow-2xl transition-all group-hover:visible group-hover:opacity-100">
                <p className="mb-2.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Knowledge Type
                </p>
                <KnowledgeTypeGrid onSelect={openQuickPanel} />
              </div>
            </div>
          )}

          <PendingApprovalsBell />
          <ModeToggle />
        </header>

        <CreateDispatcher
          type={createDispatchType}
          workspaceId={workspaceId}
          isOpen={showKnowledgeCreate}
          onClose={() => setShowKnowledgeCreate(false)}
        />

        <div className="relative z-0 flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden p-3">
          <main
            data-openforge-main-content="1"
            className={`relative z-20 flex min-h-0 min-w-0 flex-1 flex-col ${isSettingsPage ? 'overflow-hidden' : 'overflow-auto'} ${isPrimarySurface ? '' : 'rounded-2xl border border-border/60 bg-card/25'}`}
          >
            <Outlet />
          </main>

          {isKnowledgeBoardPage && (
            <WorkspaceInsightsRail workspaceId={workspaceId} knowledgeItems={knowledgeItems} />
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false)
          setConversationToDelete(null)
        }}
        title="Delete permanently?"
        message={`"${conversationToDelete?.title || 'Untitled Chat'}" and all its messages will be permanently deleted. This cannot be undone.`}
        confirmLabel={deleteLoading ? 'Deleting...' : 'Delete Permanently'}
        variant="danger"
        icon="trash"
        loading={deleteLoading}
        onConfirm={handlePermanentDeleteConversation}
      />
    </div>
  )
}
