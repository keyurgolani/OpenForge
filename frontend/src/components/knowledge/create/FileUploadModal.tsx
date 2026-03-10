import { useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { uploadKnowledge } from '@/lib/api'
import {
    Image as ImageIcon, Music, FileType2, FileText, Table, Presentation,
    X, Loader2, Upload,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ACCEPTED_MIMES, KNOWLEDGE_TYPE_LABELS, type QuickKnowledgeType } from '@/lib/quick-knowledge'

interface FileUploadModalProps {
    type: QuickKnowledgeType
    open: boolean
    onClose: () => void
    onSuccess: (knowledge: any) => void
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    image: ImageIcon,
    audio: Music,
    pdf: FileType2,
    docx: FileText,
    xlsx: Table,
    pptx: Presentation,
}

const TYPE_COLORS: Record<string, string> = {
    image: 'text-pink-400',
    audio: 'text-orange-400',
    pdf: 'text-red-400',
    docx: 'text-blue-300',
    xlsx: 'text-green-300',
    pptx: 'text-amber-400',
}

const TYPE_DESCRIPTIONS: Record<string, string> = {
    image: 'Upload an image — OCR text extraction, AI-powered description, and visual search.',
    audio: 'Upload an audio file for automatic Whisper transcription and AI title.',
    pdf: 'Upload a PDF document for full text extraction and semantic search.',
    docx: 'Upload a Word document for structure-preserving content extraction.',
    xlsx: 'Upload an Excel spreadsheet for table data extraction and indexing.',
    pptx: 'Upload a PowerPoint for slide-by-slide content extraction.',
}

export default function FileUploadModal({ type, open, onClose, onSuccess }: FileUploadModalProps) {
    const { workspaceId } = useParams<{ workspaceId: string }>()
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const TypeIcon = TYPE_ICONS[type] ?? FileText
    const typeColor = TYPE_COLORS[type] ?? 'text-muted-foreground'
    const acceptMimes = ACCEPTED_MIMES[type] ?? '*'

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
        if (preview) URL.revokeObjectURL(preview)
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

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md"
                        onClick={handleClose}
                    />

                    {/* Centered dialog */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4">
                        <motion.div
                            key="dialog"
                            initial={{ scale: 0.92, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.92, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', damping: 22, stiffness: 300, mass: 0.8 }}
                            className="pointer-events-auto w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-glass-lg overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Inner glow */}
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

                            <div className="p-5 space-y-4">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className={`w-8 h-8 rounded-lg bg-muted/40 border border-border/60 flex items-center justify-center`}>
                                            <TypeIcon className={`w-4 h-4 ${typeColor}`} />
                                        </div>
                                        <div>
                                            <h2 className="text-sm font-semibold">Upload {KNOWLEDGE_TYPE_LABELS[type]}</h2>
                                        </div>
                                    </div>
                                    <button className="btn-ghost p-1.5" onClick={handleClose}>
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <p className="text-xs text-muted-foreground leading-relaxed">{TYPE_DESCRIPTIONS[type]}</p>

                                {/* Drop zone */}
                                <div
                                    className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all cursor-pointer
                                        ${dragOver
                                            ? 'border-accent bg-accent/5 scale-[1.01]'
                                            : file
                                                ? 'border-accent/40 bg-accent/5'
                                                : 'border-border/60 hover:border-accent/50 hover:bg-muted/20'
                                        }`}
                                    style={{ minHeight: file ? undefined : '10rem' }}
                                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={handleDrop}
                                    onClick={() => !file && inputRef.current?.click()}
                                >
                                    <input
                                        ref={inputRef}
                                        type="file"
                                        accept={acceptMimes}
                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                                        className="hidden"
                                    />

                                    {file ? (
                                        <div className="flex items-center gap-3 w-full p-3">
                                            {preview ? (
                                                <img
                                                    src={preview}
                                                    alt="Preview"
                                                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-border/50"
                                                />
                                            ) : (
                                                <div className="w-16 h-16 rounded-lg bg-muted/40 border border-border/60 flex items-center justify-center flex-shrink-0">
                                                    <TypeIcon className={`w-7 h-7 ${typeColor}`} />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{file.name}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">{formatSize(file.size)}</p>
                                            </div>
                                            <button
                                                className="btn-ghost p-1.5 flex-shrink-0"
                                                onClick={e => { e.stopPropagation(); reset() }}
                                                title="Remove file"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 text-center p-6">
                                            <div className="w-12 h-12 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-center">
                                                <Upload className="w-5 h-5 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <p className="text-sm text-foreground">
                                                    Drag & drop a file here, or{' '}
                                                    <span className="text-accent font-medium">browse</span>
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">Max 100 MB</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Error */}
                                {error && (
                                    <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                        {error}
                                    </p>
                                )}

                                {/* Actions */}
                                <div className="flex justify-end gap-2 pt-1">
                                    <button className="btn-ghost text-sm px-4 py-2" onClick={handleClose}>
                                        Cancel
                                    </button>
                                    <button
                                        className="btn-primary text-sm px-4 py-2 gap-2"
                                        disabled={!file || uploading}
                                        onClick={handleUpload}
                                    >
                                        {uploading ? (
                                            <>
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                Uploading…
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-3.5 h-3.5" />
                                                Upload
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    )
}
