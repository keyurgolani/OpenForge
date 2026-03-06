import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Outlet, useNavigate, useParams, Link, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listWorkspaces, listKnowledge, listConversations } from '@/lib/api'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { useUIStore } from '@/stores/uiStore'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { getShortcutDisplay } from '@/lib/keyboard'
import { onQuickNoteOpen, type QuickNoteType } from '@/lib/quick-note'
import CommandPalette from '@/components/shared/CommandPalette'
import { QuickNotePanel } from '@/components/shared/QuickNotePanel'
import MarkdownIt from 'markdown-it'
import {
    Home, MessageSquare, Search, Settings, Plus, Folder,
    FileText, Pin, Archive, Bookmark, Code2, Zap, WifiOff,
    PanelLeft, ChevronDown, ChevronLeft, ChevronRight, Brain, CheckSquare, Calendar, Star
} from 'lucide-react'
import { getWorkspaceIcon } from '@/pages/SettingsPage'

const MIN_INSIGHTS_WIDTH = 280
const MAX_INSIGHTS_WIDTH = 560
const DEFAULT_INSIGHTS_WIDTH = 320
const INSIGHTS_WIDTH_STORAGE_KEY = 'openforge.shell.insights.width'
const INSIGHTS_COLLAPSED_STORAGE_KEY = 'openforge.shell.insights.collapsed'
type InsightSectionKey = 'tasks' | 'timelines' | 'facts' | 'crucial_things'
type InsightItem = { noteId: string, text: string }
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

