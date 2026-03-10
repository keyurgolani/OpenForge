import { useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { uploadKnowledge } from '@/lib/api'
import { ACCEPTED_MIMES, KNOWLEDGE_TYPE_LABELS, type QuickKnowledgeType } from '@/lib/quick-knowledge'

interface FileUploadModalProps {
    type: QuickKnowledgeType
    open: boolean
    onClose: () => void
    onSuccess: (knowledge: any) => void
}

const TYPE_ICONS: Record<string, string> = {
    image: '🖼️',
    audio: '🎵',
    pdf: '📄',
    docx: '📝',
    xlsx: '📊',
    pptx: '📑',
}

const TYPE_DESCRIPTIONS: Record<string, string> = {
    image: 'Upload an image for OCR text extraction, AI-powered description, and visual search.',
    audio: 'Upload an audio file for automatic transcription and AI title generation.',
    pdf: 'Upload a PDF document for text extraction and semantic search.',
    docx: 'Upload a Word document for content extraction and indexing.',
    xlsx: 'Upload an Excel spreadsheet for table data extraction.',
    pptx: 'Upload a PowerPoint for slide content extraction.',
}

export default function FileUploadModal({ type, open, onClose, onSuccess }: FileUploadModalProps) {
    const { workspaceId } = useParams<{ workspaceId: string }>()
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const acceptMimes = ACCEPTED_MIMES[type] || '*'

    const handleFile = useCallback((f: File) => {
        setFile(f)
        setError(null)
        if (type === 'image' && f.type.startsWith('image/')) {
            const url = URL.createObjectURL(f)
            setPreview(url)
        } else {
            setPreview(null)
        }
    }, [type])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFile(f)
    }, [handleFile])

    const handleUpload = async () => {
        if (!file || !workspaceId) return
        setUploading(true)
        setError(null)
        try {
            const result = await uploadKnowledge(workspaceId, file)
            onSuccess(result)
            reset()
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Upload failed. Please try again.')
        } finally {
            setUploading(false)
        }
    }

    const reset = () => {
        setFile(null)
        setPreview(null)
        setError(null)
        setDragOver(false)
    }

    const handleClose = () => {
        reset()
        onClose()
    }

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    if (!open) return null

    return (
        <div className="file-upload-overlay" onClick={handleClose}>
            <div
                className="file-upload-modal"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="file-upload-header">
                    <div className="file-upload-title-row">
                        <span className="file-upload-icon">{TYPE_ICONS[type] || '📎'}</span>
                        <h2>Upload {KNOWLEDGE_TYPE_LABELS[type]}</h2>
                    </div>
                    <button className="file-upload-close" onClick={handleClose}>×</button>
                </div>

                <p className="file-upload-description">{TYPE_DESCRIPTIONS[type]}</p>

                {/* Drop zone */}
                <div
                    className={`file-upload-dropzone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept={acceptMimes}
                        onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) handleFile(f)
                        }}
                        style={{ display: 'none' }}
                    />

                    {file ? (
                        <div className="file-upload-preview">
                            {preview ? (
                                <img src={preview} alt="Preview" className="file-upload-preview-image" />
                            ) : (
                                <div className="file-upload-file-icon">
                                    <span>{TYPE_ICONS[type] || '📎'}</span>
                                </div>
                            )}
                            <div className="file-upload-file-info">
                                <span className="file-upload-filename">{file.name}</span>
                                <span className="file-upload-filesize">{formatSize(file.size)}</span>
                            </div>
                            <button
                                className="file-upload-remove"
                                onClick={(e) => { e.stopPropagation(); reset() }}
                            >
                                ✕
                            </button>
                        </div>
                    ) : (
                        <div className="file-upload-empty">
                            <div className="file-upload-empty-icon">{TYPE_ICONS[type] || '📎'}</div>
                            <p>Drag & drop a file here, or <span className="file-upload-browse">browse</span></p>
                            <p className="file-upload-hint">Max 100MB</p>
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="file-upload-error">{error}</div>
                )}

                {/* Actions */}
                <div className="file-upload-actions">
                    <button className="file-upload-cancel" onClick={handleClose}>Cancel</button>
                    <button
                        className="file-upload-submit"
                        disabled={!file || uploading}
                        onClick={handleUpload}
                    >
                        {uploading ? (
                            <span className="file-upload-spinner">
                                <span className="spinner-dot" />
                                Uploading...
                            </span>
                        ) : (
                            'Upload'
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
