import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Outlet, useNavigate, useParams, Link, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listWorkspaces, listKnowledge, listConversations, updateConversation, deleteConversation, permanentlyDeleteConversation, exportConversation, countPendingHITL, listPendingHITL, approveHITL, denyHITL } from '@/lib/api'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { useUIStore } from '@/stores/uiStore'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { getShortcutDisplay } from '@/lib/keyboard'
import { onQuickKnowledgeOpen, type QuickKnowledgeType } from '@/lib/quick-knowledge'
import CommandPalette from '@/components/shared/CommandPalette'
import CreateDispatcher from '@/components/knowledge/create/CreateDispatcher'
import KnowledgeTypeGrid from '@/components/knowledge/KnowledgeTypeGrid'
import { ModeToggle } from '@/components/mode-toggle'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
} from '@/components/ui/context-menu'
import { AnimatePresence, motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import MarkdownIt from 'markdown-it'
import {
    Home, MessageSquare, Search, Settings, Plus, Folder,
    FileText, Pin, Archive, Bookmark, Code2, Zap, WifiOff,
    PanelLeft, ChevronDown, ChevronLeft, ChevronRight, Brain, CheckSquare, Calendar, Star, Pencil, Trash2, Download,
    ShieldAlert, ShieldCheck, ShieldX, Check, X, Clock, Loader2, ExternalLink,
} from 'lucide-react'
import { getWorkspaceIcon } from '@/pages/SettingsPage'

const MIN_INSIGHTS_WIDTH = 280
const MAX_INSIGHTS_WIDTH = 560
const DEFAULT_INSIGHTS_WIDTH = 320
const INSIGHTS_WIDTH_STORAGE_KEY = 'openforge.shell.insights.width'
const INSIGHTS_COLLAPSED_STORAGE_KEY = 'openforge.shell.insights.collapsed'
type InsightSectionKey = 'tasks' | 'timelines' | 'facts' | 'crucial_things'
type InsightItem = { knowledgeId: string, text: string }
type InsightSections = Record<InsightSectionKey, InsightItem[]>

const INSIGHT_SECTION_ORDER: InsightSectionKey[] = ['tasks', 'timelines', 'facts', 'crucial_things']
const INSIGHT_SECTION_META: Record<InsightSectionKey, {
    title: string
    icon: React.ComponentType<{ className?: string }>
    emptyLabel: string
    maxItems: number
    badgeClass: string
    dotClass: string
}> = {
    tasks: {
        title: 'Action Items',
        icon: CheckSquare,
        emptyLabel: 'No pending action items',
        maxItems: 12,
        badgeClass: 'text-accent bg-accent/10 border border-accent/20',
        dotClass: 'bg-accent/90',
    },
    timelines: {
        title: 'Timeline Updates',
        icon: Calendar,
        emptyLabel: 'No timeline updates',
        maxItems: 12,
        badgeClass: 'text-blue-300 bg-blue-400/10 border border-blue-300/30',
        dotClass: 'bg-blue-300',
    },
    facts: {
        title: 'Key Facts',
        icon: FileText,
        emptyLabel: 'No key facts found',
        maxItems: 12,
        badgeClass: 'text-foreground/90 bg-muted/70 border border-border/70',
        dotClass: 'bg-foreground/70',
    },
    crucial_things: {
        title: 'Crucial Information',
        icon: Star,
        emptyLabel: 'No crucial information yet',
        maxItems: 8,
        badgeClass: 'text-red-300 bg-red-400/10 border border-red-300/30',
        dotClass: 'bg-red-300',
    },
}

const clampInsightsWidth = (value: number) =>
    Math.max(MIN_INSIGHTS_WIDTH, Math.min(MAX_INSIGHTS_WIDTH, value))

const insightsMd = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })
insightsMd.renderer.rules.link_open = () => ''
insightsMd.renderer.rules.link_close = () => ''
type SidebarConversation = { id: string; title: string | null; message_count?: number }