export default function AppShell() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const location = useLocation()
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [showQuickNote, setShowQuickNote] = useState(false)
    const [defaultNoteType, setDefaultNoteType] = useState<'standard' | 'fleeting' | 'bookmark' | 'gist'>('standard')
    const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
    const [workspaceQuery, setWorkspaceQuery] = useState('')
    const [activeInsightSection, setActiveInsightSection] = useState<InsightSectionKey | null>('tasks')
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

    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const { data: notesData } = useQuery({
        queryKey: ['notes', workspaceId],
        queryFn: () => listKnowledge(workspaceId, { page_size: 200 }),
        enabled: !!workspaceId,
    })
    const { data: conversations = [] } = useQuery({
        queryKey: ['conversations', workspaceId],
        queryFn: () => listConversations(workspaceId),
        enabled: !!workspaceId,
    })

    const ws = (workspaces as { id: string; name: string; icon: string; color: string }[])
        .find(w => w.id === workspaceId)
    const workspaceList = workspaces as { id: string; name: string; icon: string; color: string }[]
    const workspaceMenuRef = useRef<HTMLDivElement | null>(null)
    const notes = notesData?.knowledge ?? notesData?.notes ?? []
    const pinnedNotes = notes.filter((n: { is_pinned: boolean }) => n.is_pinned)
    const isWorkspaceHome = location.pathname === `/w/${workspaceId}`
    const isSearchPage = location.pathname.includes('/search')
    const isSettingsPage = location.pathname.includes('/settings')
    const isChatPage = location.pathname.includes('/chat')
    const isNotePage = location.pathname.includes('/notes/') || location.pathname.includes('/knowledge/')
    const currentSectionMeta = useMemo(() => {
        if (location.pathname.includes('/chat')) {
            return {
                title: 'Workspace Chat',
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
        if (location.pathname.includes('/notes/') || location.pathname.includes('/knowledge/')) {
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
        notes.forEach((n: { id: string, insights?: any }) => {
            if (!n.insights) return
            if (n.insights.tasks) n.insights.tasks.forEach((t: string) => ag.tasks.push({ noteId: n.id, text: t }))
            if (n.insights.timelines) {
                n.insights.timelines.forEach((t: any) => {
                    if (typeof t === 'string') {
                        ag.timelines.push({ noteId: n.id, text: t })
                        return
                    }
                    const date = typeof t?.date === 'string' ? t.date.trim() : ''
                    const event = typeof t?.event === 'string' ? t.event.trim() : ''
                    if (date && event) ag.timelines.push({ noteId: n.id, text: `**${date}**: ${event}` })
                    else if (date) ag.timelines.push({ noteId: n.id, text: `**${date}**` })
                    else if (event) ag.timelines.push({ noteId: n.id, text: event })
                })
            }
            if (n.insights.facts) n.insights.facts.forEach((t: string) => ag.facts.push({ noteId: n.id, text: t }))
            if (n.insights.crucial_things) n.insights.crucial_things.forEach((t: string) => ag.crucial_things.push({ noteId: n.id, text: t }))
        })
        return ag
    }, [notes])

    const totalInsightsCount = useMemo(
        () => INSIGHT_SECTION_ORDER.reduce((count, section) => count + aggregatedInsights[section].length, 0),
        [aggregatedInsights]
    )

    // Keyboard shortcuts
    const openQuickPanel = useCallback((type: QuickNoteType = 'standard') => {
        setDefaultNoteType(type)
        setShowQuickNote(true)
    }, [])

    const handleNewNote = useCallback(() => {
        openQuickPanel('fleeting')
    }, [openQuickPanel])

    useKeyboardShortcut('b', true, () => setSidebarOpen(p => !p), { ignoreInputs: false })
    useKeyboardShortcut('n', true, handleNewNote)

    const shortcutDisplay = useMemo(() => ({
        commandPalette: getShortcutDisplay('commandPalette'),
        toggleSidebar: getShortcutDisplay('toggleSidebar'),
        newNote: getShortcutDisplay('newNote'),
    }), [])

    useEffect(() => onQuickNoteOpen(openQuickPanel), [openQuickPanel])
    useEffect(() => {
        return on('note_updated', (msg: Record<string, unknown>) => {
            const updatedNoteId = typeof msg.note_id === 'string' ? msg.note_id : null
            qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
            if (updatedNoteId) {
                qc.invalidateQueries({ queryKey: ['note', updatedNoteId] })
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
    }, [workspaceId])

    const toggleInsightSection = useCallback((section: InsightSectionKey) => {
        setActiveInsightSection(prev => (prev === section ? null : section))
    }, [])

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
            <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} flex-shrink-0 transition-[width] duration-300 overflow-hidden flex flex-col glass-card`}>
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
                                                        navigate(`/w/${workspace.id}`)
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
                                            navigate(`/w/${workspaceId}/settings?tab=workspaces&newWorkspace=1`)
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
                            <Link to={`/w/${workspaceId}/chat`} className={`sidebar-item ${isActive('/chat') ? 'active' : ''}`}>
                                <MessageSquare className="w-4 h-4" /> Chat
                            </Link>
                            <Link to={`/w/${workspaceId}/settings`} className={`sidebar-item ${isActive('/settings') ? 'active' : ''}`}>
                                <Settings className="w-4 h-4" /> Settings
                            </Link>
                        </nav>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
                    {/* Pinned notes */}
                    {pinnedNotes.length > 0 && (
                        <div>
                            <div className="flex items-center gap-1 px-2 mb-1">
                                <Pin className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Pinned</span>
                            </div>
                            {pinnedNotes.slice(0, 5).map((n: { id: string; title: string; ai_title: string; type: string }) => (
                                <Link
                                    key={n.id}
                                    to={`/w/${workspaceId}/knowledge/${n.id}`}
                                    className={`sidebar-item text-xs ${(isActive(`/knowledge/${n.id}`) || isActive(`/notes/${n.id}`)) ? 'active' : ''}`}
                                >
                                    <NoteTypeIcon type={n.type} />
                                    <span className="truncate">{n.title || n.ai_title || 'Untitled'}</span>
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Recent conversations */}
                    {(conversations as { id: string; title: string }[]).length > 0 && (
                        <div>
                            <div className="flex items-center gap-1 px-2 mb-1">
                                <MessageSquare className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Recent Chats</span>
                            </div>
                            {(conversations as { id: string; title: string }[]).slice(0, 5).map(c => (
                                <Link key={c.id} to={`/w/${workspaceId}/chat/${c.id}`} className={`sidebar-item text-xs ${isActive(`/chat/${c.id}`) ? 'active' : ''}`}>
                                    <MessageSquare className="w-3 h-3" />
                                    <span className="truncate">{c.title ?? 'New Chat'}</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
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

                    {(!sidebarOpen && ws) && (
                        <div className="min-w-0 max-w-[min(34vw,260px)] flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/55 px-3 py-1.5">
                            <div className="w-6 h-6 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                                {getWorkspaceIcon(ws.icon)}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold leading-tight truncate">{ws.name}</p>
                                <p className="text-[11px] text-muted-foreground/90 leading-tight">Workspace</p>
                            </div>
                        </div>
                    )}

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
                            onClick={handleNewNote}
                            title={`New note (${shortcutDisplay.newNote})`}
                        >
                            <Plus className="w-3.5 h-3.5" /> New Knowledge
                        </button>
                        <button
                            className="bg-accent text-accent-foreground hover:bg-accent/90 px-2 rounded-r-md transition-colors"
                        >
                            <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        <div className="absolute top-full right-0 mt-1 z-[140] bg-card border border-border shadow-2xl rounded-xl py-1 min-w-40 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all origin-top-right">
                            <button
                                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors text-foreground focus:outline-none"
                                onClick={() => openQuickPanel('standard')}
                            >
                                <FileText className="w-3.5 h-3.5" /> Note
                            </button>
                            <button
                                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors text-foreground focus:outline-none"
                                onClick={() => openQuickPanel('fleeting')}
                            >
                                <Zap className="w-3.5 h-3.5 text-yellow-500" /> Fleeting Note
                            </button>
                            <button
                                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors text-foreground focus:outline-none"
                                onClick={() => openQuickPanel('bookmark')}
                            >
                                <Bookmark className="w-3.5 h-3.5 text-purple-500" /> Bookmark
                            </button>
                            <button
                                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted/50 transition-colors text-foreground focus:outline-none"
                                onClick={() => openQuickPanel('gist')}
                            >
                                <Code2 className="w-3.5 h-3.5 text-green-500" /> Gist
                            </button>
                        </div>
                    </div>
                </header>

                <QuickNotePanel
                    open={showQuickNote}
                    defaultType={defaultNoteType}
                    onClose={() => setShowQuickNote(false)}
                />

                <div className="relative z-0 flex-1 min-h-0 flex gap-3 p-3">
                    <main
                        data-openforge-main-content="1"
                        className={`relative z-20 flex-1 min-h-0 overflow-auto ${(isWorkspaceHome || isSearchPage || isSettingsPage || isChatPage || isNotePage)
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
                                                                    {items.length} note excerpt{items.length === 1 ? '' : 's'}
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
                                                                                onClick={() => navigate(`/w/${workspaceId}/knowledge/${item.noteId}`)}
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
        </div>
    )
}

function NoteTypeIcon({ type }: { type: string }) {
    switch (type) {
        case 'bookmark': return <Bookmark className="w-3 h-3 flex-shrink-0" />
        case 'gist': return <Code2 className="w-3 h-3 flex-shrink-0" />
        case 'fleeting': return <Zap className="w-3 h-3 flex-shrink-0" />
        default: return <FileText className="w-3 h-3 flex-shrink-0" />
    }
}
