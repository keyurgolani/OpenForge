import { useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { visualSearch, getKnowledgeThumbnailUrl } from '@/lib/api'

export default function VisualSearchTab() {
    const { workspaceId } = useParams<{ workspaceId: string }>()
    const [results, setResults] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleSearch = useCallback(async (file: File) => {
        if (!workspaceId) return
        setSearching(true)
        setError(null)
        setResults([])

        // Show preview of query image
        const url = URL.createObjectURL(file)
        setPreviewUrl(url)

        try {
            const data = await visualSearch(workspaceId, file, 20)
            setResults(data.results || [])
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Visual search failed.')
        } finally {
            setSearching(false)
        }
    }, [workspaceId])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file && file.type.startsWith('image/')) {
            handleSearch(file)
        }
    }, [handleSearch])

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) handleSearch(file)
    }

    return (
        <div className="visual-search-tab">
            <h3 className="visual-search-title">🔍 Visual Search</h3>
            <p className="visual-search-description">
                Search for visually similar images in your knowledge base using AI.
            </p>

            {/* Upload zone */}
            <div
                className={`visual-search-dropzone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                />
                {previewUrl ? (
                    <img src={previewUrl} alt="Query" className="visual-search-query-preview" />
                ) : (
                    <div className="visual-search-empty">
                        <span className="visual-search-icon">🖼️</span>
                        <p>Drop an image here or click to search</p>
                    </div>
                )}
            </div>

            {/* Error */}
            {error && <div className="visual-search-error">{error}</div>}

            {/* Loading */}
            {searching && (
                <div className="visual-search-loading">
                    <span className="spinner-dot" /> Searching...
                </div>
            )}

            {/* Results */}
            {results.length > 0 && (
                <div className="visual-search-results">
                    <h4>Results ({results.length})</h4>
                    <div className="visual-search-grid">
                        {results.map((result) => (
                            <div key={result.knowledge_id} className="visual-search-result-card">
                                {workspaceId && (
                                    <img
                                        src={getKnowledgeThumbnailUrl(workspaceId, result.knowledge_id)}
                                        alt={result.title || result.ai_title || ''}
                                        className="visual-search-result-thumb"
                                    />
                                )}
                                <div className="visual-search-result-info">
                                    <span className="visual-search-result-title">
                                        {result.title || result.ai_title || 'Untitled'}
                                    </span>
                                    <span className="visual-search-result-score">
                                        {Math.round(result.score * 100)}% match
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* No results */}
            {!searching && results.length === 0 && previewUrl && !error && (
                <div className="visual-search-no-results">
                    No similar images found. Upload more images to your knowledge base.
                </div>
            )}
        </div>
    )
}
