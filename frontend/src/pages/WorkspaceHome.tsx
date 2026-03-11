import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listKnowledge, deleteKnowledge, togglePin, toggleArchive, extractBookmarkContent, reprocessKnowledge, getKnowledgeFileUrl } from '@/lib/api'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { CopyButton } from '@/components/shared/CopyButton'
import { openQuickKnowledge, type QuickKnowledgeType, FILE_BASED_TYPES } from '@/lib/quick-knowledge'
import KnowledgeTypeGrid from '@/components/knowledge/KnowledgeTypeGrid'
import PreviewDispatcher from '@/components/knowledge/preview/PreviewDispatcher'
import { KnowledgeCard as KnowledgeCardContent, isKnowledgeProcessing } from '@/components/knowledge/cards/KnowledgeCard'
import { getShortcutDisplay } from '@/lib/keyboard'
import {
    Search, FileText, Bookmark, Code2, Zap, Pin, Archive,
    Trash2, PinOff, ArchiveX, Loader2, Sparkles,
    Inbox, CheckSquare, Square, ExternalLink, Copy, SortAsc,
    ChevronDown, Tag, RefreshCw, Download,
    Image as ImageIcon, Music, FileType2, Table, Presentation,
} from 'lucide-react'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator, ContextMenuShortcut
} from '@/components/ui/context-menu'

interface KnowledgeListItem {
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
    file_path: string | null
    file_size: number | null
    mime_type: string | null
    thumbnail_path: string | null
    file_metadata: Record<string, unknown> | null
}

const TYPE_OPTS = [
    { id: '', label: 'All types' },
    { id: 'note', label: 'Note', icon: FileText },
    { id: 'fleeting', label: 'Fleeting', icon: Zap },
    { id: 'bookmark', label: 'Bookmarks', icon: Bookmark },
    { id: 'gist', label: 'Gists', icon: Code2 },
    { id: 'image', label: 'Images', icon: ImageIcon },
    { id: 'audio', label: 'Audio', icon: Music },
    { id: 'pdf', label: 'PDFs', icon: FileType2 },
    { id: 'document', label: 'Documents', icon: FileText },
    { id: 'sheet', label: 'Sheets', icon: Table },
    { id: 'slides', label: 'Slides', icon: Presentation },
]

const SORT_OPTS = [
    { id: 'updated_at', label: 'Last modified' },
    { id: 'created_at', label: 'Date created' },
    { id: 'word_count', label: 'Word count' },
]

const TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
    note: { icon: FileText, label: 'Note', color: 'text-blue-400' },
    fleeting: { icon: Zap, label: 'Fleeting', color: 'text-yellow-400' },
    bookmark: { icon: Bookmark, label: 'Bookmark', color: 'text-purple-400' },
    gist: { icon: Code2, label: 'Gist', color: 'text-green-400' },
    image: { icon: ImageIcon, label: 'Image', color: 'text-pink-400' },
    audio: { icon: Music, label: 'Audio', color: 'text-orange-400' },
    pdf: { icon: FileType2, label: 'PDF', color: 'text-red-400' },
    docx: { icon: FileText, label: 'Word', color: 'text-blue-300' },
    sheet: { icon: Table, label: 'Sheet', color: 'text-green-300' },
    pptx: { icon: Presentation, label: 'PowerPoint', color: 'text-amber-400' },
}

const MASONRY_GAP_PX = 20
const KNOWLEDGE_CARD_BASE_MIN_WIDTH = 400
const KNOWLEDGE_CARD_MIN_WIDTH_MOBILE = 220
const KNOWLEDGE_CARD_MAX_HEIGHT_PX = 350
const TAG_CHIP_GAP_PX = 6

function getResponsiveCardMinWidth(containerWidth: number): number {
    // Desktop baseline uses 400px. On narrower viewports, relax min width to prevent overflow.
    if (containerWidth < 520) return Math.max(KNOWLEDGE_CARD_MIN_WIDTH_MOBILE, containerWidth - 24)
    if (containerWidth < 900) return 340
    return KNOWLEDGE_CARD_BASE_MIN_WIDTH
}

