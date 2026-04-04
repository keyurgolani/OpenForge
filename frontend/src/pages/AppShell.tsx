import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, PanelLeft, Plus, WifiOff } from 'lucide-react'

import { listConversations, listKnowledge, listRuns, listWorkspaces, updateConversation, deleteConversation, permanentlyDeleteConversation, togglePin, deleteKnowledge, toggleArchive, getGlobalConversation } from '@/lib/api'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { useUIStore } from '@/stores/uiStore'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { getShortcutDisplay } from '@/lib/keyboard'
import { onQuickKnowledgeOpen, type QuickKnowledgeType } from '@/lib/quick-knowledge'
import { agentsRoute, sinksRoute, automationsRoute, chatRoute, dashboardRoute, deploymentsRoute, knowledgeRoute, missionsRoute, runsRoute, searchRoute } from '@/lib/routes'
import CommandPalette from '@/components/shared/CommandPalette'
import CreateDispatcher from '@/components/knowledge/create/CreateDispatcher'
import KnowledgeTypeGrid from '@/components/knowledge/KnowledgeTypeGrid'
import { ModeToggle } from '@/components/mode-toggle'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import { PrimaryNavCollapsed } from '@/components/layout/PrimaryNavCollapsed'
import { PrimaryNavExpanded } from '@/components/layout/PrimaryNavExpanded'
// PendingApprovalsBell removed — approvals handled inline in chat
import { WorkspaceInsightsRail, type WorkspaceInsightSource } from '@/components/layout/WorkspaceInsightsRail'
import { getWorkspaceIcon, type WorkspaceInfo } from '@/components/layout/WorkspaceSwitcher'

