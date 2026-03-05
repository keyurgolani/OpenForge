import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { searchNotes } from '@/lib/api'
import { Search, Loader2, FileText, Bookmark, Code2, Zap, ExternalLink, Filter, Copy } from 'lucide-react'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem
} from '@/components/ui/context-menu'

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value)
    useState(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay)
        return () => clearTimeout(timer)
    })
    return debouncedValue
}

function highlight(text: string) {
    return { __html: text }
}

const TYPE_ICONS: Record<string, ReactElement> = {
    bookmark: <Bookmark className="w-3.5 h-3.5" />,
    gist: <Code2 className="w-3.5 h-3.5" />,
    fleeting: <Zap className="w-3.5 h-3.5" />,
    standard: <FileText className="w-3.5 h-3.5" />,
}

const NOTE_TYPES = ['', 'standard', 'fleeting', 'bookmark', 'gist']

interface SearchResult {
    note_id: string
    title: string
    note_type: string
    chunk_text: string
    header_path: string
    tags: string[]
    score: number
    highlighted_text: string
}

export default function SearchPage() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const [query, setQuery] = useState(searchParams.get('q') ?? '')
    const [typeFilter, setTypeFilter] = useState('')

    // Debounce the query
    const [debouncedQuery, setDebouncedQuery] = useState(query)
    const timerRef = { current: null as ReturnType<typeof setTimeout> | null }

    const handleQueryChange = (q: string) => {
        setQuery(q)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            setDebouncedQuery(q)
            setSearchParams(q ? { q } : {}, { replace: true })
        }, 300)
    }

    const { data, isFetching } = useQuery({
        queryKey: ['search', workspaceId, debouncedQuery, typeFilter],
        queryFn: () => searchNotes(workspaceId, debouncedQuery, { note_type: typeFilter || undefined, limit: 30 }),
        enabled: !!debouncedQuery.trim() && !!workspaceId,
    })

    const results: SearchResult[] = data?.results ?? []

    // Group by note
    const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
        if (!acc[r.note_id]) acc[r.note_id] = []
        acc[r.note_id].push(r)
        return acc
    }, {})

    return (
        <div className="max-w-3xl mx-auto p-6">
            {/* Search bar */}
            <div className="relative mb-4">
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
            <div className="flex gap-2 mb-6 flex-wrap">
                {NOTE_TYPES.map(t => (
                    <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={`chip cursor-pointer transition-all ${typeFilter === t ? 'chip-accent' : 'chip-muted'}`}
                    >
                        {t ? (
                            <><span className="mr-1">{TYPE_ICONS[t]}</span> {t}</>
                        ) : 'All types'}
                    </button>
                ))}
            </div>

            {/* Empty state - no query */}
            {!debouncedQuery.trim() && (
                <div className="text-center py-16">
                    <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                    <h3 className="text-lg font-medium mb-2">Semantic Search</h3>
                    <p className="text-muted-foreground text-sm">
                        Search by meaning, not just keywords. Try "recent project deadlines" or "ideas about design".
                    </p>
                </div>
            )}

            {/* Empty state - no results */}
            {debouncedQuery.trim() && !isFetching && results.length === 0 && (
                <div className="text-center py-16">
                    <div className="text-4xl mb-4">🔍</div>
                    <h3 className="text-lg font-medium mb-2">No results found</h3>
                    <p className="text-muted-foreground text-sm">
                        No notes match <em>"{debouncedQuery}"</em>. Try different keywords or create new notes.
                    </p>
                </div>
            )}

            {/* Results */}
            {results.length > 0 && (
                <div className="space-y-4">
                    <p className="text-xs text-muted-foreground">{results.length} result{results.length !== 1 ? 's' : ''}</p>
                    {Object.entries(grouped).map(([noteId, chunks]) => {
                        const first = chunks[0]
                        return (
                            <ContextMenu key={noteId}>
                                <ContextMenuTrigger asChild>
                                    <div
                                        className="glass-card-hover p-4 cursor-pointer animate-fade-in"
                                        onClick={() => navigate(`/w/${workspaceId}/notes/${noteId}`)}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`type-${first.note_type}`}>{TYPE_ICONS[first.note_type]}{first.note_type}</span>
                                                <h3 className="text-sm font-semibold">{first.title}</h3>
                                            </div>
                                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                        </div>

                                        {chunks.map((chunk, i) => (
                                            <div key={i} className={`${i > 0 ? 'mt-3 pt-3 border-t border-border/50' : ''}`}>
                                                {chunk.header_path && (
                                                    <p className="text-xs text-muted-foreground mb-1">{chunk.header_path}</p>
                                                )}
                                                <p
                                                    className="text-xs text-muted-foreground leading-relaxed line-clamp-3"
                                                    dangerouslySetInnerHTML={highlight(chunk.highlighted_text || chunk.chunk_text)}
                                                />
                                                <div className="flex items-center gap-3 mt-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-16 h-1 bg-border rounded overflow-hidden">
                                                            <div className="h-full bg-accent rounded" style={{ width: `${Math.round(chunk.score * 100)}%` }} />
                                                        </div>
                                                        <span className="text-xs text-muted-foreground">{Math.round(chunk.score * 100)}%</span>
                                                    </div>
                                                    {chunk.tags.slice(0, 3).map(t => (
                                                        <span key={t} className="chip-muted text-xs">{t}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ContextMenuTrigger>
                                <ContextMenuContent className="w-48">
                                    <ContextMenuItem onClick={() => navigate(`/w/${workspaceId}/notes/${noteId}`)} className="gap-2">
                                        <ExternalLink className="w-4 h-4" /> Open Note
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => navigator.clipboard.writeText(first.title)} className="gap-2">
                                        <Copy className="w-4 h-4" /> Copy Title
                                    </ContextMenuItem>
                                </ContextMenuContent>
                            </ContextMenu>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
