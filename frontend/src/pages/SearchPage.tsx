import { startTransition, useState, useMemo, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { buildEvidencePacket, retrievalRead, retrievalSearch } from '@/lib/api'
import { chatRoute } from '@/lib/routes'
import { Search, Loader2, FileText, Bookmark, Code2, Zap, ExternalLink, Copy, SearchX, MessageSquare, Image as ImageIcon, Music, FileType2, Table, Presentation } from 'lucide-react'
import PreviewDispatcher from '@/components/knowledge/preview/PreviewDispatcher'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem
} from '@/components/ui/context-menu'
import MarkdownIt from 'markdown-it'
import VisualSearchTab from '@/components/search/VisualSearchTab'
import EvidencePacketPanel from '@/features/retrieval/EvidencePacketPanel'
import type {
    EvidencePacketResponse,
    RetrievalReadResult,
    RetrievalSearchResponse,
    RetrievalSearchResult,
} from '@/features/retrieval/types'

const mdPreview = new MarkdownIt({ html: false, linkify: false, typographer: true, breaks: true })
mdPreview.renderer.rules.link_open = () => ''
mdPreview.renderer.rules.link_close = () => ''

const TYPE_ICONS: Record<string, ReactElement> = {
    bookmark: <Bookmark className="w-3.5 h-3.5" />,
    gist: <Code2 className="w-3.5 h-3.5" />,
    fleeting: <Zap className="w-3.5 h-3.5" />,
    note: <FileText className="w-3.5 h-3.5" />,
    image: <ImageIcon className="w-3.5 h-3.5" />,
    audio: <Music className="w-3.5 h-3.5" />,
    pdf: <FileType2 className="w-3.5 h-3.5" />,
    docx: <FileText className="w-3.5 h-3.5" />,
    sheet: <Table className="w-3.5 h-3.5" />,
    pptx: <Presentation className="w-3.5 h-3.5" />,
    chat: <MessageSquare className="w-3.5 h-3.5" />,
}

const TYPE_META: Record<string, { label: string; color: string }> = {
    note: { label: 'Note', color: 'text-blue-400' },
    fleeting: { label: 'Fleeting', color: 'text-yellow-400' },
    bookmark: { label: 'Bookmark', color: 'text-purple-400' },
    gist: { label: 'Gist', color: 'text-green-400' },
    image: { label: 'Image', color: 'text-pink-400' },
    audio: { label: 'Audio', color: 'text-orange-400' },
    pdf: { label: 'PDF', color: 'text-red-400' },
    document: { label: 'Document', color: 'text-blue-300' },
    sheet: { label: 'Sheet', color: 'text-green-300' },
    slides: { label: 'Slides', color: 'text-amber-400' },
    chat: { label: 'Chat', color: 'text-violet-400' },
}

const KNOWLEDGE_TYPES = ['', 'note', 'fleeting', 'bookmark', 'gist', 'image', 'audio', 'pdf', 'document', 'sheet', 'slides']

type CardItem =
    | { kind: 'chat'; key: string; chunks: RetrievalSearchResult[]; topScore: number }
    | { kind: 'knowledge'; key: string; chunks: RetrievalSearchResult[]; topScore: number }

function renderSearchMarkdown(text: string) {
    return { __html: mdPreview.render(text || '') }
}

