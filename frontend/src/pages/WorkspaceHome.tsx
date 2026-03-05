import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listNotes, deleteNote, togglePin, toggleArchive } from '@/lib/api'
import { NoteModal } from '@/components/shared/NoteModal'
import { CopyButton } from '@/components/shared/CopyButton'
import { openQuickNote, type QuickNoteType } from '@/lib/quick-note'
import { getShortcutDisplay } from '@/lib/keyboard'
import {
    Search, FileText, Bookmark, Code2, Zap, Pin, Archive,
    Trash2, PinOff, ArchiveX, Loader2, Sparkles,
    Inbox, CheckSquare, Square, Clock, ExternalLink, Copy, SortAsc,
    ChevronDown, Tag
} from 'lucide-react'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator, ContextMenuShortcut
} from '@/components/ui/context-menu'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

/// Preview renderer: links are displayed but not clickable (prevents navigation when clicking note card)
const mdPreview = new MarkdownIt({ html: false, linkify: false, typographer: true, breaks: true })
// Disable link rendering - show as plain text instead
mdPreview.renderer.rules.link_open = () => ''
mdPreview.renderer.rules.link_close = () => ''

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
    insights?: any
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

const MASONRY_GAP_PX = 20
const NOTE_CARD_BASE_MIN_WIDTH = 400
const NOTE_CARD_MIN_WIDTH_MOBILE = 220
const NOTE_CARD_MAX_HEIGHT_PX = 350
const TAG_CHIP_GAP_PX = 6

function getResponsiveCardMinWidth(containerWidth: number): number {
    // Desktop baseline uses 400px. On narrower viewports, relax min width to prevent overflow.
    if (containerWidth < 520) return Math.max(NOTE_CARD_MIN_WIDTH_MOBILE, containerWidth - 24)
    if (containerWidth < 900) return 340
    return NOTE_CARD_BASE_MIN_WIDTH
}

