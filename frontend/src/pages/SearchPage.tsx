import { useState, useMemo, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { searchKnowledge } from '@/lib/api'
import { Search, Loader2, FileText, Bookmark, Code2, Zap, ExternalLink, Copy, SearchX, MessageSquare, Image as ImageIcon, Music, FileType2, Table, Presentation } from 'lucide-react'
import PreviewDispatcher from '@/components/knowledge/preview/PreviewDispatcher'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem
} from '@/components/ui/context-menu'
import MarkdownIt from 'markdown-it'
import VisualSearchTab from '@/components/search/VisualSearchTab'

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

interface SearchResult {
    knowledge_id: string | null
    conversation_id?: string | null
    title: string
    knowledge_type: string
    chunk_text: string
    header_path: string
    tags: string[]
    score: number
    highlighted_text: string
}

type CardItem =
    | { kind: 'chat'; key: string; chunks: SearchResult[]; topScore: number }
    | { kind: 'knowledge'; key: string; chunks: SearchResult[]; topScore: number }

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

    const { data, isFetching } = useQuery({
        queryKey: ['search', workspaceId, debouncedQuery, typeFilter],
        queryFn: () => searchKnowledge(workspaceId, debouncedQuery, { knowledge_type: typeFilter || undefined, limit: 30 }),
        enabled: !!debouncedQuery.trim() && !!workspaceId,
    })

    const results: SearchResult[] = data?.results ?? []

    // Flatten all results into a single sorted list of cards
    const cards = useMemo<CardItem[]>(() => {
        const chatMap: Record<string, SearchResult[]> = {}
        const knowledgeMap: Record<string, SearchResult[]> = {}
        for (const r of results) {
            if (r.knowledge_type === 'chat') {
                const key = r.conversation_id ?? ''
                if (!chatMap[key]) chatMap[key] = []
                chatMap[key].push(r)
            } else {
                const key = r.knowledge_id ?? ''
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

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                            <p className="text-xs text-muted-foreground">{results.length} result{results.length !== 1 ? 's' : ''}</p>
                            <div className="columns-1 sm:columns-2 xl:columns-3 gap-4">
                                {cards.map(card =>
                                    card.kind === 'chat' ? (
                                        <div key={card.key} className="break-inside-avoid mb-4">
                                            <div
                                                className="glass-card-hover rounded-2xl p-4 cursor-pointer animate-fade-in space-y-3"
                                                onClick={() => card.chunks[0]?.conversation_id && navigate(`/w/${workspaceId}/chat/${card.chunks[0].conversation_id}`)}
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
                                                    {card.chunks[0]?.highlighted_text || card.chunks[0]?.chunk_text}
                                                </div>
                                                <div className="flex items-center gap-1.5 pt-1">
                                                    <div className="w-16 h-1 bg-border rounded overflow-hidden">
                                                        <div className="h-full bg-accent rounded" style={{ width: `${Math.round(card.topScore * 100)}%` }} />
                                                    </div>
                                                    <span className="text-[11px] text-muted-foreground">{Math.round(card.topScore * 100)}%</span>
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
                                                            const typeKey = first.knowledge_type in TYPE_META ? first.knowledge_type : 'note'
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
                                                                                dangerouslySetInnerHTML={renderSearchMarkdown(chunk.chunk_text || chunk.highlighted_text)}
                                                                            />
                                                                            <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <div className="w-16 h-1 bg-border rounded overflow-hidden">
                                                                                        <div className="h-full bg-accent rounded" style={{ width: `${Math.round(chunk.score * 100)}%` }} />
                                                                                    </div>
                                                                                    <span className="text-[11px] text-muted-foreground">{Math.round(chunk.score * 100)}%</span>
                                                                                </div>
                                                                                {chunk.tags.slice(0, 3).map(t => (
                                                                                    <span key={t} className="chip-muted text-[11px]">{t}</span>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    ))}
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
                                                <ContextMenuItem onClick={() => navigator.clipboard.writeText(card.chunks[0]?.title || card.chunks[0]?.chunk_text || '')} className="gap-2">
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