export default function SearchPage() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const [query, setQuery] = useState(searchParams.get('q') ?? '')
    const [typeFilter, setTypeFilter] = useState('')
    const [modalKnowledgeId, setModalKnowledgeId] = useState<string | null>(null)
    const [searchTab, setSearchTab] = useState<'text' | 'visual'>('text')
    const [activeTraceResult, setActiveTraceResult] = useState<RetrievalSearchResult | null>(null)
    const [activeReadResult, setActiveReadResult] = useState<RetrievalReadResult | null>(null)
    const [activeEvidencePacket, setActiveEvidencePacket] = useState<EvidencePacketResponse | null>(null)
    const [traceLoading, setTraceLoading] = useState(false)
    const [buildingEvidence, setBuildingEvidence] = useState(false)
    const searchLayoutRef = useRef<HTMLDivElement | null>(null)

    const [debouncedQuery, setDebouncedQuery] = useState(query)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleQueryChange = (q: string) => {
        setQuery(q)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            setDebouncedQuery(q)
            setSearchParams(q ? { q } : {}, { replace: true })
        }, 300)
    }

    useEffect(() => {
        return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    }, [])

    const { data, isFetching } = useQuery<RetrievalSearchResponse>({
        queryKey: ['retrieval-search', workspaceId, debouncedQuery, typeFilter],
        queryFn: () => retrievalSearch({
            workspace_id: workspaceId,
            query_text: debouncedQuery,
            knowledge_type: typeFilter || undefined,
            limit: 30,
            include_parent_context: true,
            deduplicate_sources: true,
        }),
        enabled: !!debouncedQuery.trim() && !!workspaceId,
    })

    const queryRecord = data?.query ?? null
    const results = useMemo<RetrievalSearchResult[]>(
        () => data?.results ?? [],
        [data],
    )

    useEffect(() => {
        startTransition(() => {
            setActiveTraceResult(null)
            setActiveReadResult(null)
            setActiveEvidencePacket(null)
        })
    }, [queryRecord?.id])

    const readTrace = async (result: RetrievalSearchResult) => {
        if (!queryRecord) return
        setTraceLoading(true)
        setActiveTraceResult(result)
        try {
            const payload = await retrievalRead({
                query_id: queryRecord.id,
                result_ids: [result.id],
                include_parent_context: true,
                selection_reason_codes: ['user_selected'],
            })
            startTransition(() => {
                setActiveReadResult(payload.results?.[0] ?? null)
                setActiveEvidencePacket(null)
            })
        } finally {
            setTraceLoading(false)
        }
    }

    const handleBuildEvidence = async () => {
        if (!queryRecord || !activeReadResult) return
        setBuildingEvidence(true)
        try {
            const packet = await buildEvidencePacket({
                workspace_id: workspaceId,
                query_id: queryRecord.id,
                items: [{
                    source_type: activeReadResult.source_type,
                    source_id: activeReadResult.source_id,
                    title: activeReadResult.title,
                    excerpt: activeReadResult.excerpt,
                    parent_excerpt: activeReadResult.parent_excerpt,
                    selection_reason_codes: activeReadResult.selection_reason_codes,
                    citation: activeReadResult.citation,
                    metadata: activeReadResult.metadata,
                }],
                summary: `Evidence for ${activeReadResult.title}`,
            })
            startTransition(() => {
                setActiveEvidencePacket(packet)
            })
        } finally {
            setBuildingEvidence(false)
        }
    }

    // Flatten all results into a single sorted list of cards
    const cards = useMemo<CardItem[]>(() => {
        const chatMap: Record<string, RetrievalSearchResult[]> = {}
        const knowledgeMap: Record<string, RetrievalSearchResult[]> = {}
        for (const r of results) {
            const conversationId = typeof r.metadata?.conversation_id === 'string' ? r.metadata.conversation_id : null
            const knowledgeId = typeof r.metadata?.knowledge_id === 'string' ? r.metadata.knowledge_id : null
            if (r.knowledge_type === 'chat' || r.source_type === 'conversation') {
                const key = conversationId ?? r.source_id
                if (!chatMap[key]) chatMap[key] = []
                chatMap[key].push(r)
            } else {
                const key = knowledgeId ?? r.source_id
                if (!knowledgeMap[key]) knowledgeMap[key] = []
                knowledgeMap[key].push(r)
            }
        }
        const all: CardItem[] = [
            ...Object.entries(chatMap).map(([key, chunks]) => ({
                kind: 'chat' as const, key, chunks,
                topScore: Math.max(...chunks.map(c => c.score)),
            })),
            ...Object.entries(knowledgeMap).map(([key, chunks]) => ({
                kind: 'knowledge' as const, key, chunks,
                topScore: Math.max(...chunks.map(c => c.score)),
            })),
        ]
        return all.sort((a, b) => b.topScore - a.topScore)
    }, [results])

    const getResultTags = (result: RetrievalSearchResult) =>
        Array.isArray(result.metadata?.tags) ? result.metadata.tags as string[] : []

    return (
        <div className="h-full w-full p-6 lg:p-7">
            <div ref={searchLayoutRef} data-openforge-knowledge-sheet-anchor="1" className="flex h-full min-h-0 flex-col gap-4">
                {/* Tab toggle */}
                <div className="flex items-center gap-1 p-1 bg-muted/30 border border-border/50 rounded-xl self-start">
                    <button
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all ${searchTab === 'text' ? 'bg-card text-foreground shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => setSearchTab('text')}
                    >
                        <Search className="w-3.5 h-3.5" /> Text Search
                    </button>
                    <button
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all ${searchTab === 'visual' ? 'bg-card text-foreground shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => setSearchTab('visual')}
                    >
                        <ImageIcon className="w-3.5 h-3.5" /> Visual Search
                    </button>
                </div>

                {searchTab === 'visual' ? (
                    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                        <VisualSearchTab />
                    </div>
                ) : (<>

                {/* Search bar */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                    {isFetching && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-accent animate-spin" />}
                    <input
                        className="input pl-12 pr-12 py-3 text-base rounded-xl"
                        placeholder="Search your knowledge base…"
                        value={query}
                        onChange={e => handleQueryChange(e.target.value)}
                        autoFocus
                    />
                </div>

                {/* Filters */}
                <div className="flex gap-2 flex-wrap">
                    {KNOWLEDGE_TYPES.map(t => (
                        <button
                            key={t}
                            onClick={() => setTypeFilter(t)}
                            className={`chip cursor-pointer transition-all ${typeFilter === t ? 'chip-accent' : 'chip-muted'}`}
                        >
                            {t ? (
                                <>
                                    <span className="mr-1">{TYPE_ICONS[t]}</span>
                                    {TYPE_META[t]?.label ?? t}
                                </>
                            ) : 'All types'}
                        </button>
                    ))}
                </div>

                <div className="min-h-0 flex-1 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    <div className="min-h-0 overflow-y-auto pr-1">
                    {/* Empty state – no query */}
                    {!debouncedQuery.trim() && (
                        <div className="flex h-full min-h-[240px] items-center justify-center text-center">
                            <div>
                                <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                                <h3 className="text-lg font-medium mb-2">Semantic Search</h3>
                                <p className="text-muted-foreground text-sm">
                                    Search by meaning, not just keywords. Try "recent project deadlines" or "ideas about design".
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Empty state – no results */}
                    {debouncedQuery.trim() && !isFetching && results.length === 0 && (
                        <div className="flex h-full min-h-[240px] items-center justify-center text-center">
                            <div>
                                <SearchX className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                                <h3 className="text-lg font-medium mb-2">No results found</h3>
                                <p className="text-muted-foreground text-sm">
                                    No knowledge matches <em>"{debouncedQuery}"</em>. Try different keywords or create new knowledge.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Masonry results grid */}
                    {cards.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-xs text-muted-foreground">{results.length} result{results.length !== 1 ? 's' : ''}</p>
                                {queryRecord && (
                                    <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
                                        Query {queryRecord.id.slice(0, 8)} · {queryRecord.search_strategy}
                                    </span>
                                )}
                            </div>
                            <div className="columns-1 sm:columns-2 xl:columns-3 gap-4">
                                {cards.map(card =>
                                    card.kind === 'chat' ? (
                                        <div key={card.key} className="break-inside-avoid mb-4">
                                            <div
                                                className="glass-card-hover rounded-2xl p-4 cursor-pointer animate-fade-in space-y-3"
                                                onClick={() => {
                                                    const conversationId = typeof card.chunks[0]?.metadata?.conversation_id === 'string'
                                                        ? card.chunks[0].metadata.conversation_id
                                                        : card.chunks[0]?.source_id
                                                    if (conversationId) navigate(chatRoute(workspaceId, conversationId))
                                                }}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 space-y-2">
                                                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-border/60 bg-muted/40 text-violet-400">
                                                            <MessageSquare className="w-3.5 h-3.5" />
                                                            Chat
                                                        </span>
                                                        {card.chunks[0]?.title && (
                                                            <h3 className="text-sm font-semibold leading-snug text-foreground">
                                                                {card.chunks[0].title}
                                                            </h3>
                                                        )}
                                                    </div>
                                                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                                </div>
                                                <div className="text-xs text-foreground/80 leading-relaxed line-clamp-5 whitespace-pre-wrap">
                                                    {card.chunks[0]?.excerpt}
                                                </div>
                                                <div className="flex items-center justify-between gap-3 pt-1">
                                                    <div className="w-16 h-1 bg-border rounded overflow-hidden">
                                                        <div className="h-full bg-accent rounded" style={{ width: `${Math.round(card.topScore * 100)}%` }} />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] text-muted-foreground">{Math.round(card.topScore * 100)}%</span>
                                                        <button
                                                            className="rounded-lg border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                                                            onClick={(event) => {
                                                                event.stopPropagation()
                                                                void readTrace(card.chunks[0])
                                                            }}
                                                        >
                                                            Trace
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <ContextMenu key={card.key}>
                                            <ContextMenuTrigger asChild>
                                                <div className="break-inside-avoid mb-4">
                                                    <div
                                                        className="glass-card-hover rounded-2xl p-4 cursor-pointer animate-fade-in space-y-3"
                                                        onClick={() => setModalKnowledgeId(card.key)}
                                                    >
                                                        {(() => {
                                                            const first = card.chunks[0]
                                                            const typeKey = first.knowledge_type && first.knowledge_type in TYPE_META ? first.knowledge_type : 'note'
                                                            const typeMeta = TYPE_META[typeKey]
                                                            const typeIcon = TYPE_ICONS[typeKey] ?? TYPE_ICONS.note
                                                            return (
                                                                <>
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div className="min-w-0 space-y-2">
                                                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-border/60 bg-muted/40 ${typeMeta.color}`}>
                                                                                {typeIcon}
                                                                                {typeMeta.label}
                                                                            </span>
                                                                            {first.title?.trim() && (
                                                                                <h3 className="text-sm font-semibold leading-snug text-foreground">
                                                                                    {first.title}
                                                                                </h3>
                                                                            )}
                                                                        </div>
                                                                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                                                    </div>

                                                                    {card.chunks.map((chunk, i) => (
                                                                        <div key={i} className={`${i > 0 ? 'pt-3 border-t border-border/40' : ''} space-y-2`}>
                                                                            {chunk.header_path && (
                                                                                <p className="text-[11px] text-muted-foreground font-medium">{chunk.header_path}</p>
                                                                            )}
                                                                            <div
                                                                                className="markdown-content text-xs text-foreground/80 leading-relaxed line-clamp-5 [&_p]:mb-1 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-sm [&_pre]:text-[11px] [&_code]:text-[11px]"
                                                                                dangerouslySetInnerHTML={renderSearchMarkdown(chunk.excerpt)}
                                                                            />
                                                                            <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <div className="w-16 h-1 bg-border rounded overflow-hidden">
                                                                                        <div className="h-full bg-accent rounded" style={{ width: `${Math.round(chunk.score * 100)}%` }} />
                                                                                    </div>
                                                                                    <span className="text-[11px] text-muted-foreground">{Math.round(chunk.score * 100)}%</span>
                                                                                </div>
                                                                                {getResultTags(chunk).slice(0, 3).map(t => (
                                                                                    <span key={t} className="chip-muted text-[11px]">{t}</span>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                    <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-3">
                                                                        <p className="text-[11px] text-muted-foreground">
                                                                            #{card.chunks[0]?.rank_position ?? 1} · {card.chunks[0]?.strategy ?? 'hybrid'}
                                                                        </p>
                                                                        <button
                                                                            className="rounded-lg border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                                                                            onClick={(event) => {
                                                                                event.stopPropagation()
                                                                                void readTrace(card.chunks[0])
                                                                            }}
                                                                        >
                                                                            Trace
                                                                        </button>
                                                                    </div>
                                                                </>
                                                            )
                                                        })()}
                                                    </div>
                                                </div>
                                            </ContextMenuTrigger>
                                            <ContextMenuContent className="w-48">
                                                <ContextMenuItem onClick={() => navigate(`/w/${workspaceId}/knowledge/${card.key}`)} className="gap-2">
                                                    <ExternalLink className="w-4 h-4" /> Open Knowledge
                                                </ContextMenuItem>
                                                <ContextMenuItem onClick={() => navigator.clipboard.writeText(card.chunks[0]?.title || card.chunks[0]?.excerpt || '')} className="gap-2">
                                                    <Copy className="w-4 h-4" /> Copy Title
                                                </ContextMenuItem>
                                            </ContextMenuContent>
                                        </ContextMenu>
                                    )
                                )}
                            </div>
                        </div>
                    )}
                    </div>

                    <div className="min-h-0 lg:overflow-y-auto">
                        <EvidencePacketPanel
                            query={queryRecord}
                            activeResult={activeTraceResult}
                            readResult={activeReadResult}
                            evidence={activeEvidencePacket}
                            loading={traceLoading}
                            buildingEvidence={buildingEvidence}
                            onBuildEvidence={() => { void handleBuildEvidence() }}
                        />
                    </div>
                </div>
            </>)}
            </div>

            <PreviewDispatcher
                knowledgeId={modalKnowledgeId}
                workspaceId={workspaceId}
                isOpen={!!modalKnowledgeId}
                onClose={() => setModalKnowledgeId(null)}
            />
        </div>
    )
}