export default function WorkspaceHome() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const [searchParams, setSearchParams] = useSearchParams()
    const qc = useQueryClient()

    // Track knowledge IDs currently undergoing re-extraction
    const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set())
    // Track knowledge IDs currently undergoing intelligence generation
    const [intelligenceIds, setIntelligenceIds] = useState<Set<string>>(new Set())

    // Listen for background AI title/intelligence updates and refresh the grid
    const { on } = useWorkspaceWebSocket(workspaceId)
    useEffect(() => {
        if (!workspaceId) return
        return on('knowledge_updated', (msg: Record<string, unknown>) => {
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            const kid = msg.knowledge_id as string | undefined
            const fields = msg.fields as string[] | undefined
            if (kid && fields) {
                // Content extraction complete — intelligence generation likely starting
                if (fields.includes('embedding_status') && !fields.includes('insights')) {
                    setIntelligenceIds(prev => new Set(prev).add(kid))
                }
                // Intelligence generation complete
                if (fields.includes('insights')) {
                    setIntelligenceIds(prev => {
                        if (!prev.has(kid)) return prev
                        const next = new Set(prev)
                        next.delete(kid)
                        return next
                    })
                }
                // Clear re-extraction tracking
                if (fields.includes('content') || fields.includes('embedding_status')) {
                    setExtractingIds(prev => {
                        if (!prev.has(kid)) return prev
                        const next = new Set(prev)
                        next.delete(kid)
                        return next
                    })
                }
            }
        })
    }, [on, qc, workspaceId])

    const [filterText, setFilterText] = useState('')
    const [typeFilter, setTypeFilter] = useState('')
    const [showArchived, setShowArchived] = useState(false)
    const [sortBy, setSortBy] = useState('updated_at')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
    const [showTypeMenu, setShowTypeMenu] = useState(false)
    const [showSortMenu, setShowSortMenu] = useState(false)
    const [activeKnowledgeId, setActiveKnowledgeId] = useState<string | null>(null)

    // Re-open modal from ?k= URL param (set by KnowledgePage "collapse" button)
    useEffect(() => {
        const k = searchParams.get('k')
        if (k) {
            setActiveKnowledgeId(k)
            setSearchParams({}, { replace: true })
        }
    }, [searchParams, setSearchParams])
    const knowledgeLayoutRef = useRef<HTMLDivElement | null>(null)
    const [knowledgeCardMinWidth, setKnowledgeCardMinWidth] = useState(() =>
        typeof window !== 'undefined' ? getResponsiveCardMinWidth(window.innerWidth) : 400
    )
    const [masonryColumnCount, setMasonryColumnCount] = useState(1)

    // Multi-select
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const hasSelection = selected.size > 0

    const { data, isLoading } = useQuery({
        queryKey: ['knowledge', workspaceId, typeFilter, sortBy, sortOrder, showArchived],
        queryFn: () => listKnowledge(workspaceId, {
            type: typeFilter || undefined,
            is_archived: showArchived,
            sort_by: sortBy,
            sort_order: sortOrder,
            page_size: 200,
        }),
        enabled: !!workspaceId,
    })
    const { data: archivedKnowledgeStats } = useQuery({
        queryKey: ['knowledge', workspaceId, 'archived-total'],
        queryFn: () =>
            listKnowledge(workspaceId, {
                is_archived: true,
                page: 1,
                page_size: 1,
            }),
        enabled: !!workspaceId,
    })

    const handleCreate = (type: QuickKnowledgeType = 'note') => {
        openQuickKnowledge(type)
    }

    const handleDelete = async (knowledgeId: string) => {
        await deleteKnowledge(workspaceId, knowledgeId)
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        setSelected(s => { const n = new Set(s); n.delete(knowledgeId); return n })
    }

    const handlePin = async (knowledgeId: string) => {
        await togglePin(workspaceId, knowledgeId)
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
    }

    const handleArchive = async (knowledgeId: string) => {
        await toggleArchive(workspaceId, knowledgeId)
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        setSelected(s => { const n = new Set(s); n.delete(knowledgeId); return n })
    }

    const handleExtractBookmarkContent = async (knowledgeId: string) => {
        setExtractingIds(prev => new Set(prev).add(knowledgeId))
        await extractBookmarkContent(workspaceId, knowledgeId)
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
    }

    const handleReprocess = async (knowledgeId: string) => {
        await reprocessKnowledge(workspaceId, knowledgeId)
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
    }

    const handleBulkDelete = async () => {
        await Promise.all([...selected].map(id => deleteKnowledge(workspaceId, id)))
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        setSelected(new Set())
    }

    const handleBulkArchive = async () => {
        await Promise.all([...selected].map(id => toggleArchive(workspaceId, id)))
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        setSelected(new Set())
    }

    const handleBulkPin = async () => {
        await Promise.all([...selected].map(id => togglePin(workspaceId, id)))
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        setSelected(new Set())
    }

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    }

    const knowledgeItems: KnowledgeListItem[] = useMemo(() => {
        const allKnowledgeItems = data?.knowledge ??  []
        if (!filterText) return allKnowledgeItems
        const q = filterText.toLowerCase()
        return allKnowledgeItems.filter((n: KnowledgeListItem) =>
            (n.title ?? '').toLowerCase().includes(q) ||
            (n.ai_title ?? '').toLowerCase().includes(q) ||
            n.content_preview.toLowerCase().includes(q) ||
            n.tags.some(t => t.includes(q))
        )
    }, [data, filterText])

    const selectAll = () => setSelected(new Set(knowledgeItems.map(n => n.id)))
    const clearSelection = () => setSelected(new Set())

    const closeAllMenus = () => { setShowTypeMenu(false); setShowSortMenu(false) }

    const typeMeta = TYPE_OPTS.find(o => o.id === typeFilter)
    const sortMeta = SORT_OPTS.find(o => o.id === sortBy)
    const allKnowledgeItems = data?.knowledge ?? []
    const pinnedCount = allKnowledgeItems.filter((n: KnowledgeListItem) => n.is_pinned).length
    const archivedCount = archivedKnowledgeStats?.total ?? 0

    useEffect(() => {
        const node = knowledgeLayoutRef.current
        if (!node) return

        const recalculateMasonry = () => {
            const containerWidth = node.clientWidth
            if (!containerWidth) return
            const minWidth = getResponsiveCardMinWidth(containerWidth)
            const columns = Math.max(1, Math.floor((containerWidth + MASONRY_GAP_PX) / (minWidth + MASONRY_GAP_PX)))
            setKnowledgeCardMinWidth(minWidth)
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

    const knowledgeByColumn = useMemo(() => {
        const columns: Array<Array<{ knowledgeRecord: KnowledgeListItem; index: number }>> = Array.from(
            { length: masonryColumnCount },
            () => []
        )
        knowledgeItems.forEach((knowledgeRecord, index) => {
            columns[index % masonryColumnCount].push({ knowledgeRecord, index })
        })
        return columns
    }, [knowledgeItems, masonryColumnCount])

    return (
        <div className="w-full p-6 lg:p-7" onClick={closeAllMenus}>
            <div data-openforge-knowledge-sheet-anchor="1" className="min-w-0 space-y-5">
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

                        <button
                            className={`inline-flex h-10 items-center gap-1.5 px-3 rounded-lg border text-sm transition-colors ${showArchived
                                ? 'border-accent/50 text-accent bg-accent/10'
                                : 'border-border/70 text-muted-foreground hover:text-foreground hover:border-border'
                                }`}
                            onClick={() => setShowArchived(prev => !prev)}
                            title={showArchived ? 'Show active knowledge' : 'Show archived knowledge'}
                        >
                            {showArchived ? <ArchiveX className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                            {showArchived ? 'Archived View' : 'Archived'}
                        </button>

                        {knowledgeItems.length > 0 && (
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
                                {allKnowledgeItems.length} {showArchived ? 'archived shown' : 'shown'}
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

                <div ref={knowledgeLayoutRef} className="w-full">
                    {/* Loading skeletons */}
                    {isLoading && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                            {[...Array(10)].map((_, i) => (
                                <div key={i} className="glass-card rounded-2xl p-4 h-56 skeleton" />
                            ))}
                        </div>
                    )}

                    {/* Empty state */}
                    {!isLoading && knowledgeItems.length === 0 && (
                        filterText ? (
                            <div className="text-center py-20">
                                <Inbox className="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
                                <h3 className="text-lg font-semibold mb-2">No knowledge match your search</h3>
                                <p className="text-muted-foreground text-sm">Try a different search term.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-6 py-16">
                                <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                                    <Sparkles className="w-6 h-6 text-accent/60" />
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-semibold text-foreground/80">Your knowledge base is empty</p>
                                    <p className="text-sm text-muted-foreground mt-1">Start by creating your first knowledge item</p>
                                </div>
                                <div className="w-full max-w-2xl">
                                    <KnowledgeTypeGrid onSelect={(type) => handleCreate(type)} />
                                </div>
                            </div>
                        )
                    )}

                    {/* Knowledge grid */}
                    {!isLoading && knowledgeItems.length > 0 && (
                        <div className="flex items-start gap-5">
                            {knowledgeByColumn.map((column, columnIndex) => (
                                <div key={columnIndex} className="flex-1 min-w-0 space-y-5">
                                    {column.map(({ knowledgeRecord, index }) => (
                                        <KnowledgeCard
                                            key={knowledgeRecord.id}
                                            knowledgeRecord={knowledgeRecord}
                                            index={index}
                                            minWidthPx={knowledgeCardMinWidth}
                                            maxHeightPx={KNOWLEDGE_CARD_MAX_HEIGHT_PX}
                                            isSelected={selected.has(knowledgeRecord.id)}
                                            anySelected={hasSelection}
                                            onSelect={toggleSelect}
                                            onClick={() => setActiveKnowledgeId(knowledgeRecord.id)}
                                            onPin={() => handlePin(knowledgeRecord.id)}
                                            onArchive={() => handleArchive(knowledgeRecord.id)}
                                            onExtractBookmarkContent={() => handleExtractBookmarkContent(knowledgeRecord.id)}
                                            onReprocess={() => handleReprocess(knowledgeRecord.id)}
                                            onDelete={() => handleDelete(knowledgeRecord.id)}
                                            isExtracting={extractingIds.has(knowledgeRecord.id)}
                                            isGeneratingIntelligence={intelligenceIds.has(knowledgeRecord.id)}
                                            workspaceId={workspaceId}
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
                        className="fixed bottom-6 inset-x-0 z-50 flex justify-center pointer-events-none animate-slide-up"
                    >
                    <div
                        className="bg-card border border-accent/30 rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-2xl shadow-black/40 pointer-events-auto"
                    >
                        <span className="text-sm font-medium text-accent">{selected.size} selected</span>
                        <div className="w-px h-4 bg-border" />
                        <button className="btn-ghost text-xs gap-1.5 py-1.5 px-2.5" onClick={handleBulkPin}>
                            <Pin className="w-3.5 h-3.5" /> Pin
                        </button>
                        <button className="btn-ghost text-xs gap-1.5 py-1.5 px-2.5" onClick={handleBulkArchive}>
                            {showArchived ? <ArchiveX className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                            {showArchived ? 'Unarchive' : 'Archive'}
                        </button>
                        <button className="btn-ghost text-xs gap-1.5 py-1.5 px-2.5 text-red-400 hover:bg-destructive/10" onClick={handleBulkDelete}>
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                        <button className="btn-ghost text-xs gap-1.5 py-1.5 px-2.5" onClick={clearSelection}>
                            Clear
                        </button>
                    </div>
                    </div>
                )}

                {/* Knowledge preview panel */}
                <PreviewDispatcher
                    knowledgeId={activeKnowledgeId}
                    workspaceId={workspaceId}
                    isOpen={!!activeKnowledgeId}
                    onClose={() => setActiveKnowledgeId(null)}
                />
            </div>

        </div>
    )
}

// ── KnowledgeCard ────────────────────────────────────────────────────────────────
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

function KnowledgeCard({
    knowledgeRecord, index, isSelected, anySelected, onSelect, onClick,
    onPin, onArchive, onExtractBookmarkContent, onReprocess, onDelete, isExtracting, isGeneratingIntelligence, minWidthPx, maxHeightPx, workspaceId,
}: {
    knowledgeRecord: KnowledgeListItem
    index: number
    minWidthPx: number
    maxHeightPx: number
    isSelected: boolean
    anySelected: boolean
    onSelect: (id: string, e: React.MouseEvent) => void
    onClick: () => void
    onPin: () => void
    onArchive: () => void
    onExtractBookmarkContent: () => void
    onReprocess: () => void
    onDelete: () => void
    isExtracting?: boolean
    isGeneratingIntelligence?: boolean
    workspaceId: string
}) {
    const handleOpenUrl = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (knowledgeRecord.url) window.open(knowledgeRecord.url, '_blank', 'noopener')
    }
    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation()
        const a = document.createElement('a')
        a.href = getKnowledgeFileUrl(workspaceId, knowledgeRecord.id)
        a.download = knowledgeRecord.title || knowledgeRecord.ai_title || 'file'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    }
    const runAction = (e: React.MouseEvent, action: () => void) => {
        e.stopPropagation()
        action()
    }
    const isProcessing = isKnowledgeProcessing(knowledgeRecord)
    const floatingBtnClass = 'inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-black/70 text-white/90 hover:text-white hover:bg-black/85 backdrop-blur-md shadow-sm transition-colors'

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
                    {/* Floating action toolbar — top-right, visible on hover or when selected */}
                    <div className={`absolute top-2 right-2 z-20 flex items-center gap-1 transition-opacity ${isSelected || anySelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        {(knowledgeRecord.type === 'bookmark' || ['image', 'audio', 'pdf', 'document', 'sheet', 'slides'].includes(knowledgeRecord.type)) && (knowledgeRecord.type !== 'bookmark' || !!knowledgeRecord.url) && (
                            <button
                                className={floatingBtnClass}
                                onClick={e => runAction(e, knowledgeRecord.type === 'bookmark' ? onExtractBookmarkContent : onReprocess)}
                                title="Re-extract content"
                                aria-label="Re-extract content"
                                disabled={isExtracting}
                            >
                                <RefreshCw className={`w-3 h-3${isExtracting ? ' animate-spin' : ''}`} />
                            </button>
                        )}
                        {['image', 'audio', 'pdf', 'document', 'sheet', 'slides'].includes(knowledgeRecord.type) && (
                            <button
                                className={floatingBtnClass}
                                onClick={handleDownload}
                                title="Download"
                                aria-label="Download file"
                            >
                                <Download className="w-3 h-3" />
                            </button>
                        )}
                        {knowledgeRecord.type === 'bookmark' && knowledgeRecord.url && (
                            <button
                                className={floatingBtnClass}
                                onClick={handleOpenUrl}
                                title="Open URL"
                                aria-label="Open bookmark URL"
                            >
                                <ExternalLink className="w-3 h-3" />
                            </button>
                        )}
                        {knowledgeRecord.type === 'bookmark' && knowledgeRecord.url && (
                            <CopyButton
                                content={knowledgeRecord.url}
                                label="Copy URL"
                                copiedLabel="Copied"
                                iconOnly
                                stopPropagation
                                className={floatingBtnClass}
                            />
                        )}
                        {knowledgeRecord.type === 'gist' && (
                            <CopyButton
                                content={knowledgeRecord.content_preview}
                                label="Copy"
                                copiedLabel="Done"
                                iconOnly
                                stopPropagation
                                className={floatingBtnClass}
                            />
                        )}
                        <button
                            className={floatingBtnClass}
                            onClick={e => runAction(e, onPin)}
                            title={knowledgeRecord.is_pinned ? 'Unpin' : 'Pin'}
                            aria-label={knowledgeRecord.is_pinned ? 'Unpin knowledge' : 'Pin knowledge'}
                        >
                            {knowledgeRecord.is_pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                        </button>
                        <button
                            className={floatingBtnClass}
                            onClick={e => runAction(e, onArchive)}
                            title={knowledgeRecord.is_archived ? 'Restore' : 'Archive'}
                            aria-label={knowledgeRecord.is_archived ? 'Restore knowledge' : 'Archive knowledge'}
                        >
                            {knowledgeRecord.is_archived ? <ArchiveX className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                        </button>
                        <button
                            className={`${floatingBtnClass} hover:bg-red-500/70`}
                            onClick={e => runAction(e, onDelete)}
                            title="Delete"
                            aria-label="Delete knowledge"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                        <button
                            className={`${floatingBtnClass} ${isSelected ? 'bg-accent text-accent-foreground hover:bg-accent/80' : ''}`}
                            onClick={e => onSelect(knowledgeRecord.id, e)}
                            aria-label={isSelected ? 'Deselect knowledge' : 'Select knowledge'}
                        >
                            {isSelected ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                        </button>
                    </div>

                    {/* Card body — delegated to type-specific component */}
                    <KnowledgeCardContent item={knowledgeRecord} workspaceId={workspaceId} slim />

                    {/* Footer: tags + metadata */}
                    <div className="mt-3 pt-2 border-t border-border/45 space-y-1.5">
                        <FittedTagRow tags={knowledgeRecord.tags} />

                        <div className="flex items-center gap-1 min-w-0">
                            {isProcessing ? (
                                <Loader2 className="w-3 h-3 text-accent/70 animate-spin flex-shrink-0" />
                            ) : isGeneratingIntelligence ? (
                                <Sparkles className="w-3 h-3 text-accent animate-sparkle-pulse flex-shrink-0" />
                            ) : knowledgeRecord.embedding_status === 'done' ? (
                                <Sparkles className="w-3 h-3 text-accent flex-shrink-0" />
                            ) : null}
                            <p className="text-[10px] text-muted-foreground/90 truncate">
                                {isProcessing
                                    ? 'Processing…'
                                    : isGeneratingIntelligence
                                        ? 'Generating intelligence…'
                                        : `Updated ${new Date(knowledgeRecord.updated_at).toLocaleDateString()} · ${knowledgeRecord.word_count} words · ${knowledgeRecord.insights_count ?? 0} insights`
                                }
                            </p>
                        </div>
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
                <ContextMenuItem onClick={onPin} className="gap-2">
                    {knowledgeRecord.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    <span>{knowledgeRecord.is_pinned ? 'Unpin Knowledge' : 'Pin Knowledge'}</span>
                </ContextMenuItem>
                <ContextMenuItem onClick={onArchive} className="gap-2">
                    {knowledgeRecord.is_archived ? <ArchiveX className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    <span>{knowledgeRecord.is_archived ? 'Unarchive' : 'Archive'}</span>
                    <ContextMenuShortcut>{getShortcutDisplay('archiveKnowledge')}</ContextMenuShortcut>
                </ContextMenuItem>
                {knowledgeRecord.type === 'bookmark' && knowledgeRecord.url && (
                    <ContextMenuItem onClick={() => window.open(knowledgeRecord.url!, '_blank')} className="gap-2">
                        <ExternalLink className="w-4 h-4" />
                        <span>Open Link</span>
                    </ContextMenuItem>
                )}
                {knowledgeRecord.type === 'bookmark' && knowledgeRecord.url && (
                    <ContextMenuItem onClick={() => navigator.clipboard.writeText(knowledgeRecord.url!)} className="gap-2">
                        <Copy className="w-4 h-4" />
                        <span>Copy Link Address</span>
                    </ContextMenuItem>
                )}
                {knowledgeRecord.type === 'gist' && (
                    <ContextMenuItem onClick={() => navigator.clipboard.writeText(knowledgeRecord.content_preview)} className="gap-2">
                        <Copy className="w-4 h-4" />
                        <span>Copy Code</span>
                    </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={onDelete} className="gap-2 text-red-500 focus:text-red-400 focus:bg-red-500/10">
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Knowledge</span>
                    <ContextMenuShortcut>{getShortcutDisplay('deleteKnowledge')}</ContextMenuShortcut>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}
