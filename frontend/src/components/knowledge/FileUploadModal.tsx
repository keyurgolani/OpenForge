/**
 * File Upload Modal for Knowledge items.
 *
 * Handles uploading files (images, audio, PDF) and creating knowledge entries.
 */
import { useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, X, Loader2, FileIcon, Image, Music, FileText } from 'lucide-react'
import { uploadKnowledgeFile } from '@/lib/api'
import { useToast } from '@/components/shared/ToastProvider'

export type FileUploadType = 'image' | 'audio' | 'pdf'

interface FileUploadModalProps {
    open: boolean
    type: FileUploadType
    onClose: () => void
    onSuccess?: (knowledge: any) => void
}

const TYPE_CONFIG: Record<FileUploadType, {
    accept: string
    label: string
    icon: typeof Image
    color: string
    maxSizeMB: number
}> = {
    image: {
        accept: 'image/*',
        label: 'Image',
        icon: Image,
        color: 'text-pink-400',
        maxSizeMB: 20,
    },
    audio: {
        accept: 'audio/*',
        label: 'Audio',
        icon: Music,
        color: 'text-purple-400',
        maxSizeMB: 100,
    },
    pdf: {
        accept: 'application/pdf',
        label: 'PDF',
        icon: FileText,
        color: 'text-red-400',
        maxSizeMB: 50,
    },
}

export function FileUploadModal({ open, type, onClose, onSuccess }: FileUploadModalProps) {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const qc = useQueryClient()
    const { error: showError } = useToast()

    const [file, setFile] = useState<File | null>(null)
    const [title, setTitle] = useState('')
    const [uploading, setUploading] = useState(false)
    const [dragOver, setDragOver] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)

    const config = TYPE_CONFIG[type]
    const Icon = config.icon

    const resetState = useCallback(() => {
        setFile(null)
        setTitle('')
        setUploading(false)
        setDragOver(false)
    }, [])

    const handleClose = useCallback(() => {
        resetState()
        onClose()
    }, [resetState, onClose])

    const handleFileSelect = useCallback((selectedFile: File) => {
        // Validate file type
        if (type === 'image' && !selectedFile.type.startsWith('image/')) {
            showError('Please select an image file')
            return
        }
        if (type === 'audio' && !selectedFile.type.startsWith('audio/')) {
            showError('Please select an audio file')
            return
        }
        if (type === 'pdf' && selectedFile.type !== 'application/pdf') {
            showError('Please select a PDF file')
            return
        }

        // Validate file size
        const sizeMB = selectedFile.size / (1024 * 1024)
        if (sizeMB > config.maxSizeMB) {
            showError(`File size exceeds ${config.maxSizeMB}MB limit`)
            return
        }

        setFile(selectedFile)
        // Auto-fill title from filename
        if (!title) {
            const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '')
            setTitle(nameWithoutExt)
        }
    }, [type, config.maxSizeMB, showError, title])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)

        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile) {
            handleFileSelect(droppedFile)
        }
    }, [handleFileSelect])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
    }, [])

    const handleUpload = async () => {
        if (!file) return

        setUploading(true)
        try {
            const result = await uploadKnowledgeFile(workspaceId, file, title || undefined)
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            onSuccess?.(result)
            handleClose()
        } catch (err: any) {
            showError(err.response?.data?.detail || 'Failed to upload file')
        } finally {
            setUploading(false)
        }
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/75 backdrop-blur-sm dark:bg-black/60"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-white/5 ${config.color}`}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-semibold text-white">
                            Upload {config.label}
                        </h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Drop zone */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
                            relative flex flex-col items-center justify-center p-8
                            border-2 border-dashed rounded-xl cursor-pointer
                            transition-all duration-200
                            ${dragOver
                                ? 'border-purple-400 bg-purple-400/10'
                                : 'border-white/20 hover:border-white/40 bg-white/5'
                            }
                        `}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={config.accept}
                            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                            className="hidden"
                        />

                        {file ? (
                            <div className="text-center">
                                <FileIcon className="w-12 h-12 mx-auto mb-3 text-green-400" />
                                <p className="text-white font-medium">{file.name}</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                            </div>
                        ) : (
                            <>
                                <Upload className={`w-12 h-12 mb-3 ${config.color}`} />
                                <p className="text-white font-medium">
                                    Drop {config.label.toLowerCase()} here
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    or click to browse
                                </p>
                                <p className="text-xs text-gray-500 mt-2">
                                    Max {config.maxSizeMB}MB
                                </p>
                            </>
                        )}
                    </div>

                    {/* Title input */}
                    <div>
                        <label className="block text-sm text-muted-foreground mb-1.5">
                            Title (optional)
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={`${config.label} title...`}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white
                                     placeholder:text-gray-500 text-sm
                                     focus:outline-none focus:border-purple-400/50"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-4 border-t border-white/10 bg-white/5">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-sm text-muted-foreground hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600
                                     disabled:bg-gray-600 disabled:cursor-not-allowed
                                     text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default FileUploadModal
