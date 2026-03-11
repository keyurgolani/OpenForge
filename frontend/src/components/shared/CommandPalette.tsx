import { useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Command } from 'cmdk'
import { listWorkspaces, listKnowledge } from '@/lib/api'
import { useUIStore } from '@/stores/uiStore'
import { isModKey, getShortcutDisplay } from '@/lib/keyboard'
import { openQuickKnowledge, type QuickKnowledgeType } from '@/lib/quick-knowledge'
import {
    Search, FileText, MessageSquare, Settings, Plus, Bookmark,
    Code2, Zap, Home, ArrowRight, FolderOpen
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getWorkspaceIcon } from '@/pages/SettingsPage'

const GROUP_CLASS =
    "[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-muted-foreground/80 [&_[cmdk-group-heading]]:font-semibold"

export default function CommandPalette() {
    const navigate = useNavigate()
    const { workspaceId = '' } = useParams<{ workspaceId?: string }>()
    const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore()

    const { data: workspaces = [] } = useQuery({
        queryKey: ['workspaces'],
        queryFn: listWorkspaces,
        enabled: commandPaletteOpen,
    })

    const { data: knowledgeData } = useQuery({
        queryKey: ['knowledge', workspaceId, 'palette'],
        queryFn: () => listKnowledge(workspaceId, { page_size: 50 }),
        enabled: commandPaletteOpen && !!workspaceId,
    })

    const knowledgeItems = knowledgeData?.knowledge ?? []

    // Cmd+K / Ctrl+K to open
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (isModKey(e) && e.key === 'k') {
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

    const handleCreateKnowledge = (type: QuickKnowledgeType = 'note') => {
        if (!workspaceId) return
        openQuickKnowledge(type)
        close()
    }

    if (!commandPaletteOpen) return null

    return (
        <AnimatePresence>
            <div
                className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[16vh] pb-6"
                onClick={close}
            >
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-md"
                />

                {/* Panel */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 10 }}
                    transition={{
                        type: 'spring',
                        damping: 25,
                        stiffness: 400,
                        mass: 0.8
                    }}
                    className="relative w-full max-w-xl glass-card border border-white/10 shadow-glass-lg overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Inner Glow Line */}
                    <div className="absolute inset-0 border border-white/5 rounded-[inherit] pointer-events-none mix-blend-overlay" />
                    <Command className="[&_[cmdk-root]]:bg-transparent" label="Command palette">
                        <div className="flex items-center gap-3.5 px-5 py-4 border-b border-border/55">
                            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <Command.Input
                                className="flex-1 bg-transparent text-sm outline-none placeholder-muted-foreground"
                                placeholder="Type a command or search knowledge…"
                                autoFocus
                            />
                            <kbd className="text-xs text-muted-foreground border border-border/80 rounded-md px-2 py-1 font-mono">ESC</kbd>
                        </div>

                        <Command.List className="max-h-[min(56vh,30rem)] overflow-y-auto py-3">
                            <Command.Empty className="flex flex-col items-center py-10 text-muted-foreground text-sm gap-2.5">
                                <Search className="w-8 h-8 opacity-30" />
                                No results found.
                            </Command.Empty>

                            {/* Actions */}
                            <Command.Group heading="Actions" className={GROUP_CLASS}>
                                {workspaceId && (
                                    <>
                                        <PaletteItem icon={<Plus className="w-4 h-4" />} onSelect={() => handleCreateKnowledge('note')}>New Knowledge</PaletteItem>
                                        <PaletteItem icon={<Zap className="w-4 h-4" />} onSelect={() => handleCreateKnowledge('fleeting')}>New Fleeting Note</PaletteItem>
                                        <PaletteItem icon={<Bookmark className="w-4 h-4" />} onSelect={() => handleCreateKnowledge('bookmark')}>New Bookmark</PaletteItem>
                                        <PaletteItem icon={<Code2 className="w-4 h-4" />} onSelect={() => handleCreateKnowledge('gist')}>New Code Gist</PaletteItem>
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
                                            onSelect={() => run(() => navigate(`/settings`))}
                                        >Go to Settings</PaletteItem>
                                    </>
                                )}
                            </Command.Group>

                            {/* Workspace navigation */}
                            {(workspaces as { id: string; name: string; icon: string }[]).length > 1 && (
                                <Command.Group heading="Workspaces" className={`mt-2 pt-2 border-t border-border/40 ${GROUP_CLASS}`}>
                                    {(workspaces as { id: string; name: string; icon: string }[]).map(ws => (
                                        <PaletteItem
                                            key={ws.id}
                                            icon={<span className="flex items-center justify-center">{getWorkspaceIcon(ws.icon)}</span>}
                                            onSelect={() => run(() => navigate(`/w/${ws.id}`))}
                                        >
                                            {ws.name}
                                        </PaletteItem>
                                    ))}
                                </Command.Group>
                            )}

                            {/* Knowledge search */}
                            {knowledgeItems.length > 0 && (
                                <Command.Group heading="Knowledge" className={`mt-2 pt-2 border-t border-border/40 ${GROUP_CLASS}`}>
                                    {(knowledgeItems as { id: string; title: string; ai_title: string; type: string }[]).map(n => (
                                        <PaletteItem
                                            key={n.id}
                                            icon={<FileText className="w-4 h-4" />}
                                            onSelect={() => run(() => navigate(`/w/${workspaceId}/knowledge/${n.id}`))}
                                            hint={n.type}
                                        >
                                            {n.title || n.ai_title || 'Untitled'}
                                        </PaletteItem>
                                    ))}
                                </Command.Group>
                            )}
                        </Command.List>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-t border-border/55 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5"><kbd className="border border-border/80 rounded px-1.5 py-0.5 font-mono">↑↓</kbd> navigate</span>
                            <span className="flex items-center gap-1.5"><kbd className="border border-border/80 rounded px-1.5 py-0.5 font-mono">↵</kbd> select</span>
                            <span className="flex items-center gap-1.5"><kbd className="border border-border/80 rounded px-1.5 py-0.5 font-mono">ESC</kbd> close</span>
                            <span className="flex items-center gap-1.5 sm:ml-auto"><kbd className="border border-border/80 rounded px-1.5 py-0.5 font-mono">{getShortcutDisplay('commandPalette')}</kbd> toggle</span>
                        </div>
                    </Command>
                </motion.div>
            </div>
        </AnimatePresence>
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
            className="mx-2 flex items-center gap-3.5 rounded-lg px-3.5 py-2.5 text-sm cursor-pointer data-[selected=true]:bg-muted/60 transition-colors group"
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
