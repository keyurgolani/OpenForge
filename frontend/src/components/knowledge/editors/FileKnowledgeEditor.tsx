import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
    getKnowledgeFileUrl,
    getKnowledgeThumbnailUrl,
    updateKnowledge,
    updateKnowledgeTags,
    generateKnowledgeIntelligence,
} from '@/lib/api'

interface FileKnowledgeEditorProps {
    knowledge: any
    onUpdate: (updated: any) => void
}

export default function FileKnowledgeEditor({ knowledge, onUpdate }: FileKnowledgeEditorProps) {
    const { workspaceId } = useParams<{ workspaceId: string }>()
    const [title, setTitle] = useState(knowledge.title || knowledge.ai_title || '')
    const [tagInput, setTagInput] = useState('')
    const [tags, setTags] = useState<string[]>(knowledge.tags || [])
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [savingTitle, setSavingTitle] = useState(false)

    const type = knowledge.type
    const fileUrl = workspaceId ? getKnowledgeFileUrl(workspaceId, knowledge.id) : ''
    const thumbnailUrl = workspaceId ? getKnowledgeThumbnailUrl(workspaceId, knowledge.id) : ''
    const metadata = knowledge.file_metadata || {}

    const handleSaveTitle = async () => {
        if (!workspaceId) return
        setSavingTitle(true)
        try {
            const updated = await updateKnowledge(workspaceId, knowledge.id, { title })
            onUpdate(updated)
        } catch (err) {
            console.error('Failed to save title:', err)
        } finally {
            setSavingTitle(false)
        }
    }

    const handleAddTag = async () => {
        const tag = tagInput.trim().toLowerCase()
        if (!tag || tags.includes(tag) || !workspaceId) return
        const newTags = [...tags, tag]
        setTags(newTags)
        setTagInput('')
        try {
            await updateKnowledgeTags(workspaceId, knowledge.id, newTags)
        } catch (err) {
            console.error('Failed to add tag:', err)
        }
    }

    const handleRemoveTag = async (tag: string) => {
        if (!workspaceId) return
        const newTags = tags.filter((t) => t !== tag)
        setTags(newTags)
        try {
            await updateKnowledgeTags(workspaceId, knowledge.id, newTags)
        } catch (err) {
            console.error('Failed to remove tag:', err)
        }
    }

    const handleReAnalyze = async () => {
        if (!workspaceId) return
        setIsAnalyzing(true)
        try {
            const updated = await generateKnowledgeIntelligence(workspaceId, knowledge.id)
            onUpdate(updated)
        } catch (err) {
            console.error('Re-analyze failed:', err)
        } finally {
            setIsAnalyzing(false)
        }
    }

    return (
        <div className="file-editor">
            {/* Processing Banner */}
            {knowledge.embedding_status === 'processing' && (
                <div className="file-editor-processing">
                    <span className="spinner-dot" /> Processing content — this may take a moment...
                </div>
            )}

            <div className="file-editor-layout">
                {/* Main Content Area */}
                <div className="file-editor-main">
                    {/* Title */}
                    <div className="file-editor-title-section">
                        <input
                            className="file-editor-title-input"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={handleSaveTitle}
                            placeholder="Untitled"
                        />
                        {savingTitle && <span className="file-editor-saving">Saving...</span>}
                    </div>

                    {/* Type-specific main content */}
                    {type === 'image' && (
                        <div className="file-editor-image-viewer">
                            <img
                                src={fileUrl}
                                alt={title || 'Image'}
                                className="file-editor-full-image"
                            />
                        </div>
                    )}

                    {type === 'audio' && (
                        <div className="file-editor-audio-section">
                            <audio controls src={fileUrl} className="file-editor-audio-player" />
                            <div className="file-editor-audio-badges">
                                {metadata.duration != null && (
                                    <span className="file-editor-badge">
                                        ⏱ {Math.floor(metadata.duration / 60)}:
                                        {String(Math.floor(metadata.duration % 60)).padStart(2, '0')}
                                    </span>
                                )}
                                {metadata.format && <span className="file-editor-badge">🎶 {metadata.format}</span>}
                                {metadata.sample_rate && <span className="file-editor-badge">{metadata.sample_rate} Hz</span>}
                                {metadata.channels && <span className="file-editor-badge">🔊 {metadata.channels}ch</span>}
                            </div>
                        </div>
                    )}

                    {type === 'pdf' && knowledge.thumbnail_path && (
                        <div className="file-editor-pdf-thumbnail">
                            <img src={thumbnailUrl} alt="First page" />
                        </div>
                    )}

                    {/* Extracted Content */}
                    {knowledge.content && (
                        <div className="file-editor-content-section">
                            <h3>
                                {type === 'audio' ? 'Transcript' : 'Extracted Content'}
                            </h3>
                            <div className="file-editor-content-body">
                                {knowledge.content}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="file-editor-sidebar">
                    {/* Actions */}
                    <div className="file-editor-sidebar-section">
                        <h4>Actions</h4>
                        <a href={fileUrl} download className="file-editor-action-btn">
                            ⬇ Download Original
                        </a>
                        <button
                            className="file-editor-action-btn"
                            onClick={handleReAnalyze}
                            disabled={isAnalyzing}
                        >
                            {isAnalyzing ? '🔄 Analyzing...' : '🔄 Re-analyze'}
                        </button>
                    </div>

                    {/* AI Description (Image) */}
                    {type === 'image' && knowledge.ai_summary && (
                        <div className="file-editor-sidebar-section">
                            <h4>AI Description</h4>
                            <p className="file-editor-ai-text">{knowledge.ai_summary}</p>
                        </div>
                    )}

                    {/* Metadata */}
                    <div className="file-editor-sidebar-section">
                        <h4>File Info</h4>
                        <div className="file-editor-meta-list">
                            {knowledge.file_size && (
                                <div className="file-editor-meta-row">
                                    <span>Size</span>
                                    <span>{formatFileSize(knowledge.file_size)}</span>
                                </div>
                            )}
                            {knowledge.mime_type && (
                                <div className="file-editor-meta-row">
                                    <span>Type</span>
                                    <span>{knowledge.mime_type}</span>
                                </div>
                            )}
                            {metadata.page_count != null && (
                                <div className="file-editor-meta-row">
                                    <span>Pages</span>
                                    <span>{metadata.page_count}</span>
                                </div>
                            )}
                            {metadata.word_count != null && (
                                <div className="file-editor-meta-row">
                                    <span>Words</span>
                                    <span>{metadata.word_count}</span>
                                </div>
                            )}
                            {metadata.slide_count != null && (
                                <div className="file-editor-meta-row">
                                    <span>Slides</span>
                                    <span>{metadata.slide_count}</span>
                                </div>
                            )}
                            {metadata.total_sheets != null && (
                                <div className="file-editor-meta-row">
                                    <span>Sheets</span>
                                    <span>{metadata.total_sheets}</span>
                                </div>
                            )}
                            {metadata.author && (
                                <div className="file-editor-meta-row">
                                    <span>Author</span>
                                    <span>{metadata.author}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* EXIF (Image) */}
                    {type === 'image' && metadata.exif && Object.keys(metadata.exif).length > 0 && (
                        <details className="file-editor-sidebar-section file-editor-collapsible">
                            <summary><h4>EXIF Data</h4></summary>
                            <div className="file-editor-meta-list">
                                {Object.entries(metadata.exif).map(([k, v]) => (
                                    <div key={k} className="file-editor-meta-row">
                                        <span>{k}</span>
                                        <span>{String(v)}</span>
                                    </div>
                                ))}
                            </div>
                        </details>
                    )}

                    {/* OCR Text (Image) */}
                    {type === 'image' && metadata.ocr_text && (
                        <details className="file-editor-sidebar-section file-editor-collapsible">
                            <summary><h4>OCR Text</h4></summary>
                            <pre className="file-editor-ocr-text">{metadata.ocr_text}</pre>
                        </details>
                    )}

                    {/* Sheet names (XLSX) */}
                    {type === 'xlsx' && metadata.sheet_names && metadata.sheet_names.length > 0 && (
                        <div className="file-editor-sidebar-section">
                            <h4>Sheets</h4>
                            <ul className="file-editor-sheet-list">
                                {metadata.sheet_names.map((name: string) => (
                                    <li key={name}>{name}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Slide titles (PPTX) */}
                    {type === 'pptx' && metadata.slide_titles && metadata.slide_titles.length > 0 && (
                        <div className="file-editor-sidebar-section">
                            <h4>Slide Outline</h4>
                            <ol className="file-editor-slide-list">
                                {metadata.slide_titles.map((t: string, i: number) => (
                                    <li key={i}>{t}</li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {/* Tags */}
                    <div className="file-editor-sidebar-section">
                        <h4>Tags</h4>
                        <div className="file-editor-tags">
                            {tags.map((tag) => (
                                <span key={tag} className="file-editor-tag">
                                    #{tag}
                                    <button onClick={() => handleRemoveTag(tag)}>×</button>
                                </span>
                            ))}
                        </div>
                        <div className="file-editor-tag-input">
                            <input
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                                placeholder="Add tag..."
                            />
                        </div>
                    </div>

                    {/* Timestamps */}
                    <div className="file-editor-sidebar-section file-editor-timestamps">
                        <div className="file-editor-meta-row">
                            <span>Created</span>
                            <span>{new Date(knowledge.created_at).toLocaleString()}</span>
                        </div>
                        <div className="file-editor-meta-row">
                            <span>Updated</span>
                            <span>{new Date(knowledge.updated_at).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
