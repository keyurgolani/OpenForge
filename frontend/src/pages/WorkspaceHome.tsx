import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listNotes, createNote, deleteNote, togglePin, toggleArchive } from '@/lib/api'
import {
    Plus, Search, FileText, Bookmark, Code2, Zap, Pin, Archive,
    MoreHorizontal, Trash2, PinOff, ArchiveX, Loader2, Sparkles
} from 'lucide-react'

interface NoteListItem {
    id: string
    type: string
    title: string | null
    ai_title: string | null
    content_preview: string
    tags: string[]
    word_count: number
    is_pinned: boolean
    is_archived: boolean
    embedding_status: string
    insights_count: number | null
    updated_at: string
}

const TYPE_FILTERS = [
    { id: '', label: 'All' },
    { id: 'standard', label: 'Notes' },
    { id: 'fleeting', label: 'Fleeting' },
    { id: 'bookmark', label: 'Bookmarks' },
    { id: 'gist', label: 'Gists' },
]

export default function WorkspaceHome() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const qc = useQueryClient()
    const [typeFilter, setTypeFilter] = useState('')
    const [filterText, setFilterText] = useState('')
    const [creating, setCreating] = useState(false)
    const [openMenu, setOpenMenu] = useState<string | null>(null)

    const { data, isLoading } = useQuery({
        queryKey: ['notes', workspaceId, typeFilter],
        queryFn: () => listNotes(workspaceId, { type: typeFilter || undefined, page_size: 100 }),
        enabled: !!workspaceId,
    })

    const handleCreate = async (type: string = 'standard') => {
        setCreating(true)
        const note = await createNote(workspaceId, { type })
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        navigate(`/w/${workspaceId}/notes/${note.id}`)
        setCreating(false)
    }

    const handleDelete = async (noteId: string) => {
        await deleteNote(workspaceId, noteId)
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        setOpenMenu(null)
    }

    const handlePin = async (noteId: string) => {
        await togglePin(workspaceId, noteId)
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        setOpenMenu(null)
    }

    const handleArchive = async (noteId: string) => {
        await toggleArchive(workspaceId, noteId)
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        setOpenMenu(null)
    }

    const notes: NoteListItem[] = useMemo(() => {
        const allNotes = data?.notes ?? []
        if (!filterText) return allNotes
        const q = filterText.toLowerCase()
        return allNotes.filter((n: NoteListItem) =>
            (n.title ?? '').toLowerCase().includes(q) ||
            (n.ai_title ?? '').toLowerCase().includes(q) ||
            n.content_preview.toLowerCase().includes(q) ||
            n.tags.some(t => t.includes(q))
        )
    }, [data, filterText])

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                        className="input pl-9"
                        placeholder="Filter notes…"
                        value={filterText}
                        onChange={e => setFilterText(e.target.value)}
                    />
                </div>

                <div className="relative">
                    <button
                        className="btn-primary"
                        onClick={() => handleCreate('standard')}
                        disabled={creating}
                    >
                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        New Note
                    </button>
                </div>
            </div>

            {/* Type filter */}
            <div className="flex gap-2 mb-6 flex-wrap">
                {TYPE_FILTERS.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setTypeFilter(f.id)}
                        className={`chip cursor-pointer transition-all ${typeFilter === f.id ? 'chip-accent' : 'chip-muted'}`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="glass-card p-4 h-40 skeleton" />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!isLoading && notes.length === 0 && (
                <div className="text-center py-20">
                    <div className="text-5xl mb-4">📭</div>
                    <h3 className="text-lg font-semibold mb-2">
                        {filterText ? 'No notes match your filter' : 'No notes yet'}
                    </h3>
                    <p className="text-muted-foreground text-sm mb-6">
                        {filterText
                            ? 'Try a different search term.'
                            : 'Create your first note to get started.'}
                    </p>
                    {!filterText && (
                        <div className="flex justify-center gap-3 flex-wrap">
                            {[
                                { type: 'standard', label: '📝 Note', desc: 'Freeform markdown' },
                                { type: 'fleeting', label: '⚡ Fleeting', desc: 'Quick capture' },
                                { type: 'bookmark', label: '🔖 Bookmark', desc: 'Save a URL' },
                                { type: 'gist', label: '💻 Gist', desc: 'Code snippet' },
                            ].map(t => (
                                <button
                                    key={t.type}
                                    onClick={() => handleCreate(t.type)}
                                    className="glass-card-hover px-4 py-3 text-left cursor-pointer"
                                >
                                    <div className="font-medium text-sm mb-0.5">{t.label}</div>
                                    <div className="text-xs text-muted-foreground">{t.desc}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Note grid */}
            {!isLoading && notes.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {notes.map((note, i) => (
                        <div
                            key={note.id}
                            className="glass-card-hover p-4 cursor-pointer group relative animate-fade-in"
                            style={{ animationDelay: `${Math.min(i * 30, 200)}ms` }}
                            onClick={() => navigate(`/w/${workspaceId}/notes/${note.id}`)}
                        >
                            {/* Type + pin badge */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`type-${note.type}`}>
                                    {note.type}
                                </span>
                                {note.is_pinned && <Pin className="w-3 h-3 text-amber-400" />}
                                {note.embedding_status === 'done' && (
                                    <span className="ml-auto text-accent/50">
                                        <Sparkles className="w-3 h-3" />
                                    </span>
                                )}
                            </div>

                            {/* Title */}
                            <h3 className="font-semibold text-sm mb-1 truncate">
                                {note.title ?? note.ai_title ?? 'Untitled'}
                            </h3>

                            {/* Preview */}
                            <p className="text-xs text-muted-foreground line-clamp-3 mb-3 leading-relaxed">
                                {note.content_preview || <em>Empty note</em>}
                            </p>

                            {/* Tags */}
                            {note.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                    {note.tags.slice(0, 4).map(t => (
                                        <span key={t} className="chip-muted text-xs">{t}</span>
                                    ))}
                                    {note.tags.length > 4 && (
                                        <span className="chip-muted text-xs">+{note.tags.length - 4}</span>
                                    )}
                                </div>
                            )}

                            {/* Footer */}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{note.word_count} words</span>
                                <span>{new Date(note.updated_at).toLocaleDateString()}</span>
                            </div>

                            {/* Context menu */}
                            <button
                                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 btn-ghost p-1 transition-opacity"
                                onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === note.id ? null : note.id) }}
                            >
                                <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {openMenu === note.id && (
                                <div className="absolute top-10 right-3 z-20 glass-card border border-border shadow-xl py-1 min-w-36 animate-scale-in">
                                    <button
                                        className="flex items-center gap-2 px-3 py-2 text-xs w-full hover:bg-muted/50 transition-colors"
                                        onClick={e => { e.stopPropagation(); handlePin(note.id) }}
                                    >
                                        {note.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                                        {note.is_pinned ? 'Unpin' : 'Pin'}
                                    </button>
                                    <button
                                        className="flex items-center gap-2 px-3 py-2 text-xs w-full hover:bg-muted/50 transition-colors"
                                        onClick={e => { e.stopPropagation(); handleArchive(note.id) }}
                                    >
                                        {note.is_archived ? <ArchiveX className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                                        {note.is_archived ? 'Unarchive' : 'Archive'}
                                    </button>
                                    <button
                                        className="flex items-center gap-2 px-3 py-2 text-xs w-full hover:bg-destructive/20 text-red-400 transition-colors"
                                        onClick={e => { e.stopPropagation(); handleDelete(note.id) }}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