type SidebarConversation = {
  id: string
  title: string | null
  agent_name?: string | null
  message_count?: number
  updated_at?: string
  last_message_at?: string | null
  last_message_preview?: string | null
  last_user_message?: string | null
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
  const { setCommandPaletteOpen, headerActions, chatHeaderOverride, setChatHeaderOverride } = useUIStore()
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
    refetchInterval: 30_000,
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
  useKeyboardShortcut('s', true, () => {/* prevent browser save dialog – app auto-saves */}, { ignoreInputs: false })
  useKeyboardShortcut('/', false, () => { if (workspaceId) navigate(searchRoute(workspaceId)) })

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

  const handleUnpinKnowledge = useCallback(async (knowledgeId: string) => {
    await togglePin(workspaceId, knowledgeId)
    queryClient.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
  }, [queryClient, workspaceId])

  const handleArchiveKnowledge = useCallback(async (knowledgeId: string) => {
    await toggleArchive(workspaceId, knowledgeId)
    queryClient.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
  }, [queryClient, workspaceId])

  const handleDeleteKnowledge = useCallback(async (knowledgeId: string) => {
    if (!confirm('Delete this knowledge item permanently?')) return
    await deleteKnowledge(workspaceId, knowledgeId)
    queryClient.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
  }, [queryClient, workspaceId])

  // Derive active chat conversation ID from URL
  const activeChatId = useMemo(() => {
    const chatMatch = location.pathname.match(/\/chat\/([^/]+)/)
    const id = chatMatch ? chatMatch[1] : null
    // Clear optimistic override when navigating away from chat
    if (!id) setChatHeaderOverride(null)
    return id
  }, [location.pathname, setChatHeaderOverride])

  // Fetch conversation details for the active chat (works for both workspace and global chats)
  // WebSocket events (agent_done, conversation_updated) invalidate this query for live updates
  const { data: activeChatData } = useQuery({
    queryKey: ['conversation-header', activeChatId],
    queryFn: () => getGlobalConversation(activeChatId!, false),
    enabled: !!activeChatId,
    staleTime: 30_000,
  })

  // Try sidebar conversations first (workspace), fall back to dedicated query (global)
  const activeChatConversation = useMemo(() => {
    if (!activeChatId) return null
    const fromSidebar = conversations.find(c => c.id === activeChatId)
    if (fromSidebar) return fromSidebar
    if (activeChatData) return {
      id: activeChatData.id,
      title: activeChatData.title,
      agent_name: activeChatData.agent_name,
      message_count: activeChatData.message_count,
      last_message_preview: activeChatData.last_message_preview,
      last_user_message: activeChatData.last_user_message,
    } as SidebarConversation
    return null
  }, [activeChatId, conversations, activeChatData])

  const currentSectionMeta = useMemo<SectionMeta>(() => {
    if (location.pathname.includes('/chat')) {
      if (activeChatConversation) {
        // Priority: generated title (always wins) > optimistic override > last user query > agent name > "New Chat"
        const chatTitle = activeChatConversation.title
          || chatHeaderOverride
          || activeChatConversation.last_user_message
          || activeChatConversation.agent_name
          || 'New Chat'
        return {
          title: `Chat: ${chatTitle}`,
          description: activeChatConversation.last_message_preview || '',
        }
      }
      return {
        title: 'Chat',
        description: 'Start a conversation with any agent.',
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
    if (location.pathname.includes('/agents')) {
      return {
        title: 'Agents',
        description: 'Agent definitions that power interactive and autonomous workflows.',
      }
    }
    if (location.pathname.includes('/automations')) {
      return {
        title: 'Automations',
        description: 'Automated workflows that run agents on triggers and schedules.',
      }
    }
    if (location.pathname.includes('/sinks')) {
      return {
        title: 'Sinks',
        description: 'Define what happens with agent output values in automations.',
      }
    }
    if (location.pathname.includes('/missions')) {
      return {
        title: 'Missions',
        description: 'Ongoing agent objectives with autonomous cycles.',
      }
    }
    if (location.pathname.includes('/deployments')) {
      return {
        title: 'Deployments',
        description: 'Live automation instances.',
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
      title: 'Dashboard',
      description: 'Your workspace at a glance.',
    }
  }, [location.pathname, activeChatConversation])

  const routes = useMemo(() => ({
    workspace: dashboardRoute(workspaceId),
    knowledge: knowledgeRoute(workspaceId),
    knowledgeItem: (knowledgeId: string) => `/w/${workspaceId}/knowledge/${knowledgeId}`,
    search: searchRoute(workspaceId),
    chat: chatRoute(workspaceId),
    chatConversation: (conversationId: string) => chatRoute(workspaceId, conversationId),
    agents: agentsRoute(),
    automations: automationsRoute(),
    deployments: deploymentsRoute(),
    missions: missionsRoute(),
    runs: runsRoute(),
    sinks: sinksRoute(),
    settings: '/settings',
  }), [workspaceId])

  const isDashboard = location.pathname === dashboardRoute(workspaceId)
  const isKnowledgeBoardPage = location.pathname === knowledgeRoute(workspaceId)
  const isSearchPage = location.pathname.includes('/search')
  const isSettingsPage = location.pathname.includes('/settings')
  const isAgentChatPage = location.pathname.includes('/chat')
  const isKnowledgePage = location.pathname.includes('/knowledge/')
  const isRunsPage = location.pathname.includes('/runs')
  const isAgentsPage = location.pathname.includes('/agents')
  const isAutomationsPage = location.pathname.includes('/automations')
  const isSinksPage = location.pathname.includes('/sinks')
  const isMissionsPage = location.pathname.includes('/missions')
  const isDeploymentsPage = location.pathname.includes('/deployments')
  const isPrimarySurface = (
    isDashboard
    || isKnowledgeBoardPage
    || isSearchPage
    || isSettingsPage
    || isAgentChatPage
    || isKnowledgePage
    || isRunsPage
    || isAgentsPage
    || isAutomationsPage
    || isSinksPage
    || isMissionsPage
    || isDeploymentsPage
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
            onUnpinKnowledge={handleUnpinKnowledge}
            onArchiveKnowledge={handleArchiveKnowledge}
            onDeleteKnowledge={handleDeleteKnowledge}
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
        <header className="relative z-40 flex flex-shrink-0 items-center gap-3 border-b border-border/25 bg-card/40 px-5 py-3 backdrop-blur-md">
          <button
            className="btn-ghost -ml-1 border border-border/25 bg-card/35 p-2"
            onClick={() => setSidebarOpen(prev => !prev)}
            title={`Toggle sidebar (${shortcutDisplay.toggleSidebar})`}
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0 max-w-[min(56vw,720px)] flex flex-col leading-tight">
            <p className="truncate text-sm font-semibold">{currentSectionMeta.title}</p>
            {currentSectionMeta.description && (
              <p className="hidden truncate text-xs text-muted-foreground/90 sm:block">
                {currentSectionMeta.description
                  .replace(/[#*_~`|>\[\](){}!]/g, '')
                  .replace(/\n+/g, ' ')
                  .trim()}
              </p>
            )}
          </div>

          <div className="flex-1" />

          {!isAgnosticPage && !isConnected && (
            <div className="glass-card flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-400 animate-pulse">
              <WifiOff className="h-3 w-3" />
              Reconnecting...
            </div>
          )}

          <button
            className="btn-ghost hidden items-center gap-1.5 border border-border/25 bg-card/35 p-2 text-xs sm:flex"
            onClick={() => setCommandPaletteOpen(true)}
            title={`Command palette (${shortcutDisplay.commandPalette})`}
            aria-label="Open command palette"
          >
            <span className="font-mono text-muted-foreground">{shortcutDisplay.commandPalette}</span>
          </button>

          {headerActions}

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
            className={`relative z-20 flex min-h-0 min-w-0 flex-1 flex-col ${isSettingsPage ? 'overflow-hidden' : 'overflow-auto'} ${isPrimarySurface ? '' : 'rounded-2xl border border-border/25 bg-card/25'}`}
          >
            <Outlet />
          </main>

          {isKnowledgeBoardPage && (
            <WorkspaceInsightsRail workspaceId={workspaceId} knowledgeItems={knowledgeItems} categories={(currentWorkspace as any)?.intelligence_categories} />
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
