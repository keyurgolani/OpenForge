import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { searchNotes } from '@/lib/api'
import { Search, Loader2, FileText, Bookmark, Code2, Zap, ExternalLink, Copy, SearchX } from 'lucide-react'
import { NoteModal } from '@/components/shared/NoteModal'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem
} from '@/components/ui/context-menu'
import MarkdownIt from 'markdown-it'

const mdPreview = new MarkdownIt({ html: false, linkify: false, typographer: true, breaks: true })
mdPreview.renderer.rules.link_open = () => ''
mdPreview.renderer.rules.link_close = () => ''

const TYPE_ICONS: Record<string, ReactElement> = {
    bookmark: <Bookmark className="w-3.5 h-3.5" />,
    gist: <Code2 className="w-3.5 h-3.5" />,
    fleeting: <Zap className="w-3.5 h-3.5" />,
    standard: <FileText className="w-3.5 h-3.5" />,
}

const TYPE_META: Record<string, { label: string; color: string }> = {
    standard: { label: 'Note', color: 'text-blue-400' },
    fleeting: { label: 'Fleeting', color: 'text-yellow-400' },
    bookmark: { label: 'Bookmark', color: 'text-purple-400' },
    gist: { label: 'Gist', color: 'text-green-400' },
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

function renderSearchMarkdown(text: string) {
    return { __html: mdPreview.render(text || '') }
}

export default function SearchPage() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const [query, setQuery] = useState(searchParams.get('q') ?? '')
    const [typeFilter, setTypeFilter] = useState('')
    const [modalNoteId, setModalNoteId] = useState<string | null>(null)

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
        <div className="max-w-4xl mx-auto p-6 lg:p-8">
            <div className="glass-card p-5 sm:p-6">
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
                    <SearchX className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
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
                        const typeKey = first.note_type in TYPE_META ? first.note_type : 'standard'
                        const typeMeta = TYPE_META[typeKey]
                        const typeIcon = TYPE_ICONS[typeKey] ?? TYPE_ICONS.standard
                        const hasTitle = !!first.title?.trim()
                        return (
                            <ContextMenu key={noteId}>
                                <ContextMenuTrigger asChild>
                                    <div
                                        className="glass-card-hover rounded-2xl p-4 cursor-pointer animate-fade-in space-y-3"
                                        onClick={() => setModalNoteId(noteId)}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 space-y-2">
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-border/60 bg-muted/40 ${typeMeta.color}`}>
                                                    {typeIcon}
                                                    {typeMeta.label}
                                                </span>
                                                {hasTitle && (
                                                    <h3 className="text-sm font-semibold leading-snug text-foreground truncate">
                                                        {first.title}
                                                    </h3>
                                                )}
                                            </div>
                                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                        </div>

                                        {chunks.map((chunk, i) => (
                                            <div key={i} className={`${i > 0 ? 'pt-3 border-t border-border/50' : ''} space-y-2`}>
                                                {chunk.header_path && (
                                                    <p className="text-[11px] text-muted-foreground">{chunk.header_path}</p>
                                                )}

                                                <div
                                                    className="markdown-content text-xs text-foreground/88 leading-relaxed line-clamp-4 [&_p]:mb-1 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-sm [&_pre]:text-[11px] [&_code]:text-[11px]"
                                                    dangerouslySetInnerHTML={renderSearchMarkdown(chunk.chunk_text || chunk.highlighted_text)}
                                                />

                                                <div className="flex items-center gap-3 pt-1">
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
                                    <ContextMenuItem onClick={() => navigator.clipboard.writeText(first.title || first.chunk_text || '')} className="gap-2">
                                        <Copy className="w-4 h-4" /> Copy Title
                                    </ContextMenuItem>
                                </ContextMenuContent>
                            </ContextMenu>
                        )
                    })}
                </div>
            )}
            </div>

            {modalNoteId && (
                <NoteModal
                    noteId={modalNoteId}
                    workspaceId={workspaceId}
                    onClose={() => setModalNoteId(null)}
                />
            )}
        </div>
    )
}