export default function AppShell() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const location = useLocation()
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [showKnowledgeCreate, setShowKnowledgeCreate] = useState(false)
    const [createDispatchType, setCreateDispatchType] = useState<QuickKnowledgeType>('note')
    const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
    const [workspaceQuery, setWorkspaceQuery] = useState('')
    const [activeInsightSection, setActiveInsightSection] = useState<InsightSectionKey | null>('tasks')
    const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null)
    const [renamingConversationDraft, setRenamingConversationDraft] = useState('')
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [conversationToDelete, setConversationToDelete] = useState<{ id: string; title: string | null } | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [isInsightsCollapsed, setIsInsightsCollapsed] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false
        return window.localStorage.getItem(INSIGHTS_COLLAPSED_STORAGE_KEY) === '1'
    })
    const [insightsWidth, setInsightsWidth] = useState<number>(() => {
        if (typeof window === 'undefined') return DEFAULT_INSIGHTS_WIDTH
        const raw = window.localStorage.getItem(INSIGHTS_WIDTH_STORAGE_KEY)
        const parsed = raw ? parseInt(raw, 10) : NaN
        return Number.isFinite(parsed) ? clampInsightsWidth(parsed) : DEFAULT_INSIGHTS_WIDTH
    })
    const { isConnected, on } = useWorkspaceWebSocket(workspaceId)
    const { setCommandPaletteOpen } = useUIStore()
    const qc = useQueryClient()

    const { data: workspaces = [], isFetched: workspacesFetched } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const { data: knowledgeData } = useQuery({
        queryKey: ['knowledge', workspaceId],
        queryFn: () => listKnowledge(workspaceId, { page_size: 200 }),
        enabled: !!workspaceId,
    })
    const { data: conversations = [] } = useQuery({
        queryKey: ['conversations', workspaceId],
        queryFn: () => listConversations(workspaceId, { category: 'chats' }),
        enabled: !!workspaceId,
    })

    // ── HITL notification state ────────────────────────────────────────────────
    const [hitlShadeOpen, setHitlShadeOpen] = useState(false)
    const [hitlNotes, setHitlNotes] = useState<Record<string, string>>({})
    const [hitlProcessing, setHitlProcessing] = useState<Set<string>>(new Set())
    const hitlShadeRef = useRef<HTMLDivElement | null>(null)
    const { data: hitlCountData } = useQuery({
        queryKey: ['hitl-pending-count'],
        queryFn: countPendingHITL,
        refetchInterval: 5000,
    })
    const hitlPendingCount = hitlCountData?.pending ?? 0
    const { data: hitlPendingRequests = [] } = useQuery<{ id: string; workspace_id: string; conversation_id: string; tool_id: string; tool_input: any; action_summary: string; risk_level: string; status: string; created_at: string }[]>({
        queryKey: ['hitl-pending-list'],
        queryFn: () => listPendingHITL(),
        enabled: hitlShadeOpen,
        refetchInterval: hitlShadeOpen ? 5000 : false,
    })
    const hitlApproveMutation = useMutation({
        mutationFn: ({ id, note }: { id: string; note?: string }) => approveHITL(id, note),
        onMutate: ({ id }) => setHitlProcessing(prev => new Set(prev).add(id)),
        onSettled: (_d, _e, { id }) => {
            setHitlProcessing(prev => { const n = new Set(prev); n.delete(id); return n })
            setHitlNotes(prev => { const n = { ...prev }; delete n[id]; return n })
            qc.invalidateQueries({ queryKey: ['hitl-pending-count'] })
            qc.invalidateQueries({ queryKey: ['hitl-pending-list'] })
            qc.invalidateQueries({ queryKey: ['hitl-pending'] })
        },
    })
    const hitlDenyMutation = useMutation({
        mutationFn: ({ id, note }: { id: string; note?: string }) => denyHITL(id, note),
        onMutate: ({ id }) => setHitlProcessing(prev => new Set(prev).add(id)),
        onSettled: (_d, _e, { id }) => {
            setHitlProcessing(prev => { const n = new Set(prev); n.delete(id); return n })
            setHitlNotes(prev => { const n = { ...prev }; delete n[id]; return n })
            qc.invalidateQueries({ queryKey: ['hitl-pending-count'] })
            qc.invalidateQueries({ queryKey: ['hitl-pending-list'] })
            qc.invalidateQueries({ queryKey: ['hitl-pending'] })
        },
    })
    // Auto-close shade when all requests are resolved
    useEffect(() => {
        if (hitlPendingCount === 0) setHitlShadeOpen(false)
    }, [hitlPendingCount])
    // Close shade on outside click
    useEffect(() => {
        if (!hitlShadeOpen) return
        const handler = (e: MouseEvent) => {
            if (hitlShadeRef.current && !hitlShadeRef.current.contains(e.target as Node)) setHitlShadeOpen(false)
        }
        const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setHitlShadeOpen(false) }
        window.addEventListener('mousedown', handler)
        window.addEventListener('keydown', escHandler)
        return () => { window.removeEventListener('mousedown', handler); window.removeEventListener('keydown', escHandler) }
    }, [hitlShadeOpen])

    const workspaceList = workspaces as { id: string; name: string; icon: string; color: string }[]
    const ws = workspaceList.find(w => w.id === workspaceId)

    // Redirect when workspace doesn't exist
    useEffect(() => {
        if (!workspacesFetched) return
        if (ws) return // current workspace found — nothing to do
        if (workspaceList.length === 0) {
            navigate('/onboarding', { replace: true })
        } else {
            navigate(`/settings`, { replace: true })
        }
    }, [workspacesFetched, ws, workspaceList, navigate])
    const recentConversations = conversations as SidebarConversation[]
    const workspaceMenuRef = useRef<HTMLDivElement | null>(null)
    const conversationRenameInputRef = useRef<HTMLInputElement | null>(null)
    const knowledgeItems = knowledgeData?.knowledge ?? []
    const pinnedKnowledgeItems = knowledgeItems.filter((n: { is_pinned: boolean }) => n.is_pinned)
    const isWorkspaceHome = location.pathname === `/w/${workspaceId}`
    const isSearchPage = location.pathname.includes('/search')
    const isSettingsPage = location.pathname.includes('/settings')
    const isAgentPage = location.pathname.includes('/agent')
    const isKnowledgePage = location.pathname.includes('/knowledge/') || location.pathname.includes('/knowledge/')
    const currentSectionMeta = useMemo(() => {
        if (location.pathname.includes('/agent')) {
            return {
                title: 'Workspace Agent',
                description: 'Ask questions, review context, and manage conversations.',
            }
        }
        if (location.pathname.includes('/search')) {
            return {
                title: 'Workspace Search',
                description: 'Search by meaning across your knowledge and saved sources.',
            }
        }
        if (location.pathname.includes('/settings')) {
            return {
                title: 'Settings',
                description: 'Manage workspace configuration, providers, and defaults.',
            }
        }
        if (location.pathname.includes('/knowledge/') || location.pathname.includes('/knowledge/')) {
            return {
                title: 'Knowledge Details',
                description: 'Review and edit a single knowledge item in full detail.',
            }
        }
        return {
            title: 'Workspace Knowledge',
            description: 'Filter, scan, and act on knowledge without leaving the board.',
        }
    }, [location.pathname])

    const isActive = (path: string) => location.pathname.includes(path)
    const filteredWorkspaces = useMemo(() => {
        const query = workspaceQuery.trim().toLowerCase()
        if (!query) return workspaceList
        return workspaceList.filter(workspace =>
            workspace.name.toLowerCase().includes(query),
        )
    }, [workspaceList, workspaceQuery])

    const aggregatedInsights = useMemo<InsightSections>(() => {
        const ag: InsightSections = {
            tasks: [],
            timelines: [],
            facts: [],
            crucial_things: [],
        }
        knowledgeItems.forEach((n: { id: string, insights?: any }) => {
            if (!n.insights) return
            if (n.insights.tasks) n.insights.tasks.forEach((t: string) => ag.tasks.push({ knowledgeId: n.id, text: t }))
            if (n.insights.timelines) {
                n.insights.timelines.forEach((t: any) => {
                    if (typeof t === 'string') {
                        ag.timelines.push({ knowledgeId: n.id, text: t })
                        return
                    }
                    const date = typeof t?.date === 'string' ? t.date.trim() : ''
                    const event = typeof t?.event === 'string' ? t.event.trim() : ''
                    if (date && event) ag.timelines.push({ knowledgeId: n.id, text: `**${date}**: ${event}` })
                    else if (date) ag.timelines.push({ knowledgeId: n.id, text: `**${date}**` })
                    else if (event) ag.timelines.push({ knowledgeId: n.id, text: event })
                })
            }
            if (n.insights.facts) n.insights.facts.forEach((t: string) => ag.facts.push({ knowledgeId: n.id, text: t }))
            if (n.insights.crucial_things) n.insights.crucial_things.forEach((t: string) => ag.crucial_things.push({ knowledgeId: n.id, text: t }))
        })
        return ag
    }, [knowledgeItems])

    const totalInsightsCount = useMemo(
        () => INSIGHT_SECTION_ORDER.reduce((count, section) => count + aggregatedInsights[section].length, 0),
        [aggregatedInsights]
    )

    // Keyboard shortcuts
    const openQuickPanel = useCallback((type: QuickKnowledgeType = 'note') => {
        setCreateDispatchType(type)
        setShowKnowledgeCreate(true)
    }, [])

    const handleNewKnowledge = useCallback(() => {
        openQuickPanel('note')
    }, [openQuickPanel])

    useKeyboardShortcut('b', true, () => setSidebarOpen(p => !p), { ignoreInputs: false })
    useKeyboardShortcut('n', true, handleNewKnowledge)

    const shortcutDisplay = useMemo(() => ({
        commandPalette: getShortcutDisplay('commandPalette'),
        toggleSidebar: getShortcutDisplay('toggleSidebar'),
        newKnowledge: getShortcutDisplay('newKnowledge'),
    }), [])

    useEffect(() => onQuickKnowledgeOpen(openQuickPanel), [openQuickPanel])
    useEffect(() => {
        return on('knowledge_updated', (msg: Record<string, unknown>) => {
            const updatedKnowledgeId = typeof msg.knowledge_id === 'string' ? msg.knowledge_id : null
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            if (updatedKnowledgeId) {
                qc.invalidateQueries({ queryKey: ['knowledge-item', updatedKnowledgeId] })
            }
        })
    }, [on, qc, workspaceId])
    useEffect(() => {
        if (!workspaceMenuOpen) return
        const handleOutsideClick = (event: MouseEvent) => {
            if (!workspaceMenuRef.current) return
            if (!workspaceMenuRef.current.contains(event.target as Node)) {
                setWorkspaceMenuOpen(false)
            }
        }
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setWorkspaceMenuOpen(false)
        }
        window.addEventListener('mousedown', handleOutsideClick)
        window.addEventListener('keydown', handleEscape)
        return () => {
            window.removeEventListener('mousedown', handleOutsideClick)
            window.removeEventListener('keydown', handleEscape)
        }
    }, [workspaceMenuOpen])
    useEffect(() => {
        setWorkspaceMenuOpen(false)
        setWorkspaceQuery('')
        setRenamingConversationId(null)
        setRenamingConversationDraft('')
    }, [workspaceId])

    useEffect(() => {
        if (!renamingConversationId) return
        const rafId = window.requestAnimationFrame(() => {
            conversationRenameInputRef.current?.focus()
            conversationRenameInputRef.current?.select()
        })
        return () => window.cancelAnimationFrame(rafId)
    }, [renamingConversationId])

    const toggleInsightSection = useCallback((section: InsightSectionKey) => {
        setActiveInsightSection(prev => (prev === section ? null : section))
    }, [])

    const beginRenameConversation = useCallback((conversationId: string, currentTitle: string | null) => {
        setRenamingConversationId(conversationId)
        setRenamingConversationDraft(currentTitle ?? '')
    }, [])

    const cancelRenameConversation = useCallback(() => {
        setRenamingConversationId(null)
        setRenamingConversationDraft('')
    }, [])

    const commitRenameConversation = useCallback(async () => {
        if (!renamingConversationId) return
        const currentTitle = recentConversations.find(c => c.id === renamingConversationId)?.title ?? ''
        const trimmed = renamingConversationDraft.trim()
        if (!trimmed || trimmed === currentTitle) {
            cancelRenameConversation()
            return
        }
        try {
            await updateConversation(workspaceId, renamingConversationId, { title: trimmed, title_locked: true })
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'archived'] })
            qc.invalidateQueries({ queryKey: ['conversation', renamingConversationId] })
        } catch (error) {
            console.error('Failed to rename conversation from sidebar:', error)
        } finally {
            cancelRenameConversation()
        }
    }, [cancelRenameConversation, qc, recentConversations, renamingConversationDraft, renamingConversationId, workspaceId])

    const handleTrashConversation = useCallback(async (conversationId: string) => {
        try {
            await deleteConversation(workspaceId, conversationId)
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
            if (location.pathname.includes(`/agent/${conversationId}`)) {
                navigate(`/w/${workspaceId}/agent`)
            }
        } catch (error) {
            console.error('Failed to move conversation to trash from sidebar:', error)
        }
    }, [location.pathname, navigate, qc, workspaceId])

    const handlePermanentDeleteConversation = useCallback(async () => {
        if (!conversationToDelete) return
        setDeleteLoading(true)
        try {
            await deleteConversation(workspaceId, conversationToDelete.id)
            await permanentlyDeleteConversation(workspaceId, conversationToDelete.id)
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
            if (location.pathname.includes(`/agent/${conversationToDelete.id}`)) {
                navigate(`/w/${workspaceId}/agent`)
            }
        } catch (error) {
            console.error('Failed to permanently delete conversation:', error)
        } finally {
            setDeleteLoading(false)
            setDeleteModalOpen(false)
            setConversationToDelete(null)
        }
    }, [conversationToDelete, location.pathname, navigate, qc, workspaceId])

    const toggleInsightsSidebar = useCallback(() => {
        setIsInsightsCollapsed(prev => {
            const next = !prev
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(INSIGHTS_COLLAPSED_STORAGE_KEY, next ? '1' : '0')
            }
            return next
        })
    }, [])

    const handleInsightsResizeStart = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault()
        const startX = e.clientX
        const startWidth = insightsWidth
        let currentWidth = startWidth

        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = startX - moveEvent.clientX
            currentWidth = clampInsightsWidth(startWidth + delta)
            setInsightsWidth(currentWidth)
        }

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            window.localStorage.setItem(INSIGHTS_WIDTH_STORAGE_KEY, String(currentWidth))
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    return (
        <div className="relative flex h-screen gap-3 overflow-hidden p-3">
            <CommandPalette />
            {/* Sidebar */}
            <aside className={`${sidebarOpen ? 'w-72' : 'w-14'} flex-shrink-0 transition-[width] duration-300 overflow-hidden flex flex-col glass-card`}>
                {sidebarOpen ? (
                    <>
                        <div className="flex-shrink-0">
                            {/* Workspace selector + switcher */}
                            <div ref={workspaceMenuRef} className="relative">
                                <button
                                    type="button"
                                    className="w-full border-b border-border/60 bg-card/45 px-4 py-3 text-left transition-colors hover:bg-card/60"
                                    onClick={() => setWorkspaceMenuOpen(prev => !prev)}
                                    aria-expanded={workspaceMenuOpen}
                                    aria-label="Choose workspace"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-accent/12 border border-accent/25 flex items-center justify-center flex-shrink-0">
                                            {getWorkspaceIcon(ws?.icon ?? null)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold truncate">{ws?.name ?? 'Select workspace'}</p>
                                            <p className="text-[11px] text-muted-foreground truncate">
                                                {workspaceList.length} workspace{workspaceList.length === 1 ? '' : 's'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 pl-1">
                                            <div
                                                className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}
                                                title={isConnected ? 'Connected' : 'Reconnecting…'}
                                            />
                                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${workspaceMenuOpen ? 'rotate-180' : ''}`} />
                                        </div>
                                    </div>
                                </button>

                                {workspaceMenuOpen && (
                                    <div className="absolute top-full left-2 right-2 mt-2 z-[180] glass-card p-2 rounded-xl">
                                        <div className="relative mb-2">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                                            <input
                                                className="input h-8 pl-8 text-xs"
                                                placeholder="Search workspace..."
                                                value={workspaceQuery}
                                                onChange={e => setWorkspaceQuery(e.target.value)}
                                                autoFocus
                                            />
                                        </div>
                                        <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
                                            {filteredWorkspaces.length === 0 ? (
                                                <p className="px-2 py-2 text-xs text-muted-foreground">No workspaces found.</p>
                                            ) : (
                                                filteredWorkspaces.map(workspace => (
                                                    <button
                                                        key={workspace.id}
                                                        type="button"
                                                        className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${workspace.id === workspaceId
                                                            ? 'bg-accent/14 border border-accent/35'
                                                            : 'hover:bg-muted/45 border border-transparent'}`}
                                                        onClick={() => {
                                                            setWorkspaceMenuOpen(false)
                                                            setWorkspaceQuery('')
                                                            if (workspace.id !== workspaceId) {
                                                                // Preserve the current sub-path when switching workspaces
                                                                const prefix = `/w/${workspaceId}`
                                                                const subPath = location.pathname.startsWith(prefix)
                                                                    ? location.pathname.slice(prefix.length)
                                                                    : ''
                                                                // Drop knowledge-specific IDs and conversation IDs since they're workspace-specific
                                                                const keepPath = subPath.startsWith('/agent/') ? '/agent'
                                                                    : subPath.startsWith('/knowledge/') ? ''
                                                                    : subPath
                                                                navigate(`/w/${workspace.id}${keepPath}`)
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-7 h-7 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                                                                {getWorkspaceIcon(workspace.icon)}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-sm font-medium truncate">{workspace.name}</p>
                                                            </div>
                                                            {workspace.id === workspaceId && (
                                                                <span className="chip-accent text-[10px]">Current</span>
                                                            )}
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                        <div className="mt-2 border-t border-border/60 pt-2">
                                            <button
                                                type="button"
                                                className="w-full rounded-lg border border-transparent px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-muted/45 hover:border-border/60"
                                                onClick={() => {
                                                    setWorkspaceMenuOpen(false)
                                                    setWorkspaceQuery('')
                                                    navigate(`/settings?tab=workspaces&newWorkspace=1`)
                                                }}
                                            >
                                                <span className="inline-flex items-center gap-2">
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Add Workspace
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="px-4 pt-3 pb-3">
                                {/* Nav */}
                                <nav className="space-y-1">
                                    <Link to={`/w/${workspaceId}`} className={`sidebar-item ${location.pathname === `/w/${workspaceId}` ? 'active' : ''}`}>
                                        <Home className="w-4 h-4" /> Knowledge
                                    </Link>
                                    <Link to={`/w/${workspaceId}/search`} className={`sidebar-item ${isActive('/search') ? 'active' : ''}`}>
                                        <Search className="w-4 h-4" /> Search
                                    </Link>
                                    <Link to={`/w/${workspaceId}/agent`} className={`sidebar-item ${isActive('/agent') ? 'active' : ''}`}>
                                        <MessageSquare className="w-4 h-4" /> Workspace Agent
                                    </Link>
                                </nav>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
                            {/* Pinned knowledge */}
                            {pinnedKnowledgeItems.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-1 px-2 mb-1">
                                        <Pin className="w-3 h-3 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Pinned</span>
                                    </div>
                                    {pinnedKnowledgeItems.slice(0, 5).map((n: { id: string; title: string; ai_title: string; type: string }) => (
                                        <Link
                                            key={n.id}
                                            to={`/w/${workspaceId}/knowledge/${n.id}`}
                                            className={`sidebar-item text-xs ${(isActive(`/knowledge/${n.id}`) || isActive(`/knowledge/${n.id}`)) ? 'active' : ''}`}
                                        >
                                            <KnowledgeTypeIcon type={n.type} />
                                            <span className="truncate">{n.title || n.ai_title || 'Untitled'}</span>
                                        </Link>
                                    ))}
                                </div>
                            )}

                            {/* Recent conversations */}
                            {recentConversations.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-1 px-2 mb-1">
                                        <MessageSquare className="w-3 h-3 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Recent Conversations</span>
                                    </div>
                                    {recentConversations.slice(0, 5).map(c => {
                                        const isRenaming = renamingConversationId === c.id
                                        return (
                                        <ContextMenu key={c.id}>
                                            <ContextMenuTrigger asChild>
                                                {isRenaming ? (
                                                    <div className={`sidebar-item text-xs ${isActive(`/agent/${c.id}`) ? 'active' : ''}`}>
                                                        <MessageSquare className="w-3 h-3" />
                                                        <input
                                                            ref={conversationRenameInputRef}
                                                            className="w-full bg-transparent text-xs outline-none border-b border-accent/45"
                                                            value={renamingConversationDraft}
                                                            onChange={(event) => setRenamingConversationDraft(event.target.value)}
                                                            onBlur={() => { void commitRenameConversation() }}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter') {
                                                                    event.preventDefault()
                                                                    void commitRenameConversation()
                                                                    return
                                                                }
                                                                if (event.key === 'Escape') {
                                                                    event.preventDefault()
                                                                    cancelRenameConversation()
                                                                }
                                                            }}
                                                            onClick={(event) => event.stopPropagation()}
                                                        />
                                                    </div>
                                                ) : (
                                                    <Link to={`/w/${workspaceId}/agent/${c.id}`} className={`sidebar-item text-xs ${isActive(`/agent/${c.id}`) ? 'active' : ''}`}>
                                                        <MessageSquare className="w-3 h-3" />
                                                        <span className="truncate">{c.title ?? 'New Chat'}</span>
                                                    </Link>
                                                )}
                                            </ContextMenuTrigger>
                                            <ContextMenuContent className="w-48">
                                                <ContextMenuItem
                                                    onSelect={(event) => {
                                                        event.preventDefault()
                                                        beginRenameConversation(c.id, c.title ?? null)
                                                    }}
                                                    className="gap-2"
                                                >
                                                    <Pencil className="w-4 h-4" /> Rename Chat
                                                </ContextMenuItem>
                                                <ContextMenuSeparator />
                                                <ContextMenuItem
                                                    onSelect={(event) => {
                                                        event.preventDefault()
                                                        void handleTrashConversation(c.id)
                                                    }}
                                                    className="gap-2 text-red-500 focus:text-red-400 focus:bg-red-500/10"
                                                >
                                                    <Trash2 className="w-4 h-4" /> Move to Trash
                                                </ContextMenuItem>
                                                <ContextMenuItem
                                                    onSelect={(event) => {
                                                        event.preventDefault()
                                                        setConversationToDelete({ id: c.id, title: c.title ?? null })
                                                        setDeleteModalOpen(true)
                                                    }}
                                                    className="gap-2 text-red-500 focus:text-red-400 focus:bg-red-500/10"
                                                >
                                                    <Trash2 className="w-4 h-4" /> Delete Permanently
                                                </ContextMenuItem>
                                            </ContextMenuContent>
                                        </ContextMenu>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Settings — bottom of sidebar, same style as workspace selector */}
                        <div className="flex-shrink-0 border-t border-border/60">
                            <Link
                                to={`/settings`}
                                className={`flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-card/60 ${isSettingsPage ? 'bg-card/55' : 'bg-card/45'}`}
                            >
                                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${isSettingsPage ? 'bg-accent/15 border-accent/30' : 'bg-muted/40 border-border/50'}`}>
                                    <Settings className={`w-4 h-4 ${isSettingsPage ? 'text-accent' : 'text-muted-foreground'}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className={`text-sm font-semibold truncate ${isSettingsPage ? 'text-accent' : ''}`}>Settings</p>
                                    <p className="text-[11px] text-muted-foreground truncate">Providers, prompts & more</p>
                                </div>
                            </Link>
                        </div>
                    </>
                ) : (
                    /* Collapsed siderail — icon-only navigation */
                    <div className="flex flex-col h-full items-center py-3 gap-1">
                        {/* Workspace icon */}
                        <button
                            type="button"
                            onClick={() => setSidebarOpen(true)}
                            title={ws?.name ?? 'Open sidebar'}
                            className="w-9 h-9 rounded-lg bg-accent/12 border border-accent/25 flex items-center justify-center mb-1 hover:bg-accent/20 transition-colors relative"
                        >
                            {getWorkspaceIcon(ws?.icon ?? null)}
                            <span
                                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-background ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}
                                title={isConnected ? 'Connected' : 'Reconnecting…'}
                            />
                        </button>

                        {/* Nav icons */}
                        <nav className="flex flex-col gap-1 w-full items-center mt-1">
                            <Link
                                to={`/w/${workspaceId}`}
                                title="Knowledge"
                                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${location.pathname === `/w/${workspaceId}` ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}
                            >
                                <Home className="w-4 h-4" />
                            </Link>
                            <Link
                                to={`/w/${workspaceId}/search`}
                                title="Search"
                                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${isActive('/search') ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}
                            >
                                <Search className="w-4 h-4" />
                            </Link>
                            <Link
                                to={`/w/${workspaceId}/agent`}
                                title="Workspace Agent"
                                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${isActive('/agent') ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}
                            >
                                <MessageSquare className="w-4 h-4" />
                            </Link>
                        </nav>

                        <div className="flex-1" />

                        {/* Settings */}
                        <Link
                            to={`/settings`}
                            title="Settings"
                            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${isSettingsPage ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}
                        >
                            <Settings className="w-4 h-4" />
                        </Link>
                    </div>
                )}
            </aside>

            {/* Main */}
            <div className="flex-1 flex flex-col min-w-0 glass-card overflow-hidden">
                {/* Top bar */}
                <header className="relative z-40 flex items-center gap-3 px-5 py-3 border-b border-border/60 bg-card/40 backdrop-blur-md flex-shrink-0">
                    <button
                        className="btn-ghost p-2 -ml-1 border border-border/60 bg-card/35"
                        onClick={() => setSidebarOpen(p => !p)}
                        title={`Toggle sidebar (${shortcutDisplay.toggleSidebar})`}
                        aria-label="Toggle sidebar"
                    >
                        <PanelLeft className="w-4 h-4" />
                    </button>

<div className="min-w-0 max-w-[min(56vw,720px)] flex flex-col leading-tight">
                        <p className="text-sm font-semibold truncate">{currentSectionMeta.title}</p>
                        <p className="hidden sm:block text-xs text-muted-foreground/90 truncate">
                            {currentSectionMeta.description}
                        </p>
                    </div>

                    <div className="flex-1" />

                    {!isConnected && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-400 glass-card px-3 py-1.5 animate-pulse">
                            <WifiOff className="w-3 h-3" /> Reconnecting…
                        </div>
                    )}

                    <button
                        className="btn-ghost p-2 text-xs gap-1.5 hidden sm:flex items-center border border-border/60 bg-card/35"
                        onClick={() => setCommandPaletteOpen(true)}
                        title={`Command palette (${shortcutDisplay.commandPalette})`}
                        aria-label="Open command palette"
                    >
                        <span className="text-muted-foreground font-mono">{shortcutDisplay.commandPalette}</span>
                    </button>

                    <div className="relative group inline-flex h-8 shadow-sm rounded-md">
                        <button
                            className="bg-accent text-accent-foreground hover:bg-accent/90 px-3.5 py-1.5 rounded-l-md text-xs font-semibold flex items-center gap-1.5 border-r border-accent-foreground/20 transition-colors"
                            onClick={handleNewKnowledge}
                            title={`New knowledge (${shortcutDisplay.newKnowledge})`}
                        >
                            <Plus className="w-3.5 h-3.5" /> New Knowledge
                        </button>
                        <button
                            className="bg-accent text-accent-foreground hover:bg-accent/90 px-2 rounded-r-md transition-colors"
                        >
                            <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        <div className="absolute top-full right-0 mt-1 z-[140] bg-card border border-border shadow-2xl rounded-2xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all origin-top-right" style={{ width: '340px' }}>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2.5 px-1">Knowledge Type</p>
                            <KnowledgeTypeGrid onSelect={openQuickPanel} />
                        </div>
                    </div>

                    {/* HITL notification — only visible when requests are pending */}
                    <AnimatePresence>
                    {hitlPendingCount > 0 && (
                    <motion.div
                        ref={hitlShadeRef}
                        className="relative"
                        initial={{ opacity: 0, scale: 0.6, x: 20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.6, x: 20 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 22, mass: 0.8 }}
                    >
                        <button
                            type="button"
                            onClick={() => setHitlShadeOpen(prev => !prev)}
                            className="relative p-2 rounded-lg border transition-colors border-amber-400/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                            aria-label={`${hitlPendingCount} pending HITL approvals`}
                            title={`${hitlPendingCount} pending approval${hitlPendingCount > 1 ? 's' : ''}`}
                        >
                            <ShieldAlert className="w-4 h-4" />
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                                {hitlPendingCount > 99 ? '99+' : hitlPendingCount}
                            </span>
                        </button>

                        {hitlShadeOpen && (
                            <>
                            <div className="fixed inset-0 z-[199] bg-black/40 backdrop-blur-sm" onClick={() => setHitlShadeOpen(false)} />
                            <div className="absolute top-full right-0 mt-2 z-[200] w-[380px] max-h-[70vh] flex flex-col rounded-xl shadow-2xl border border-border/60 overflow-hidden bg-card">
                                {/* Shade header */}
                                <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 flex-shrink-0">
                                    <div className="flex items-center gap-2">
                                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                                        <span className="text-sm font-semibold">Pending Approvals</span>
                                    </div>
                                    <button type="button" onClick={() => setHitlShadeOpen(false)} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                {/* Shade body */}
                                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                                    {hitlPendingRequests.length === 0 ? (
                                        <div className="flex flex-col items-center py-8 text-muted-foreground">
                                            <ShieldCheck className="w-8 h-8 mb-2 opacity-40" />
                                            <p className="text-xs">No pending requests</p>
                                        </div>
                                    ) : hitlPendingRequests.map((req) => {
                                        const isProcessing = hitlProcessing.has(req.id)
                                        let timeAgo: string
                                        try { timeAgo = formatDistanceToNow(new Date(req.created_at), { addSuffix: true }) } catch { timeAgo = '' }
                                        return (
                                            <div key={req.id} className={`rounded-xl border border-border/40 bg-muted/50 p-3 space-y-2 transition-opacity ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-mono font-semibold text-foreground truncate">{req.tool_id}</p>
                                                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{req.action_summary}</p>
                                                    </div>
                                                    <span className={`flex-shrink-0 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-md border ${
                                                        req.risk_level === 'critical' || req.risk_level === 'high' ? 'bg-red-500/15 text-red-400 border-red-500/25' :
                                                        req.risk_level === 'medium' ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25' :
                                                        'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                                                    }`}>{req.risk_level}</span>
                                                </div>

                                                {req.tool_input && Object.keys(req.tool_input).length > 0 && (
                                                    <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-muted-foreground bg-muted/20 rounded-lg p-2 border border-border/30 max-h-24 overflow-y-auto">
                                                        {JSON.stringify(req.tool_input, null, 2)}
                                                    </pre>
                                                )}

                                                <textarea
                                                    value={hitlNotes[req.id] ?? ''}
                                                    onChange={e => setHitlNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                                                    placeholder="Optional guidance..."
                                                    rows={1}
                                                    className="w-full rounded-lg border border-border/40 bg-muted/15 px-2.5 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-accent/40"
                                                />

                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {timeAgo && (
                                                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                                <Clock className="w-3 h-3" />
                                                                {timeAgo}
                                                            </span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => { setHitlShadeOpen(false); navigate(`/w/${req.workspace_id}/agent/${req.conversation_id}`) }}
                                                            className="flex items-center gap-1 text-[10px] text-accent/70 hover:text-accent transition-colors"
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                            View
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 ml-auto">
                                                        <button type="button" onClick={() => hitlDenyMutation.mutate({ id: req.id, note: hitlNotes[req.id] || undefined })} disabled={isProcessing}
                                                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50">
                                                            <X className="w-3 h-3" /> Deny
                                                        </button>
                                                        <button type="button" onClick={() => hitlApproveMutation.mutate({ id: req.id, note: hitlNotes[req.id] || undefined })} disabled={isProcessing}
                                                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                                                            <Check className="w-3 h-3" /> Approve
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                            </>
                        )}
                    </motion.div>
                    )}
                    </AnimatePresence>

                    <ModeToggle />
                </header>

                <CreateDispatcher
                    type={createDispatchType}
                    workspaceId={workspaceId}
                    isOpen={showKnowledgeCreate}
                    onClose={() => setShowKnowledgeCreate(false)}
                />

                <div className="relative z-0 flex-1 min-h-0 flex gap-3 p-3">
                    <main
                        data-openforge-main-content="1"
                        className={`relative z-20 flex-1 min-h-0 overflow-auto ${(isWorkspaceHome || isSearchPage || isSettingsPage || isAgentPage || isKnowledgePage)
                            ? ''
                            : 'rounded-2xl border border-border/60 bg-card/25'}`}
                    >
                        <Outlet />
                    </main>

                    {isWorkspaceHome && (
                        <aside
                            className="hidden xl:block flex-shrink-0 rounded-2xl border border-border/60 py-4 overflow-hidden relative z-10 bg-card/28 transition-[width] duration-200 ease-out"
                            style={{ width: isInsightsCollapsed ? '56px' : `${insightsWidth}px` }}
                        >
                            {!isInsightsCollapsed && (
                                <button
                                    type="button"
                                    onMouseDown={handleInsightsResizeStart}
                                    className="absolute -left-1 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-accent/25 active:bg-accent/35 transition-colors"
                                    aria-label="Resize insights sidebar"
                                    title="Drag to resize"
                                />
                            )}

                            {isInsightsCollapsed ? (
                                <div className="h-full flex flex-col items-center gap-3 px-2 py-2">
                                    <button
                                        type="button"
                                        onClick={toggleInsightsSidebar}
                                        className="w-8 h-8 rounded-lg border border-border/70 bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                                        aria-label="Expand workspace insights"
                                        title="Expand insights"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <div className="w-6 h-px bg-border/70" />
                                    <Brain className="w-4 h-4 text-accent mt-1" />
                                    <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-muted-foreground [writing-mode:vertical-rl] rotate-180">
                                        Insights
                                    </span>
                                    <span className="rounded-full border border-border/70 bg-muted/50 px-2 py-1 text-[10px] font-semibold text-foreground/90">
                                        {totalInsightsCount}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex h-full min-h-0 flex-col px-4">
                                    <div className="mb-4 flex items-start justify-between gap-3">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <Brain className="w-4 h-4 text-accent" />
                                                <h3 className="font-semibold text-sm tracking-tight">Workspace Insights</h3>
                                            </div>
                                            <p className="text-xs text-muted-foreground/90">Summarized intelligence from your workspace knowledge.</p>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="flex-shrink-0 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                                                {totalInsightsCount} item{totalInsightsCount === 1 ? '' : 's'}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={toggleInsightsSidebar}
                                                className="w-7 h-7 rounded-md border border-border/70 bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                                                aria-label="Collapse workspace insights"
                                                title="Collapse insights"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex min-h-0 flex-1 flex-col gap-2 pr-1">
                                        {INSIGHT_SECTION_ORDER.map(section => {
                                            const meta = INSIGHT_SECTION_META[section]
                                            const Icon = meta.icon
                                            const items = aggregatedInsights[section]
                                            const isExpanded = activeInsightSection === section

                                            return (
                                                <section
                                                    key={section}
                                                    className={`rounded-xl border px-2.5 py-2 transition-colors ${isExpanded ? 'flex min-h-0 flex-1 flex-col border-accent/35 bg-card/50' : 'flex-shrink-0 border-border/55 bg-card/22'}`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleInsightSection(section)}
                                                        className="w-full flex items-center justify-between gap-3 py-0.5 text-left"
                                                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${meta.title}`}
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                                            <div className={`w-6 h-6 rounded-md flex items-center justify-center ${meta.badgeClass}`}>
                                                                <Icon className="w-3.5 h-3.5" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-semibold text-foreground truncate">{meta.title}</div>
                                                                <div className="text-xs text-muted-foreground/90 leading-5">
                                                                    {items.length} knowledge excerpt{items.length === 1 ? '' : 's'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <span className="text-[11px] font-semibold text-foreground/70 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5">
                                                            {items.length}
                                                        </span>
                                                    </button>

                                                    {isExpanded && (
                                                        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
                                                            {items.length > 0 ? (
                                                                <ul className="space-y-1.5 pl-[1.2rem]">
                                                                    {items.map((item, i) => (
                                                                        <li key={i}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => navigate(`/w/${workspaceId}/knowledge/${item.knowledgeId}`)}
                                                                                className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                                                                            >
                                                                                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${meta.dotClass}`} />
                                                                                <span
                                                                                    className="text-[13px] leading-5 text-foreground/90 break-words"
                                                                                    dangerouslySetInnerHTML={{
                                                                                        __html: insightsMd.renderInline(item.text || meta.emptyLabel),
                                                                                    }}
                                                                                />
                                                                            </button>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <p className="px-2 text-xs text-muted-foreground">{meta.emptyLabel}</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </section>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </aside>
                    )}
                </div>
            </div>

            {/* HITL FAB rendered globally in main.tsx */}

            <ConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => { setDeleteModalOpen(false); setConversationToDelete(null) }}
                title="Delete permanently?"
                message={`"${conversationToDelete?.title || 'Untitled Chat'}" and all its messages will be permanently deleted. This cannot be undone.`}
                confirmLabel={deleteLoading ? 'Deleting…' : 'Delete Permanently'}
                variant="danger"
                icon="trash"
                loading={deleteLoading}
                onConfirm={handlePermanentDeleteConversation}
            />
        </div>
    )
}

function KnowledgeTypeIcon({ type }: { type: string }) {
    switch (type) {
        case 'bookmark': return <Bookmark className="w-3 h-3 flex-shrink-0" />
        case 'gist': return <Code2 className="w-3 h-3 flex-shrink-0" />
        case 'fleeting': return <Zap className="w-3 h-3 flex-shrink-0" />
        default: return <FileText className="w-3 h-3 flex-shrink-0" />
    }
}
