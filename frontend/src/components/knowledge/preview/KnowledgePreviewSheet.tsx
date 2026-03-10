import { useParams } from 'react-router-dom'
import { getKnowledgeFileUrl, getKnowledgeThumbnailUrl } from '@/lib/api'

interface KnowledgePreviewSheetProps {
    knowledge: any
    open: boolean
    onClose: () => void
    onOpenEditor?: () => void
}

export default function KnowledgePreviewSheet({
    knowledge,
    open,
    onClose,
    onOpenEditor,
}: KnowledgePreviewSheetProps) {
    const { workspaceId } = useParams<{ workspaceId: string }>()

    if (!open || !knowledge) return null

    const type = knowledge.type
    const isFileType = ['image', 'audio', 'pdf', 'docx', 'xlsx', 'pptx'].includes(type)
    const fileUrl = workspaceId ? getKnowledgeFileUrl(workspaceId, knowledge.id) : ''
    const thumbnailUrl = workspaceId ? getKnowledgeThumbnailUrl(workspaceId, knowledge.id) : ''
    const metadata = knowledge.file_metadata || {}

    return (
        <div className="knowledge-preview-overlay" onClick={onClose}>
            <div className="knowledge-preview-sheet" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="preview-header">
                    <div className="preview-header-content">
                        <span className="preview-type-badge">{getTypeIcon(type)}</span>
                        <h3 className="preview-title">
                            {knowledge.title || knowledge.ai_title || 'Untitled'}
                        </h3>
                    </div>
                    <div className="preview-header-actions">
                        {onOpenEditor && (
                            <button className="preview-btn preview-btn-primary" onClick={onOpenEditor}>
                                Open Editor
                            </button>
                        )}
                        <button className="preview-close" onClick={onClose}>×</button>
                    </div>
                </div>

                {/* Status */}
                {knowledge.embedding_status === 'processing' && (
                    <div className="preview-processing-banner">
                        <span className="spinner-dot" /> Processing content...
                    </div>
                )}

                {/* Content area */}
                <div className="preview-body">
                    {/* Image Preview */}
                    {type === 'image' && (
                        <div className="preview-image-section">
                            <img
                                src={fileUrl}
                                alt={knowledge.title || 'Image'}
                                className="preview-image"
                            />
                            {knowledge.ai_summary && (
                                <div className="preview-section">
                                    <h4>AI Description</h4>
                                    <p>{knowledge.ai_summary}</p>
                                </div>
                            )}
                            {metadata.ocr_text && (
                                <details className="preview-section preview-collapsible">
                                    <summary>OCR Text</summary>
                                    <pre className="preview-pre">{metadata.ocr_text}</pre>
                                </details>
                            )}
                            {metadata.exif && Object.keys(metadata.exif).length > 0 && (
                                <details className="preview-section preview-collapsible">
                                    <summary>EXIF Metadata</summary>
                                    <div className="preview-metadata-grid">
                                        {Object.entries(metadata.exif).map(([k, v]) => (
                                            <div key={k} className="preview-meta-item">
                                                <span className="preview-meta-label">{k}</span>
                                                <span className="preview-meta-value">{String(v)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    )}

                    {/* Audio Preview */}
                    {type === 'audio' && (
                        <div className="preview-audio-section">
                            <audio controls src={fileUrl} className="preview-audio-player" />
                            <div className="preview-badges">
                                {metadata.duration != null && (
                                    <span className="preview-badge">
                                        ⏱ {Math.floor(metadata.duration / 60)}:{String(Math.floor(metadata.duration % 60)).padStart(2, '0')}
                                    </span>
                                )}
                                {metadata.format && <span className="preview-badge">🎶 {metadata.format}</span>}
                                {metadata.sample_rate && <span className="preview-badge">{metadata.sample_rate} Hz</span>}
                            </div>
                            {knowledge.content && (
                                <div className="preview-section">
                                    <h4>Transcript</h4>
                                    <div className="preview-transcript">{knowledge.content}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PDF Preview */}
                    {type === 'pdf' && (
                        <div className="preview-pdf-section">
                            {knowledge.thumbnail_path && (
                                <img src={thumbnailUrl} alt="First page" className="preview-pdf-thumbnail" />
                            )}
                            <div className="preview-badges">
                                {metadata.page_count && <span className="preview-badge">📄 {metadata.page_count} pages</span>}
                                {metadata.author && <span className="preview-badge">✍️ {metadata.author}</span>}
                            </div>
                            {knowledge.content && (
                                <div className="preview-section">
                                    <h4>Extracted Content</h4>
                                    <div className="preview-content">{knowledge.content.slice(0, 2000)}</div>
                                </div>
                            )}
                            <a href={fileUrl} download className="preview-btn preview-btn-secondary preview-download-btn">
                                ⬇ Download PDF
                            </a>
                        </div>
                    )}

                    {/* DOCX/XLSX/PPTX Preview */}
                    {(type === 'docx' || type === 'xlsx' || type === 'pptx') && (
                        <div className="preview-document-section">
                            <div className="preview-badges">
                                {type === 'docx' && metadata.word_count && (
                                    <span className="preview-badge">📝 {metadata.word_count} words</span>
                                )}
                                {type === 'docx' && metadata.paragraph_count && (
                                    <span className="preview-badge">¶ {metadata.paragraph_count} paragraphs</span>
                                )}
                                {type === 'xlsx' && metadata.total_sheets && (
                                    <span className="preview-badge">📊 {metadata.total_sheets} sheets</span>
                                )}
                                {type === 'xlsx' && metadata.total_rows && (
                                    <span className="preview-badge">📋 {metadata.total_rows} rows</span>
                                )}
                                {type === 'pptx' && metadata.slide_count && (
                                    <span className="preview-badge">📑 {metadata.slide_count} slides</span>
                                )}
                            </div>
                            {knowledge.content && (
                                <div className="preview-section">
                                    <h4>Extracted Content</h4>
                                    <div className="preview-content">{knowledge.content.slice(0, 3000)}</div>
                                </div>
                            )}
                            <a href={fileUrl} download className="preview-btn preview-btn-secondary preview-download-btn">
                                ⬇ Download {type.toUpperCase()}
                            </a>
                        </div>
                    )}

                    {/* Standard/text types — show content directly */}
                    {!isFileType && knowledge.content && (
                        <div className="preview-section">
                            <div className="preview-content">{knowledge.content.slice(0, 3000)}</div>
                        </div>
                    )}
                </div>

                {/* Tags */}
                {knowledge.tags && knowledge.tags.length > 0 && (
                    <div className="preview-tags">
                        {knowledge.tags.map((tag: string) => (
                            <span key={tag} className="preview-tag">#{tag}</span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
        standard: '📝',
        fleeting: '💭',
        bookmark: '🔗',
        gist: '💻',
        image: '🖼️',
        audio: '🎵',
        pdf: '📄',
        docx: '📝',
        xlsx: '📊',
        pptx: '📑',
    }
    return icons[type] || '📝'
}
