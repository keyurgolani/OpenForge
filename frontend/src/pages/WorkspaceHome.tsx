import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listNotes, createNote, deleteNote, togglePin, toggleArchive } from '@/lib/api'
import {
    Search, FileText, Bookmark, Code2, Zap, Pin, Archive,
    MoreHorizontal, Trash2, PinOff, ArchiveX, Loader2, Sparkles,
    Inbox, CheckSquare, Square, Clock, ExternalLink, Copy, SortAsc,
    ChevronDown, Tag
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
    created_at: string
    url: string | null
    url_title: string | null
    gist_language: string | null
}

const TYPE_OPTS = [
    { id: '', label: 'All types' },
    { id: 'standard', label: 'Notes', icon: FileText },
    { id: 'fleeting', label: 'Fleeting', icon: Zap },
    { id: 'bookmark', label: 'Bookmarks', icon: Bookmark },
    { id: 'gist', label: 'Gists', icon: Code2 },
]

const SORT_OPTS = [
    { id: 'updated_at', label: 'Last modified' },
    { id: 'created_at', label: 'Date created' },
    { id: 'word_count', label: 'Word count' },
]

const TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
    standard: { icon: FileText, label: 'Note', color: 'text-blue-400' },
    fleeting: { icon: Zap, label: 'Fleeting', color: 'text-yellow-400' },
    bookmark: { icon: Bookmark, label: 'Bookmark', color: 'text-purple-400' },
    gist: { icon: Code2, label: 'Gist', color: 'text-green-400' },
}

