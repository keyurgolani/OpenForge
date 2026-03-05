import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useParams, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listWorkspaces, listNotes, listConversations } from '@/lib/api'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { useUIStore } from '@/stores/uiStore'
import CommandPalette from '@/components/shared/CommandPalette'
import { QuickNotePanel } from '@/components/shared/QuickNotePanel'
import {
    Home, MessageSquare, Search, Settings, Plus, Folder,
    FileText, Pin, Archive, Bookmark, Code2, Zap, WifiOff,
    PanelLeft, Command
} from 'lucide-react'

export default function AppShell() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const location = useLocation()
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [showQuickNote, setShowQuickNote] = useState(false)
    const { isConnected } = useWorkspaceWebSocket(workspaceId)
    const { setCommandPaletteOpen } = useUIStore()

    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const { data: notesData } = useQuery({
        queryKey: ['notes', workspaceId],
        queryFn: () => listNotes(workspaceId, { page_size: 200 }),
        enabled: !!workspaceId,
    })
    const { data: conversations = [] } = useQuery({
        queryKey: ['conversations', workspaceId],
        queryFn: () => listConversations(workspaceId),
        enabled: !!workspaceId,
    })

    const ws = (workspaces as { id: string; name: string; icon: string; color: string }[])
        .find(w => w.id === workspaceId)
    const notes = notesData?.notes ?? []
    const pinnedNotes = notes.filter((n: { is_pinned: boolean }) => n.is_pinned)

    const isActive = (path: string) => location.pathname.includes(path)

    return (
        <div className="flex h-screen overflow-hidden relative">
            <CommandPalette />
            {/* Sidebar */}
            <aside className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 transition-all duration-200 overflow-hidden flex flex-col border-r border-border/50 bg-card/30 backdrop-blur-sm`}>
                <div className="flex-shrink-0 p-4">
                    {/* Workspace selector */}
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                            {ws?.icon ? <span className="text-lg">{ws.icon}</span> : <Folder className="w-4 h-4 text-accent" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{ws?.name ?? 'Workspace'}</p>
                            <p className="text-xs text-muted-foreground">{(workspaces as unknown[]).length} workspace{(workspaces as unknown[]).length !== 1 ? 's' : ''}</p>
                        </div>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} title={isConnected ? 'Connected' : 'Reconnecting…'} />
                    </div>

                    {/* Workspace list */}
                    <select
                        className="input text-xs py-1.5 mb-4"
                        value={workspaceId}
                        onChange={e => navigate(`/w/${e.target.value}`)}
                    >
                        {(workspaces as { id: string; name: string; icon: string }[]).map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                    </select>

                    {/* Nav */}
                    <nav className="space-y-0.5">
                        <Link to={`/w/${workspaceId}`} className={`sidebar-item ${location.pathname === `/w/${workspaceId}` ? 'active' : ''}`}>
                            <Home className="w-4 h-4" /> Notes
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

                <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
                    {/* Pinned notes */}
                    {pinnedNotes.length > 0 && (
                        <div>
                            <div className="flex items-center gap-1 px-2 mb-1">
                                <Pin className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Pinned</span>
                            </div>
                            {pinnedNotes.slice(0, 5).map((n: { id: string; title: string; ai_title: string; type: string }) => (
                                <Link key={n.id} to={`/w/${workspaceId}/notes/${n.id}`} className={`sidebar-item text-xs ${isActive(`/notes/${n.id}`) ? 'active' : ''}`}>
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
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <header className="flex items-center gap-3 px-4 py-3 border-b border-border/50 flex-shrink-0">
                    <button
                        className="btn-ghost p-2 -ml-1"
                        onClick={() => setSidebarOpen(p => !p)}
                        aria-label="Toggle sidebar"
                    >
                        <PanelLeft className="w-4 h-4" />
                    </button>

                    <div className="flex-1" />

                    {!isConnected && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-400 glass-card px-3 py-1.5 animate-pulse">
                            <WifiOff className="w-3 h-3" /> Reconnecting…
                        </div>
                    )}

                    <button
                        className="btn-ghost p-2 text-xs gap-1.5 hidden sm:flex items-center"
                        onClick={() => setCommandPaletteOpen(true)}
                        title="Command palette (Cmd+K)"
                        aria-label="Open command palette"
                    >
                        <Command className="w-3.5 h-3.5" />
                        <span className="text-muted-foreground">K</span>
                    </button>

                    <button
                        className="btn-primary py-1.5 px-3 text-xs"
                        onClick={() => setShowQuickNote(p => !p)}
                    >
                        <Plus className="w-3.5 h-3.5" /> New Note
                    </button>
                </header>

                <QuickNotePanel
                    open={showQuickNote}
                    onClose={() => setShowQuickNote(false)}
                />

                <main className="flex-1 overflow-auto">
                    <Outlet />
                </main>
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
