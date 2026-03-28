import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Upload, X, Presentation } from 'lucide-react'
import ModalShell from '@/components/knowledge/shared/ModalShell'
import TagInput from '@/components/knowledge/shared/TagInput'
import { uploadKnowledge, updateKnowledge, updateKnowledgeTags } from '@/lib/api'
import { ACCEPTED_MIMES } from '@/lib/quick-knowledge'

interface SlidesCreateModalProps {
    isOpen: boolean
    onClose: () => void
    workspaceId: string
    onCreated?: (knowledge: any) => void
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SlidesCreateModal({ isOpen, onClose, workspaceId, onCreated }: SlidesCreateModalProps) {
    const qc = useQueryClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [file, setFile] = useState<File | null>(null)
    const [title, setTitle] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [dragOver, setDragOver] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = () => {
        setFile(null)
        setTitle('')
        setTags([])
        setDragOver(false)
        setError(null)
    }

    const handleClose = () => {
        reset()
        onClose()
    }

    const handleFileSelect = useCallback((f: File) => {
        setFile(f)
        setError(null)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFileSelect(f)
    }, [handleFileSelect])

    const handleSave = async () => {
        if (!file) {
            setError('Please select a slides file.')
            return
        }
        setSaving(true)
        setError(null)
        try {
            const result = await uploadKnowledge(workspaceId, file)
            // Persist user-provided title
            if (title.trim() && result?.id) {
                await updateKnowledge(workspaceId, result.id, { title: title.trim() })
            }
            // Persist tags via dedicated endpoint
            if (tags.length > 0 && result?.id) {
                await updateKnowledgeTags(workspaceId, result.id, tags)
            }
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            onCreated?.(result)
            reset()
            onClose()
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to upload. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={handleClose}
            title="Upload Slides"
            size="md"
            footer={
                <>
                    <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={handleClose}>
                        Discard
                    </button>
                    <button
                        type="button"
                        className="btn-primary text-xs py-1.5 px-4 gap-1.5"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                    </button>
                </>
            }
        >
            {/* Drop zone */}
            <div
                className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all cursor-pointer
                    ${dragOver ? 'border-accent bg-accent/5 scale-[1.01]' : file ? 'border-accent/40 bg-accent/5' : 'border-border/25 hover:border-accent/50 hover:bg-muted/10'}`}
                style={{ minHeight: file ? undefined : '9rem' }}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !file && fileInputRef.current?.click()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_MIMES.slides}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
                    className="hidden"
                />
                {file ? (
                    <div className="flex items-center gap-3 w-full p-3">
                        <div className="w-16 h-16 rounded-lg bg-muted/40 border border-border/25 flex items-center justify-center flex-shrink-0">
                            <Presentation className="w-7 h-7 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(file.size)}</p>
                        </div>
                        <button
                            type="button"
                            className="btn-ghost p-1.5 flex-shrink-0"
                            onClick={e => { e.stopPropagation(); setFile(null) }}
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 text-center p-6">
                        <div className="w-11 h-11 rounded-xl bg-muted/40 border border-border/25 flex items-center justify-center">
                            <Upload className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-sm text-foreground">
                                Drag & drop or <span className="text-accent font-medium">click to browse</span>
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">Slides (.pptx, .ppt)</p>
                        </div>
                    </div>
                )}
            </div>

            <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title (optional)"
                className="w-full input text-sm"
            />

            <TagInput tags={tags} onChange={setTags} placeholder="Add tags..." />

            {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {error}
                </p>
            )}
        </ModalShell>
    )
}