export default function WorkspaceHome() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const qc = useQueryClient()

    const [filterText, setFilterText] = useState('')
    const [typeFilter, setTypeFilter] = useState('')
    const [sortBy, setSortBy] = useState('updated_at')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
    const [showTypeMenu, setShowTypeMenu] = useState(false)
    const [showSortMenu, setShowSortMenu] = useState(false)
    const [openMenu, setOpenMenu] = useState<string | null>(null)
    const [creating, setCreating] = useState(false) // eslint-disable-line @typescript-eslint/no-unused-vars

    // Multi-select
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const hasSelection = selected.size > 0

    const { data, isLoading } = useQuery({
        queryKey: ['notes', workspaceId, typeFilter, sortBy, sortOrder],
        queryFn: () => listNotes(workspaceId, {
            type: typeFilter || undefined,
            sort_by: sortBy,
            sort_order: sortOrder,
            page_size: 200,
        }),
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
        setSelected(s => { const n = new Set(s); n.delete(noteId); return n })
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
        setSelected(s => { const n = new Set(s); n.delete(noteId); return n })
    }

    const handleBulkDelete = async () => {
        await Promise.all([...selected].map(id => deleteNote(workspaceId, id)))
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        setSelected(new Set())
    }

    const handleBulkArchive = async () => {
        await Promise.all([...selected].map(id => toggleArchive(workspaceId, id)))
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        setSelected(new Set())
    }

    const handleBulkPin = async () => {
        await Promise.all([...selected].map(id => togglePin(workspaceId, id)))
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        setSelected(new Set())
    }

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
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

    const selectAll = () => setSelected(new Set(notes.map(n => n.id)))
    const clearSelection = () => setSelected(new Set())

    const closeAllMenus = () => { setShowTypeMenu(false); setShowSortMenu(false) }

    const typeMeta = TYPE_OPTS.find(o => o.id === typeFilter)
    const sortMeta = SORT_OPTS.find(o => o.id === sortBy)

    return (
        <div className="p-6 max-w-[1800px] mx-auto" onClick={closeAllMenus}>
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-5">
                {/* Search */}
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                        className="input pl-9"
                        placeholder="Search notes…"
                        value={filterText}
                        onChange={e => setFilterText(e.target.value)}
                    />
                </div>

                {/* Type filter dropdown */}
                <div className="relative" onClick={e => e.stopPropagation()}>
                    <button
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${typeFilter ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'}`}
                        onClick={() => { setShowTypeMenu(p => !p); setShowSortMenu(false) }}
                    >
                        <Tag className="w-3.5 h-3.5" />
                        <span>{typeMeta?.label ?? 'All types'}</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {showTypeMenu && (
                        <div className="absolute top-full right-0 mt-1 z-30 bg-card border border-border rounded-xl shadow-2xl py-1 min-w-40 animate-scale-in">
                            {TYPE_OPTS.map(opt => {
                                const Icon = 'icon' in opt ? opt.icon : null
                                return (
                                    <button
                                        key={opt.id}
                                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-muted/50 transition-colors ${typeFilter === opt.id ? 'text-accent font-medium' : 'text-foreground'}`}
                                        onClick={() => { setTypeFilter(opt.id); setShowTypeMenu(false) }}
                                    >
                                        {Icon && <Icon className="w-3.5 h-3.5" />}
                                        {!Icon && <span className="w-3.5" />}
                                        {opt.label}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Sort dropdown */}
                <div className="relative" onClick={e => e.stopPropagation()}>
                    <button
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-border/80 text-sm transition-colors"
                        onClick={() => { setShowSortMenu(p => !p); setShowTypeMenu(false) }}
                    >
                        <SortAsc className="w-3.5 h-3.5" />
                        <span>{sortMeta?.label ?? 'Sort'}</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {showSortMenu && (
                        <div className="absolute top-full right-0 mt-1 z-30 bg-card border border-border rounded-xl shadow-2xl py-1 min-w-44 animate-scale-in">
                            {SORT_OPTS.map(opt => (
                                <button
                                    key={opt.id}
                                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-muted/50 transition-colors ${sortBy === opt.id ? 'text-accent font-medium' : 'text-foreground'}`}
                                    onClick={() => { setSortBy(opt.id); setShowSortMenu(false) }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                            <div className="border-t border-border/50 mt-1 pt-1">
                                <button
                                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-muted/50 text-foreground"
                                    onClick={() => { setSortOrder(o => o === 'asc' ? 'desc' : 'asc'); setShowSortMenu(false) }}
                                >
                                    {sortOrder === 'desc' ? '↓ Descending' : '↑ Ascending'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Select all */}
                {notes.length > 0 && (
                    <button
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-border/80 text-sm transition-colors"
                        onClick={hasSelection ? clearSelection : selectAll}
                    >
                        {hasSelection ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        {hasSelection ? `${selected.size} selected` : 'Select'}
                    </button>
                )}
            </div>

            {/* Loading skeletons */}
            {isLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {[...Array(10)].map((_, i) => (
                        <div key={i} className="glass-card p-4 h-44 skeleton" />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!isLoading && notes.length === 0 && (
                <div className="text-center py-20">
                    <Inbox className="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
                    <h3 className="text-lg font-semibold mb-2">
                        {filterText ? 'No notes match your search' : 'No notes yet'}
                    </h3>
                    <p className="text-muted-foreground text-sm mb-6">
                        {filterText ? 'Try a different search term.' : 'Use the + New Note button to get started.'}
                    </p>
                    {!filterText && (
                        <div className="flex justify-center gap-3 flex-wrap">
                            {[
                                { type: 'standard', Icon: FileText, label: 'Note', desc: 'Freeform markdown' },
                                { type: 'fleeting', Icon: Zap, label: 'Fleeting', desc: 'Quick capture' },
                                { type: 'bookmark', Icon: Bookmark, label: 'Bookmark', desc: 'Save a URL' },
                                { type: 'gist', Icon: Code2, label: 'Gist', desc: 'Code snippet' },
                            ].map(t => (
                                <button
                                    key={t.type}
                                    onClick={() => handleCreate(t.type)}
                                    className="glass-card-hover px-4 py-3 text-left cursor-pointer flex items-start gap-3"
                                >
                                    <t.Icon className="w-4 h-4 mt-0.5 text-accent flex-shrink-0" />
                                    <div>
                                        <div className="font-medium text-sm">{t.label}</div>
                                        <div className="text-xs text-muted-foreground">{t.desc}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Note grid */}
            {!isLoading && notes.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {notes.map((note, i) => (
                        <NoteCard
                            key={note.id}
                            note={note}
                            index={i}
                            isSelected={selected.has(note.id)}
                            anySelected={hasSelection}
                            onSelect={toggleSelect}
                            onClick={() => navigate(`/w/${workspaceId}/notes/${note.id}`)}
                            onPin={() => handlePin(note.id)}
                            onArchive={() => handleArchive(note.id)}
                            onDelete={() => handleDelete(note.id)}
                            menuOpen={openMenu === note.id}
                            onMenuToggle={() => setOpenMenu(openMenu === note.id ? null : note.id)}
                        />
                    ))}
                </div>
            )}

            {/* Bulk action floating toolbar */}
            {hasSelection && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-accent/30 rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-2xl shadow-black/40 animate-slide-up">
                    <span className="text-sm font-medium text-accent">{selected.size} selected</span>
                    <div className="w-px h-4 bg-border" />
                    <button className="btn-ghost text-xs gap-1.5 py-1.5 px-2.5" onClick={handleBulkPin}>
                        <Pin className="w-3.5 h-3.5" /> Pin
                    </button>
                    <button className="btn-ghost text-xs gap-1.5 py-1.5 px-2.5" onClick={handleBulkArchive}>
                        <Archive className="w-3.5 h-3.5" /> Archive
                    </button>
                    <button className="btn-ghost text-xs gap-1.5 py-1.5 px-2.5 text-red-400 hover:bg-destructive/10" onClick={handleBulkDelete}>
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                    <button className="btn-ghost text-xs gap-1.5 py-1.5 px-2.5" onClick={clearSelection}>
                        Clear
                    </button>
                </div>
            )}
        </div>
    )
}

// ── NoteCard ────────────────────────────────────────────────────────────────
function NoteCard({
    note, index, isSelected, anySelected, onSelect, onClick,
    onPin, onArchive, onDelete, menuOpen, onMenuToggle,
}: {
    note: NoteListItem
    index: number
    isSelected: boolean
    anySelected: boolean
    onSelect: (id: string, e: React.MouseEvent) => void
    onClick: () => void
    onPin: () => void
    onArchive: () => void
    onDelete: () => void
    menuOpen: boolean
    onMenuToggle: () => void
}) {
    const meta = TYPE_META[note.type] ?? TYPE_META.standard
    const TypeIcon = meta.icon
    const displayTitle = note.title ?? note.ai_title

    const handleCopyGist = (e: React.MouseEvent) => {
        e.stopPropagation()
        navigator.clipboard.writeText(note.content_preview)
    }

    const handleOpenUrl = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (note.url) window.open(note.url, '_blank', 'noopener')
    }

    return (
        <div
            className={`glass-card-hover p-4 cursor-pointer group relative animate-fade-in flex flex-col gap-2 transition-all ${isSelected ? 'ring-2 ring-accent border-accent/60' : ''}`}
            style={{ animationDelay: `${Math.min(index * 25, 200)}ms` }}
            onClick={onClick}
        >


            {/* Card header row: type badge only on left */}
            <div className="flex items-center gap-2 min-w-0 pr-7">
                {/* Left: type badge */}
                <span className={`flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide ${meta.color} flex-shrink-0`}>
                    <TypeIcon className="w-3 h-3" />
                    {note.type === 'fleeting' && <Clock className="w-3 h-3" />}
                    {meta.label}
                    {note.is_pinned && <Pin className="w-3 h-3 text-amber-400 ml-0.5" />}
                    {note.embedding_status === 'done' && (
                        <Sparkles className="w-3 h-3 text-accent/60 ml-0.5" />
                    )}
                </span>
            </div>

            {/* === TOP-RIGHT CONTROLS === */}
            {isSelected ? (
                /* SELECTED: filled accent circle, clicking deselects */
                <button
                    className="absolute top-2.5 right-2.5 z-20 w-6 h-6 rounded-full bg-accent border-2 border-accent shadow-md shadow-accent/30 flex items-center justify-center transition-all duration-150"
                    style={{ transform: 'scale(1.1)' }}
                    onClick={e => { e.stopPropagation(); onSelect(note.id, e) }}
                    aria-label="Deselect note"
                >
                    <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            ) : anySelected ? (
                /* SELECTION MODE (others selected, this one not): show empty circle, no 3-dots */
                <button
                    className="absolute top-2.5 right-2.5 z-20 w-6 h-6 rounded-full border-2 border-muted-foreground/30 bg-background/60 flex items-center justify-center transition-all duration-150 hover:border-accent hover:bg-accent/15"
                    onClick={e => { e.stopPropagation(); onSelect(note.id, e) }}
                    aria-label="Select note"
                />
            ) : (
                /* NORMAL: circle for select on hover at top-right; 3-dots for context menu just below */
                <>
                    {/* Select circle — appears on group hover, transparent until hovered itself */}
                    <button
                        className="absolute top-2.5 right-2.5 z-20 w-6 h-6 rounded-full border-2 border-transparent flex items-center justify-center transition-all duration-150 opacity-0 group-hover:opacity-100 group-hover:border-border/60 group-hover:bg-background/50 hover:!border-accent hover:!bg-accent/15"
                        onClick={e => { e.stopPropagation(); onSelect(note.id, e) }}
                        aria-label="Select note"
                    />
                    {/* 3-dots context menu — hidden behind circle; appears on button-level hover */}
                    <button
                        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 btn-ghost p-1 rounded-md transition-opacity"
                        onClick={e => { e.stopPropagation(); onMenuToggle() }}
                        title="More options"
                    >
                        <MoreHorizontal className="w-4 h-4" />
                    </button>
                </>
            )}

            {/* URL bar for bookmarks */}
            {note.type === 'bookmark' && note.url && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1 truncate">
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{(() => { try { return new URL(note.url).hostname } catch { return note.url } })()}</span>
                </div>
            )}

            {/* Language badge for gists */}
            {note.type === 'gist' && note.gist_language && (
                <span className="self-start text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                    {note.gist_language}
                </span>
            )}

            {/* Title */}
            <h3 className={`font-semibold text-sm leading-snug ${displayTitle ? 'text-foreground' : 'text-muted-foreground/50 italic'}`}>
                {displayTitle ?? 'Untitled'}
            </h3>

            {/* Preview */}
            <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed flex-1">
                {note.content_preview || (note.url_title ?? '')}
            </p>

            {/* Tags */}
            {note.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {note.tags.slice(0, 3).map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent/80">
                            {t}
                        </span>
                    ))}
                    {note.tags.length > 3 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
                            +{note.tags.length - 3}
                        </span>
                    )}
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-auto pt-1 border-t border-border/30">
                <span>{note.word_count} words</span>
                <span>{new Date(note.updated_at).toLocaleDateString()}</span>
            </div>

            {/* Per-type quick CTAs */}
            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {note.type === 'bookmark' && note.url && (
                    <button
                        className="btn-ghost text-[10px] py-1 px-2 gap-1 flex-1 justify-center border border-border/50"
                        onClick={handleOpenUrl}
                    >
                        <ExternalLink className="w-3 h-3" /> Open URL
                    </button>
                )}
                {note.type === 'gist' && (
                    <button
                        className="btn-ghost text-[10px] py-1 px-2 gap-1 flex-1 justify-center border border-border/50"
                        onClick={handleCopyGist}
                    >
                        <Copy className="w-3 h-3" /> Copy
                    </button>
                )}
            </div>

            {/* Context menu — solid background, always visible */}
            {menuOpen && (
                <div
                    className="absolute top-9 right-3 z-20 bg-card border border-border shadow-2xl shadow-black/40 rounded-xl py-1 min-w-36 animate-scale-in"
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        className="flex items-center gap-2 px-3 py-2 text-xs w-full text-foreground hover:bg-muted/50 transition-colors"
                        onClick={e => { e.stopPropagation(); onPin() }}
                    >
                        {note.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                        {note.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                        className="flex items-center gap-2 px-3 py-2 text-xs w-full text-foreground hover:bg-muted/50 transition-colors"
                        onClick={e => { e.stopPropagation(); onArchive() }}
                    >
                        {note.is_archived ? <ArchiveX className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                        {note.is_archived ? 'Unarchive' : 'Archive'}
                    </button>
                    <button
                        className="flex items-center gap-2 px-3 py-2 text-xs w-full hover:bg-destructive/20 text-red-400 transition-colors"
                        onClick={e => { e.stopPropagation(); onDelete() }}
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                </div>
            )}
        </div>
    )
}
