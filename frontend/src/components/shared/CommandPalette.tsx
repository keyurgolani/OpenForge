import { useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Command } from 'cmdk'
import { listWorkspaces, listNotes, createNote } from '@/lib/api'
import { useUIStore } from '@/stores/uiStore'
import {
    Search, FileText, MessageSquare, Settings, Plus, Bookmark,
    Code2, Zap, Home, ArrowRight
} from 'lucide-react'

export default function CommandPalette() {
    const navigate = useNavigate()
    const { workspaceId = '' } = useParams<{ workspaceId?: string }>()
    const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore()

    const { data: workspaces = [] } = useQuery({
        queryKey: ['workspaces'],
        queryFn: listWorkspaces,
        enabled: commandPaletteOpen,
    })

    const { data: notesData } = useQuery({
        queryKey: ['notes', workspaceId, 'palette'],
        queryFn: () => listNotes(workspaceId, { page_size: 50 }),
        enabled: commandPaletteOpen && !!workspaceId,
    })

    const notes = notesData?.notes ?? []

    // Cmd+K / Ctrl+K to open
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                setCommandPaletteOpen(true)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [setCommandPaletteOpen])

    const close = useCallback(() => setCommandPaletteOpen(false), [setCommandPaletteOpen])

    const run = useCallback((fn: () => void) => {
        fn()
        close()
    }, [close])

    const handleCreateNote = async (type = 'standard') => {
        if (!workspaceId) return
        const note = await createNote(workspaceId, { type })
        navigate(`/w/${workspaceId}/notes/${note.id}`)
        close()
    }

    if (!commandPaletteOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
            onClick={close}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Panel */}
            <div
                className="relative w-full max-w-xl mx-4 glass-card border border-border/80 shadow-2xl overflow-hidden animate-scale-in"
                onClick={e => e.stopPropagation()}
            >
                <Command className="[&_[cmdk-root]]:bg-transparent" label="Command palette">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
                        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <Command.Input
                            className="flex-1 bg-transparent text-sm outline-none placeholder-muted-foreground"
                            placeholder="Type a command or search notes…"
                            autoFocus
                        />
                        <kbd className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono">ESC</kbd>
                    </div>

                    <Command.List className="max-h-80 overflow-y-auto py-2">
                        <Command.Empty className="flex flex-col items-center py-8 text-muted-foreground text-sm gap-2">
                            <Search className="w-8 h-8 opacity-30" />
                            No results found.
                        </Command.Empty>

                        {/* Actions */}
                        <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:font-medium">
                            {workspaceId && (
                                <>
                                    <PaletteItem icon={<Plus className="w-4 h-4" />} onSelect={() => handleCreateNote('standard')}>New Note</PaletteItem>
                                    <PaletteItem icon={<Zap className="w-4 h-4" />} onSelect={() => handleCreateNote('fleeting')}>New Fleeting Note</PaletteItem>
                                    <PaletteItem icon={<Bookmark className="w-4 h-4" />} onSelect={() => handleCreateNote('bookmark')}>New Bookmark</PaletteItem>
                                    <PaletteItem icon={<Code2 className="w-4 h-4" />} onSelect={() => handleCreateNote('gist')}>New Code Gist</PaletteItem>
                                    <PaletteItem
                                        icon={<MessageSquare className="w-4 h-4" />}
                                        onSelect={() => run(() => navigate(`/w/${workspaceId}/chat`))}
                                    >Go to Chat</PaletteItem>
                                    <PaletteItem
                                        icon={<Search className="w-4 h-4" />}
                                        onSelect={() => run(() => navigate(`/w/${workspaceId}/search`))}
                                    >Go to Search</PaletteItem>
                                    <PaletteItem
                                        icon={<Settings className="w-4 h-4" />}
                                        onSelect={() => run(() => navigate(`/w/${workspaceId}/settings`))}
                                    >Go to Settings</PaletteItem>
                                </>
                            )}
                        </Command.Group>

                        {/* Workspace navigation */}
                        {(workspaces as { id: string; name: string; icon: string }[]).length > 1 && (
                            <Command.Group heading="Workspaces">
                                {(workspaces as { id: string; name: string; icon: string }[]).map(ws => (
                                    <PaletteItem
                                        key={ws.id}
                                        icon={<span className="text-base">{ws.icon ?? '📁'}</span>}
                                        onSelect={() => run(() => navigate(`/w/${ws.id}`))}
                                    >
                                        {ws.name}
                                    </PaletteItem>
                                ))}
                            </Command.Group>
                        )}

                        {/* Note search */}
                        {notes.length > 0 && (
                            <Command.Group heading="Notes">
                                {(notes as { id: string; title: string; ai_title: string; type: string }[]).map(n => (
                                    <PaletteItem
                                        key={n.id}
                                        icon={<FileText className="w-4 h-4" />}
                                        onSelect={() => run(() => navigate(`/w/${workspaceId}/notes/${n.id}`))}
                                        hint={n.type}
                                    >
                                        {n.title || n.ai_title || 'Untitled'}
                                    </PaletteItem>
                                ))}
                            </Command.Group>
                        )}
                    </Command.List>

                    <div className="flex items-center gap-4 px-3 py-2 border-t border-border/50 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><kbd className="border border-border rounded px-1 py-0.5 font-mono">↑↓</kbd> navigate</span>
                        <span className="flex items-center gap-1"><kbd className="border border-border rounded px-1 py-0.5 font-mono">↵</kbd> select</span>
                        <span className="flex items-center gap-1"><kbd className="border border-border rounded px-1 py-0.5 font-mono">ESC</kbd> close</span>
                    </div>
                </Command>
            </div>
        </div>
    )
}

function PaletteItem({
    children,
    icon,
    onSelect,
    hint,
}: {
    children: React.ReactNode
    icon: React.ReactNode
    onSelect: () => void
    hint?: string
}) {
    return (
        <Command.Item
            onSelect={onSelect}
            className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer rounded-md mx-1 data-[selected=true]:bg-muted/60 transition-colors group"
        >
            <span className="text-muted-foreground group-data-[selected=true]:text-foreground transition-colors">
                {icon}
            </span>
            <span className="flex-1">{children}</span>
            {hint && <span className="chip-muted text-xs capitalize">{hint}</span>}
            <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100 transition-opacity" />
        </Command.Item>
    )
}
