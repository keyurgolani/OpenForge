import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { visualSearch, getKnowledgeThumbnailUrl } from '@/lib/api'
import { knowledgeRoute } from '@/lib/routes'
import { Image as ImageIcon, Upload, Loader2, X, SearchX } from 'lucide-react'

interface VisualSearchResult {
    knowledge_id: string
    title: string | null
    ai_title: string | null
    score: number
    thumbnail_path: string | null
}

interface VisualSearchTabProps {
    onSelect?: (knowledgeId: string) => void
}

export default function VisualSearchTab({ onSelect }: VisualSearchTabProps) {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const [queryFile, setQueryFile] = useState<File | null>(null)
    const [queryPreview, setQueryPreview] = useState<string | null>(null)
    const [results, setResults] = useState<VisualSearchResult[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const [searched, setSearched] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleFile = useCallback((f: File) => {
        if (!f.type.startsWith('image/')) {
            setError('Please select an image file.')
            return
        }
        setQueryFile(f)
        if (queryPreview) URL.revokeObjectURL(queryPreview)
        setQueryPreview(URL.createObjectURL(f))
        setError(null)
        setResults([])
        setSearched(false)
    }, [queryPreview])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFile(f)
    }, [handleFile])

    const handleSearch = async () => {
        if (!queryFile || !workspaceId) return
        setLoading(true)
        setError(null)
        try {
            const data = await visualSearch(workspaceId, queryFile, 20)
            setResults([...(data.results ?? [])].sort((a, b) => b.score - a.score))
            setSearched(true)
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Visual search failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const handleReset = () => {
        setQueryFile(null)
        if (queryPreview) URL.revokeObjectURL(queryPreview)
        setQueryPreview(null)
        setResults([])
        setSearched(false)
        setError(null)
    }

    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
                Upload an image to find visually similar images in your knowledge base using CLIP embeddings.
            </p>

            {/* Query image + search button */}
            <div className="flex flex-col sm:flex-row gap-3 items-start">
                <div
                    className={`relative flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all cursor-pointer
                        ${dragOver ? 'border-accent bg-accent/5 scale-[1.01]' : queryFile ? 'border-accent/40 bg-accent/5' : 'border-border/25 hover:border-accent/50 hover:bg-muted/20'}`}
                    style={{ minHeight: '8rem' }}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => !queryFile && inputRef.current?.click()}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                        className="hidden"
                    />

                    {queryFile && queryPreview ? (
                        <div className="relative p-2 w-full">
                            <img
                                src={queryPreview}
                                alt="Query"
                                className="w-full rounded-lg object-contain"
                                style={{ maxHeight: '160px' }}
                            />
                            <button
                                className="absolute top-3 right-3 btn-ghost p-1 bg-card/80 backdrop-blur-sm border border-border/20"
                                onClick={e => { e.stopPropagation(); handleReset() }}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-center p-5">
                            <div className="w-10 h-10 rounded-xl bg-muted/40 border border-border/25 flex items-center justify-center">
                                <Upload className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-sm text-foreground">
                                    Drop an image or <span className="text-accent font-medium">browse</span>
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WebP, GIF</p>
                            </div>
                        </div>
                    )}
                </div>

                <button
                    className="btn-primary px-5 py-2.5 text-sm gap-2 self-end sm:self-center flex-shrink-0"
                    disabled={!queryFile || loading}
                    onClick={handleSearch}
                >
                    {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Searching…</>
                    ) : (
                        <><ImageIcon className="w-4 h-4" /> Search</>
                    )}
                </button>
            </div>

            {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
            )}

            {searched && results.length === 0 && !loading && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <SearchX className="w-8 h-8 text-muted-foreground opacity-40" />
                    <p className="text-sm text-muted-foreground">No visually similar images found.</p>
                    <p className="text-xs text-muted-foreground/60">Try a different image or add more images to your knowledge base.</p>
                </div>
            )}

            {results.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{results.length} similar image{results.length !== 1 ? 's' : ''} found</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {results.map((r) => {
                            const displayTitle = r.title?.trim() || r.ai_title?.trim() || 'Untitled'
                            return (
                                <div
                                    key={r.knowledge_id}
                                    className="glass-card-hover rounded-xl overflow-hidden cursor-pointer group animate-fade-in"
                                    onClick={() => onSelect ? onSelect(r.knowledge_id) : navigate(`${knowledgeRoute(workspaceId)}?k=${r.knowledge_id}`)}
                                >
                                    <div className="aspect-square bg-muted/30 overflow-hidden">
                                        {r.thumbnail_path ? (
                                            <img
                                                src={getKnowledgeThumbnailUrl(workspaceId, r.knowledge_id)}
                                                alt={displayTitle}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <ImageIcon className="w-8 h-8 text-muted-foreground/60" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-2 space-y-0.5">
                                        <p className="text-xs font-medium truncate">{displayTitle}</p>
                                        <p className="text-[10px] text-accent font-medium">{Math.round(r.score * 100)}% match</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
