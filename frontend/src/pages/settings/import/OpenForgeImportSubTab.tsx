import { useState, useCallback, useRef } from 'react'
import {
    Upload, FileUp, Loader2, CheckCircle2, AlertCircle,
    X, Archive, FolderOpen, MessageSquare, BookOpen,
} from 'lucide-react'

/* ── Types ──────────────────────────────────────────────────────────────── */

interface OpenForgeImportResult {
    success: boolean
    workspaces_imported: number
    knowledge_count: number
    chat_count: number
    errors: string[]
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function OpenForgeImportSubTab() {
    const [file, setFile] = useState<File | null>(null)
    const [dragActive, setDragActive] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [progress, setProgress] = useState<string | null>(null)
    const [result, setResult] = useState<OpenForgeImportResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    const fileInputRef = useRef<HTMLInputElement>(null)

    /* ── File handling ──────────────────────────────────────────────────── */

    const handleFile = useCallback((f: File) => {
        if (!f.name.endsWith('.zip')) {
            setError('Please select a .zip file.')
            return
        }
        setFile(f)
        setResult(null)
        setError(null)
        setProgress(null)
    }, [])

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragActive(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFile(f)
    }, [handleFile])

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragActive(true)
    }, [])

    const onDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragActive(false)
    }, [])

    const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) handleFile(f)
    }, [handleFile])

    const reset = useCallback(() => {
        setFile(null)
        setResult(null)
        setError(null)
        setProgress(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [])

    /* ── Upload action ──────────────────────────────────────────────────── */

    const handleUpload = useCallback(async () => {
        if (!file) return
        setUploading(true)
        setResult(null)
        setError(null)
        setProgress('Uploading archive...')

        try {
            const formData = new FormData()
            formData.append('file', file)

            setProgress('Uploading and importing...')

            const response = await fetch('/api/v1/import/openforge', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => null)
                throw new Error(errorData?.detail ?? `Import failed (${response.status})`)
            }

            const data = await response.json()
            setResult({
                success: true,
                workspaces_imported: data.workspaces_imported ?? data.workspaces ?? 0,
                knowledge_count: data.knowledge_count ?? data.knowledge ?? 0,
                chat_count: data.chat_count ?? data.chats ?? 0,
                errors: data.errors ?? [],
            })
            setProgress(null)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Import failed'
            setError(msg)
            setProgress(null)
        } finally {
            setUploading(false)
        }
    }, [file])

    /* ── Render ─────────────────────────────────────────────────────────── */

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h3 className="font-semibold text-sm">Import from OpenForge</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Import a ZIP archive previously exported from OpenForge. If the archive contains
                    multiple workspaces, all will be imported. If it contains a single workspace, it
                    will be added to your workspace list. Knowledge items and agent conversations
                    will be restored.
                </p>
            </div>

            {/* ── Upload card ───────────────────────────────────────────────── */}
            <div className="glass-card p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-accent/25 flex items-center justify-center text-accent text-[11px] font-bold">
                        <Archive className="w-3 h-3" />
                    </div>
                    <h4 className="text-sm font-medium">Upload OpenForge Export</h4>
                </div>

                {/* Drop zone */}
                <div
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
                        dragActive
                            ? 'border-accent bg-accent/15 shadow-glass-sm'
                            : file
                                ? 'border-emerald-500/40 bg-emerald-500/5'
                                : 'border-border/50 hover:border-border hover:bg-muted/10'
                    }`}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".zip"
                        onChange={onFileSelect}
                        className="hidden"
                    />

                    {file ? (
                        <div className="flex flex-col items-center gap-2">
                            <FileUp className="w-8 h-8 text-emerald-400" />
                            <div>
                                <p className="text-sm font-medium text-emerald-300">{file.name}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {file.size < 1024 * 1024
                                        ? `${(file.size / 1024).toFixed(1)} KB`
                                        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                                    }
                                </p>
                            </div>
                            <button
                                onClick={e => { e.stopPropagation(); reset() }}
                                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
                            >
                                <X className="w-3 h-3" /> Remove and choose another file
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <Upload className={`w-8 h-8 ${dragActive ? 'text-accent' : 'text-muted-foreground/70'}`} />
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    <span className="text-accent font-medium">Click to upload</span> or drag and drop
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Accepts .zip files exported from OpenForge
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Upload button */}
                {file && !result && (
                    <div className="flex items-center justify-end mt-4 pt-3 border-t border-border/50">
                        {progress && (
                            <p className="text-xs text-muted-foreground mr-auto flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {progress}
                            </p>
                        )}
                        <button
                            className="btn-primary text-xs py-2 px-5 gap-2"
                            onClick={handleUpload}
                            disabled={uploading}
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Importing...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    Import Archive
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300 mt-3">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}
            </div>

            {/* ── Result ────────────────────────────────────────────────────── */}
            {result && (
                <div className={`glass-card p-4 rounded-xl border ${
                    result.success ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'
                }`}>
                    <div className="flex items-start gap-3">
                        {result.success ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${result.success ? 'text-emerald-300' : 'text-red-300'}`}>
                                {result.success ? 'Import Complete' : 'Import Failed'}
                            </p>

                            {result.success && (
                                <div className="flex flex-wrap gap-3 mt-3">
                                    <div className="glass-card px-3 py-2 rounded-lg border-border/50">
                                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">
                                            <FolderOpen className="w-3 h-3" />
                                            Workspaces
                                        </div>
                                        <p className="text-lg font-semibold text-foreground">{result.workspaces_imported}</p>
                                    </div>
                                    <div className="glass-card px-3 py-2 rounded-lg border-border/50">
                                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">
                                            <BookOpen className="w-3 h-3" />
                                            Knowledge Items
                                        </div>
                                        <p className="text-lg font-semibold text-foreground">{result.knowledge_count}</p>
                                    </div>
                                    <div className="glass-card px-3 py-2 rounded-lg border-border/50">
                                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">
                                            <MessageSquare className="w-3 h-3" />
                                            Conversations
                                        </div>
                                        <p className="text-lg font-semibold text-foreground">{result.chat_count}</p>
                                    </div>
                                </div>
                            )}

                            {result.errors.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    {result.errors.map((err, i) => (
                                        <p key={i} className="text-xs text-red-300/80">{err}</p>
                                    ))}
                                </div>
                            )}

                            {result.success && (
                                <button
                                    onClick={reset}
                                    className="text-xs text-accent hover:text-accent/80 mt-3 inline-flex items-center gap-1"
                                >
                                    <Upload className="w-3 h-3" /> Import another archive
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