export default function WorkspaceHome() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const qc = useQueryClient()

    const [filterText, setFilterText] = useState('')
    const [typeFilter, setTypeFilter] = useState('')
    const [sortBy, setSortBy] = useState('updated_at')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
    const [showTypeMenu, setShowTypeMenu] = useState(false)
    const [showSortMenu, setShowSortMenu] = useState(false)
    const [modalNoteId, setModalNoteId] = useState<string | null>(null)
    const notesLayoutRef = useRef<HTMLDivElement | null>(null)
    const [bulkBarLeft, setBulkBarLeft] = useState<number | null>(null)
    const [noteCardMinWidth, setNoteCardMinWidth] = useState(() =>
        typeof window !== 'undefined' ? getResponsiveCardMinWidth(window.innerWidth) : 400
    )
    const [masonryColumnCount, setMasonryColumnCount] = useState(1)

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

    const handleCreate = (type: QuickNoteType = 'standard') => {
        openQuickNote(type)
    }

    const handleDelete = async (noteId: string) => {
        await deleteNote(workspaceId, noteId)
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        setSelected(s => { const n = new Set(s); n.delete(noteId); return n })
    }

    const handlePin = async (noteId: string) => {
        await togglePin(workspaceId, noteId)
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
    }

    const handleArchive = async (noteId: string) => {
        await toggleArchive(workspaceId, noteId)
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
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
    const allNotes = data?.notes ?? []
    const pinnedCount = allNotes.filter((n: NoteListItem) => n.is_pinned).length
    const archivedCount = allNotes.filter((n: NoteListItem) => n.is_archived).length

    useEffect(() => {
        const node = notesLayoutRef.current
        if (!node) return

        const recalculateMasonry = () => {
            const containerWidth = node.clientWidth
            if (!containerWidth) return
            const minWidth = getResponsiveCardMinWidth(containerWidth)
            const columns = Math.max(1, Math.floor((containerWidth + MASONRY_GAP_PX) / (minWidth + MASONRY_GAP_PX)))
            setNoteCardMinWidth(minWidth)
            setMasonryColumnCount(columns)
        }

        recalculateMasonry()
        const observer = new ResizeObserver(recalculateMasonry)
        observer.observe(node)
        window.addEventListener('resize', recalculateMasonry)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', recalculateMasonry)
        }
    }, [])

    const recalculateBulkBarPosition = useCallback(() => {
        const node = notesLayoutRef.current
        if (!node) return
        const rect = node.getBoundingClientRect()
        setBulkBarLeft(Math.round(rect.left + rect.width / 2))
    }, [])

    useEffect(() => {
        const node = notesLayoutRef.current
        if (!node) return

        const sync = () => {
            window.requestAnimationFrame(recalculateBulkBarPosition)
        }

        sync()
        const observer = new ResizeObserver(sync)
        observer.observe(node)
        window.addEventListener('resize', sync)

        return () => {
            observer.disconnect()
            window.removeEventListener('resize', sync)
        }
    }, [recalculateBulkBarPosition])

    useEffect(() => {
        if (!hasSelection) return
        window.requestAnimationFrame(recalculateBulkBarPosition)
    }, [hasSelection, recalculateBulkBarPosition])

    const notesByColumn = useMemo(() => {
        const columns: Array<Array<{ note: NoteListItem; index: number }>> = Array.from(
            { length: masonryColumnCount },
            () => []
        )
        notes.forEach((note, index) => {
            columns[index % masonryColumnCount].push({ note, index })
        })
        return columns
    }, [notes, masonryColumnCount])

    return (
        <div className="w-full p-6 lg:p-7" onClick={closeAllMenus}>
            <div className="min-w-0 space-y-5">
                <section className="relative z-30 px-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="min-w-[240px] flex-1 relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <input
                                className="input h-10 pl-10"
                                placeholder="Search title, content, or tags..."
                                value={filterText}
                                onChange={e => setFilterText(e.target.value)}
                            />
                        </div>

                        <div className="relative" onClick={e => e.stopPropagation()}>
                            <button
                                className={`inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border text-sm transition-colors ${typeFilter ? 'border-accent/50 text-accent bg-accent/10' : 'border-border/70 text-muted-foreground hover:text-foreground hover:border-border'}`}
                                onClick={() => { setShowTypeMenu(p => !p); setShowSortMenu(false) }}
                            >
                                <Tag className="w-3.5 h-3.5" />
                                <span>{typeMeta?.label ?? 'All types'}</span>
                                <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            {showTypeMenu && (
                                <div className="absolute top-full right-0 mt-1 z-[180] bg-card border border-border rounded-xl shadow-2xl py-1 min-w-40 animate-scale-in">
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

                        <div className="relative" onClick={e => e.stopPropagation()}>
                            <button
                                className="inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:border-border text-sm transition-colors"
                                onClick={() => { setShowSortMenu(p => !p); setShowTypeMenu(false) }}
                            >
                                <SortAsc className="w-3.5 h-3.5" />
                                <span>{sortMeta?.label ?? 'Sort'}</span>
                                <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            {showSortMenu && (
                                <div className="absolute top-full right-0 mt-1 z-[180] bg-card border border-border rounded-xl shadow-2xl py-1 min-w-44 animate-scale-in">
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

                        {notes.length > 0 && (
                            <button
                                className="inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:border-border text-sm transition-colors"
                                onClick={hasSelection ? clearSelection : selectAll}
                            >
                                {hasSelection ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                {hasSelection ? `${selected.size} selected` : 'Select'}
                            </button>
                        )}

                        <div className="sm:ml-auto flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-foreground/90">
                                <FileText className="w-3.5 h-3.5" />
                                {allNotes.length} total
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-foreground/90">
                                <Pin className="w-3.5 h-3.5 text-amber-300" />
                                {pinnedCount} pinned
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-foreground/90">
                                <Archive className="w-3.5 h-3.5 text-blue-300" />
                                {archivedCount} archived
                            </span>
                        </div>
                    </div>
                </section>

                <div ref={notesLayoutRef} className="w-full">
                    {/* Loading skeletons */}
                    {isLoading && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                            {[...Array(10)].map((_, i) => (
                                <div key={i} className="glass-card rounded-2xl p-4 h-56 skeleton" />
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
                                            type="button"
                                            key={t.type}
                                            onClick={() => handleCreate(t.type as QuickNoteType)}
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
                        <div className="flex items-start gap-5">
                            {notesByColumn.map((column, columnIndex) => (
                                <div key={columnIndex} className="flex-1 min-w-0 space-y-5">
                                    {column.map(({ note, index }) => (
                                        <NoteCard
                                            key={note.id}
                                            note={note}
                                            index={index}
                                            minWidthPx={noteCardMinWidth}
                                            maxHeightPx={NOTE_CARD_MAX_HEIGHT_PX}
                                            isSelected={selected.has(note.id)}
                                            anySelected={hasSelection}
                                            onSelect={toggleSelect}
                                            onClick={() => setModalNoteId(note.id)}
                                            onPin={() => handlePin(note.id)}
                                            onArchive={() => handleArchive(note.id)}
                                            onDelete={() => handleDelete(note.id)}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Bulk action floating toolbar */}
                {hasSelection && (
                    <div
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-accent/30 rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-2xl shadow-black/40 animate-slide-up"
                        style={bulkBarLeft !== null ? { left: `${bulkBarLeft}px` } : undefined}
                    >
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

                {/* Note modal */}
                {modalNoteId && (
                    <NoteModal
                        noteId={modalNoteId}
                        workspaceId={workspaceId}
                        onClose={() => setModalNoteId(null)}
                    />
                )}
            </div>

        </div>
    )
}

// ── NoteCard ────────────────────────────────────────────────────────────────
function FittedTagRow({ tags }: { tags: string[] }) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const overflowMeasureRef = useRef<HTMLSpanElement | null>(null)
    const measureTagRefs = useRef<Array<HTMLSpanElement | null>>([])
    const [visibleTagCount, setVisibleTagCount] = useState(tags.length)

    const recalculate = useCallback(() => {
        if (tags.length === 0) {
            setVisibleTagCount(0)
            return
        }

        const container = containerRef.current
        const overflowMeasure = overflowMeasureRef.current
        if (!container || !overflowMeasure) return

        const containerWidth = Math.floor(container.clientWidth)
        if (containerWidth <= 0) return

        const tagWidths = tags.map((_, index) => {
            const node = measureTagRefs.current[index]
            return node ? Math.ceil(node.getBoundingClientRect().width) : 0
        })

        const widthForVisibleTags = (count: number) => {
            if (count <= 0) return 0
            let width = 0
            for (let i = 0; i < count; i += 1) width += tagWidths[i] ?? 0
            width += TAG_CHIP_GAP_PX * Math.max(0, count - 1)
            return width
        }

        let bestCount = 0
        for (let count = tags.length; count >= 0; count -= 1) {
            const remaining = tags.length - count
            let requiredWidth = widthForVisibleTags(count)

            if (remaining > 0) {
                overflowMeasure.textContent = `+${remaining}`
                const overflowWidth = Math.ceil(overflowMeasure.getBoundingClientRect().width)
                if (count > 0) requiredWidth += TAG_CHIP_GAP_PX
                requiredWidth += overflowWidth
            }

            if (requiredWidth <= containerWidth) {
                bestCount = count
                break
            }
        }

        setVisibleTagCount(prev => (prev === bestCount ? prev : bestCount))
    }, [tags])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        recalculate()
        const raf = window.requestAnimationFrame(recalculate)
        const observer = new ResizeObserver(recalculate)
        observer.observe(container)

        return () => {
            window.cancelAnimationFrame(raf)
            observer.disconnect()
        }
    }, [recalculate])

    if (tags.length === 0) return null

    const visibleTags = tags.slice(0, visibleTagCount)
    const hiddenCount = Math.max(0, tags.length - visibleTags.length)

    return (
        <div className="relative w-full">
            <div ref={containerRef} className="flex w-full items-center gap-1.5 overflow-hidden whitespace-nowrap">
                {visibleTags.map((tag, index) => (
                    <span key={`${tag}-${index}`} className="chip-accent shrink-0 text-[10px] leading-none px-2 py-1">
                        {tag}
                    </span>
                ))}
                {hiddenCount > 0 && (
                    <span className="chip-muted shrink-0 text-[10px] leading-none px-2 py-1">
                        +{hiddenCount}
                    </span>
                )}
            </div>

            <div
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 -z-10 invisible flex items-center gap-1.5 whitespace-nowrap"
            >
                {tags.map((tag, index) => (
                    <span
                        key={`measure-${tag}-${index}`}
                        ref={el => { measureTagRefs.current[index] = el }}
                        className="chip-accent shrink-0 text-[10px] leading-none px-2 py-1"
                    >
                        {tag}
                    </span>
                ))}
                <span
                    ref={overflowMeasureRef}
                    className="chip-muted shrink-0 text-[10px] leading-none px-2 py-1"
                >
                    +0
                </span>
            </div>
        </div>
    )
}

function NoteCard({
    note, index, isSelected, anySelected, onSelect, onClick,
    onPin, onArchive, onDelete, minWidthPx, maxHeightPx,
}: {
    note: NoteListItem
    index: number
    minWidthPx: number
    maxHeightPx: number
    isSelected: boolean
    anySelected: boolean
    onSelect: (id: string, e: React.MouseEvent) => void
    onClick: () => void
    onPin: () => void
    onArchive: () => void
    onDelete: () => void
}) {
    const meta = TYPE_META[note.type] ?? TYPE_META.standard
    const TypeIcon = meta.icon
    const displayTitle = note.title?.trim() || note.ai_title?.trim() || null
    const bookmarkHost = (() => {
        if (note.type !== 'bookmark' || !note.url) return null
        try { return new URL(note.url).hostname } catch { return note.url }
    })()

    const handleOpenUrl = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (note.url) window.open(note.url, '_blank', 'noopener')
    }
    const runAction = (e: React.MouseEvent, action: () => void) => {
        e.stopPropagation()
        action()
    }
    const actionBtnClass = 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-muted/35 text-foreground/85 hover:bg-muted/55 hover:border-border transition-colors'
    const selectClass = isSelected
        ? 'border-accent bg-accent text-accent-foreground'
        : anySelected
            ? 'border-accent/50 bg-accent/10 text-accent'
            : 'border-border/70 bg-background/70 text-muted-foreground hover:border-accent/50 hover:text-foreground'

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    className={`relative glass-card-hover rounded-2xl p-4 cursor-pointer group animate-fade-in flex flex-col transition-all overflow-hidden ${isSelected ? 'ring-2 ring-accent/70 border-accent/60 shadow-lg shadow-accent/10' : 'border-border/70 hover:border-accent/30'}`}
                    style={{
                        animationDelay: `${Math.min(index * 25, 200)}ms`,
                        minWidth: `${minWidthPx}px`,
                        maxHeight: `${maxHeightPx}px`,
                    }}
                    onClick={onClick}
                >
                    <button
                        className={`absolute top-0 right-0 z-20 h-8 w-8 rounded-tr-2xl rounded-bl-xl border flex items-center justify-center transition-colors ${selectClass}`}
                        onClick={e => onSelect(note.id, e)}
                        aria-label={isSelected ? 'Deselect note' : 'Select note'}
                    >
                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>

                    <div className="flex items-start justify-between gap-2 pr-8">
                        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-border/60 bg-muted/40 ${meta.color}`}>
                                <TypeIcon className="w-3 h-3" />
                                {note.type === 'fleeting' && <Clock className="w-3 h-3" />}
                                {meta.label}
                            </span>
                            {bookmarkHost && (
                                <span className="text-[10px] text-muted-foreground/95 max-w-[150px] truncate rounded-full border border-border/60 bg-muted/35 px-2 py-0.5">
                                    {bookmarkHost}
                                </span>
                            )}
                            {note.type === 'gist' && note.gist_language && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-300 border border-green-500/30">
                                    {note.gist_language}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {note.is_pinned && <Pin className="w-3.5 h-3.5 text-amber-300" />}
                            {note.embedding_status === 'done' && <Sparkles className="w-3.5 h-3.5 text-accent" />}
                        </div>
                    </div>

                    <div className="mt-2">
                        <h3 className={`font-semibold text-[15px] leading-snug line-clamp-2 ${displayTitle ? 'text-foreground' : 'text-muted-foreground/60 italic'}`}>
                            {displayTitle ?? 'Untitled'}
                        </h3>
                    </div>

                    <div className="mt-2 min-h-0 overflow-hidden">
                        {note.type === 'gist' ? (
                            <div className="text-[11px] font-mono whitespace-pre-wrap line-clamp-7 text-foreground/84">
                                {note.content_preview || note.title || ''}
                            </div>
                        ) : (
                            <div
                                className="text-[13px] text-foreground/88 line-clamp-7 leading-[1.45] prose prose-invert prose-p:my-0 prose-headings:my-0 prose-li:my-0 prose-ul:my-0 focus:outline-none max-w-none"
                                dangerouslySetInnerHTML={{ __html: mdPreview.render(note.content_preview || (note.url_title ?? '')) }}
                            />
                        )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-border/45 space-y-1.5">
                        <FittedTagRow tags={note.tags} />

                        <div className="flex items-end justify-between gap-2">
                            <p className="min-w-0 flex-1 text-[10px] text-muted-foreground/90 truncate">
                                Updated {new Date(note.updated_at).toLocaleDateString()} · {note.word_count} words · {note.insights_count ?? 0} insights
                            </p>

                            <div className="flex flex-shrink-0 items-center gap-1 self-end">
                                {note.type === 'bookmark' && note.url && (
                                    <button
                                        className={actionBtnClass}
                                        onClick={handleOpenUrl}
                                        title="Open URL"
                                        aria-label="Open bookmark URL"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                {note.type === 'gist' && (
                                    <CopyButton
                                        content={note.content_preview}
                                        label="Copy"
                                        copiedLabel="Done"
                                        iconOnly
                                        stopPropagation
                                        className={actionBtnClass}
                                    />
                                )}
                                <button
                                    className={actionBtnClass}
                                    onClick={e => runAction(e, onPin)}
                                    title={note.is_pinned ? 'Unpin note' : 'Pin note'}
                                    aria-label={note.is_pinned ? 'Unpin note' : 'Pin note'}
                                >
                                    {note.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                    className={actionBtnClass}
                                    onClick={e => runAction(e, onArchive)}
                                    title={note.is_archived ? 'Restore note' : 'Archive note'}
                                    aria-label={note.is_archived ? 'Restore note' : 'Archive note'}
                                >
                                    {note.is_archived ? <ArchiveX className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                    className={`${actionBtnClass} text-red-300 border-red-400/25 hover:bg-red-500/10`}
                                    onClick={e => runAction(e, onDelete)}
                                    title="Delete note"
                                    aria-label="Delete note"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Keep text action buttons hidden for keyboard/screen-reader fallback */}
                    <div className="sr-only">
                        <button
                            className="btn-ghost"
                            onClick={e => runAction(e, onPin)}
                        >
                            {note.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                            {note.is_pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button
                            className="btn-ghost"
                            onClick={e => runAction(e, onArchive)}
                        >
                            {note.is_archived ? <ArchiveX className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                            {note.is_archived ? 'Restore' : 'Archive'}
                        </button>
                        <button
                            className="btn-ghost"
                            onClick={e => runAction(e, onDelete)}
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                        </button>
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
                <ContextMenuItem onClick={onPin} className="gap-2">
                    {note.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    <span>{note.is_pinned ? 'Unpin Note' : 'Pin Note'}</span>
                </ContextMenuItem>
                <ContextMenuItem onClick={onArchive} className="gap-2">
                    {note.is_archived ? <ArchiveX className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    <span>{note.is_archived ? 'Unarchive' : 'Archive'}</span>
                    <ContextMenuShortcut>{getShortcutDisplay('archiveNote')}</ContextMenuShortcut>
                </ContextMenuItem>
                {note.type === 'bookmark' && note.url && (
                    <ContextMenuItem onClick={() => window.open(note.url!, '_blank')} className="gap-2">
                        <ExternalLink className="w-4 h-4" />
                        <span>Open Link</span>
                    </ContextMenuItem>
                )}
                {note.type === 'gist' && (
                    <ContextMenuItem onClick={() => navigator.clipboard.writeText(note.content_preview)} className="gap-2">
                        <Copy className="w-4 h-4" />
                        <span>Copy Code</span>
                    </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={onDelete} className="gap-2 text-red-500 focus:text-red-400 focus:bg-red-500/10">
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Note</span>
                    <ContextMenuShortcut>{getShortcutDisplay('deleteNote')}</ContextMenuShortcut>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}
