import { useState, useCallback, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listWorkspaces } from '@/lib/api'
import {
    Upload, FileUp, Globe2, BookOpen, Loader2, CheckCircle2, AlertCircle,
    FileText, ChevronRight, X, ExternalLink,
} from 'lucide-react'
import type { WorkspaceRow } from '../types'
import { getWorkspaceIcon } from '../constants'
import {
    parseChromeHTML, parseKarakeepJSON, parseRaindropCSV, parsePocketHTML,
    type ParsedBookmark,
} from './parsers'

/* ── Types ──────────────────────────────────────────────────────────────── */

type ImportFormat = 'chrome' | 'karakeep' | 'raindrop' | 'pocket'

interface ImportResult {
    success: boolean
    imported: number
    skipped: number
    errors: string[]
}

const IMPORT_FORMATS: { id: ImportFormat; label: string; accept: string; icon: typeof Globe2; description: string }[] = [
    { id: 'chrome', label: 'Chrome Bookmarks', accept: '.html,.htm', icon: Globe2, description: 'Export from Chrome: Bookmarks Manager \u2192 \u22ee \u2192 Export bookmarks' },
    { id: 'karakeep', label: 'Karakeep JSON', accept: '.json', icon: BookOpen, description: 'Export from Karakeep as JSON' },
    { id: 'raindrop', label: 'Raindrop CSV', accept: '.csv', icon: FileText, description: 'Export from Raindrop.io as CSV' },
    { id: 'pocket', label: 'Pocket HTML', accept: '.html,.htm', icon: BookOpen, description: 'Export from Pocket: Settings \u2192 Export' },
]

const PARSERS: Record<ImportFormat, (content: string) => ParsedBookmark[]> = {
    chrome: parseChromeHTML,
    karakeep: parseKarakeepJSON,
    raindrop: parseRaindropCSV,
    pocket: parsePocketHTML,
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function BookmarkImportSubTab() {
    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const wsList = workspaces as WorkspaceRow[]

    // State
    const [format, setFormat] = useState<ImportFormat>('chrome')
    const [workspaceId, setWorkspaceId] = useState<string>('')
    const [file, setFile] = useState<File | null>(null)
    const [parsed, setParsed] = useState<ParsedBookmark[] | null>(null)
    const [parseError, setParseError] = useState<string | null>(null)
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<ImportResult | null>(null)
    const [dragActive, setDragActive] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)

    // Auto-select first workspace when list loads
    const firstWsId = wsList[0]?.id
    if (!workspaceId && firstWsId) setWorkspaceId(firstWsId)

    const activeFormat = useMemo(() => IMPORT_FORMATS.find(f => f.id === format)!, [format])

    /* ── File handling ──────────────────────────────────────────────────── */

    const handleFile = useCallback(async (f: File) => {
        setFile(f)
        setParsed(null)
        setParseError(null)
        setResult(null)

        try {
            const content = await f.text()
            const parser = PARSERS[format]
            const items = parser(content)
            if (items.length === 0) {
                setParseError('No bookmarks found in this file. Please check the format and try again.')
                return
            }
            setParsed(items)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to parse file'
            setParseError(msg)
        }
    }, [format])

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
        setParsed(null)
        setParseError(null)
        setResult(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [])

    /* ── Import action ──────────────────────────────────────────────────── */

    const handleImport = useCallback(async () => {
        if (!parsed || !workspaceId) return
        setImporting(true)
        setResult(null)

        try {
            const response = await fetch(`/api/v1/workspaces/${workspaceId}/knowledge/import/bookmarks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookmarks: parsed }),
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => null)
                throw new Error(errorData?.detail ?? `Import failed (${response.status})`)
            }

            const data = await response.json()
            setResult({
                success: true,
                imported: data.imported ?? data.count ?? parsed.length,
                skipped: data.skipped ?? 0,
                errors: data.errors ?? [],
            })
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Import failed'
            setResult({
                success: false,
                imported: 0,
                skipped: 0,
                errors: [msg],
            })
        } finally {
            setImporting(false)
        }
    }, [parsed, workspaceId])

    /* ── Preview helpers ────────────────────────────────────────────────── */

    const previewItems = useMemo(() => (parsed ?? []).slice(0, 8), [parsed])
    const totalCount = parsed?.length ?? 0
    const uniqueTags = useMemo(() => {
        if (!parsed) return []
        const set = new Set<string>()
        parsed.forEach(b => b.tags.forEach(t => set.add(t)))
        return Array.from(set).sort()
    }, [parsed])

    /* ── Render ─────────────────────────────────────────────────────────── */

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h3 className="font-semibold text-sm">Import Bookmarks</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Import bookmarks from other apps. Files are parsed locally in your browser before sending to the server.
                </p>
            </div>

            {/* ── Step 1: Format selection ──────────────────────────────────── */}
            <div className="glass-card p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-accent/25 flex items-center justify-center text-accent text-[11px] font-bold">1</div>
                    <h4 className="text-sm font-medium">Select Format</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {IMPORT_FORMATS.map(f => {
                        const Icon = f.icon
                        const isActive = format === f.id
                        return (
                            <button
                                key={f.id}
                                onClick={() => { setFormat(f.id); reset() }}
                                className={`text-left p-3 rounded-xl border transition-all duration-200 ${
                                    isActive
                                        ? 'border-accent bg-accent/15 shadow-glass-sm ring-1 ring-accent/30'
                                        : 'border-border/20 hover:border-border hover:bg-muted/20'
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Icon className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-muted-foreground'}`} />
                                    <span className={`text-xs font-medium ${isActive ? 'text-foreground' : 'text-foreground/80'}`}>
                                        {f.label}
                                    </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">{f.description}</p>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* ── Step 2: Workspace + file upload ──────────────────────────── */}
            <div className="glass-card p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-accent/25 flex items-center justify-center text-accent text-[11px] font-bold">2</div>
                    <h4 className="text-sm font-medium">Upload File</h4>
                </div>

                {/* Workspace selector */}
                <div className="mb-4">
                    <label className="text-xs text-muted-foreground mb-1.5 block">Target Workspace</label>
                    <select
                        className="input text-xs py-2 pr-8 w-full sm:w-72"
                        value={workspaceId}
                        onChange={e => setWorkspaceId(e.target.value)}
                    >
                        {wsList.length === 0 && <option value="">No workspaces available</option>}
                        {wsList.map(ws => (
                            <option key={ws.id} value={ws.id}>{ws.name}</option>
                        ))}
                    </select>
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
                                : 'border-border/20 hover:border-border hover:bg-muted/10'
                    }`}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={activeFormat.accept}
                        onChange={onFileSelect}
                        className="hidden"
                    />

                    {file ? (
                        <div className="flex flex-col items-center gap-2">
                            <FileUp className="w-8 h-8 text-emerald-400" />
                            <div>
                                <p className="text-sm font-medium text-emerald-300">{file.name}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {(file.size / 1024).toFixed(1)} KB
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
                                    Accepts {activeFormat.accept} files
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Parse error */}
                {parseError && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300 mt-3">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>{parseError}</span>
                    </div>
                )}
            </div>

            {/* ── Step 3: Preview ───────────────────────────────────────────── */}
            {parsed && parsed.length > 0 && (
                <div className="glass-card p-4 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-full bg-accent/25 flex items-center justify-center text-accent text-[11px] font-bold">3</div>
                        <h4 className="text-sm font-medium">Preview & Confirm</h4>
                    </div>

                    {/* Summary stats */}
                    <div className="flex flex-wrap gap-3 mb-4">
                        <div className="glass-card px-3 py-2 rounded-lg border-border/20">
                            <p className="text-[11px] text-muted-foreground">Bookmarks found</p>
                            <p className="text-lg font-semibold text-foreground">{totalCount.toLocaleString()}</p>
                        </div>
                        <div className="glass-card px-3 py-2 rounded-lg border-border/20">
                            <p className="text-[11px] text-muted-foreground">Unique tags</p>
                            <p className="text-lg font-semibold text-foreground">{uniqueTags.length.toLocaleString()}</p>
                        </div>
                        {uniqueTags.length > 0 && (
                            <div className="glass-card px-3 py-2 rounded-lg border-border/20 flex-1 min-w-0">
                                <p className="text-[11px] text-muted-foreground mb-1">Tags</p>
                                <div className="flex flex-wrap gap-1">
                                    {uniqueTags.slice(0, 12).map(tag => (
                                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 border border-accent/20 text-accent">
                                            {tag}
                                        </span>
                                    ))}
                                    {uniqueTags.length > 12 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                                            +{uniqueTags.length - 12} more
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Preview table */}
                    <div className="border border-border/25 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-muted/30 border-b border-border/25">
                                        <th className="text-left px-3 py-2 text-muted-foreground font-medium w-8">#</th>
                                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Title</th>
                                        <th className="text-left px-3 py-2 text-muted-foreground font-medium hidden md:table-cell">URL</th>
                                        <th className="text-left px-3 py-2 text-muted-foreground font-medium hidden lg:table-cell">Tags</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewItems.map((bm, i) => (
                                        <tr key={i} className="border-b border-border/25 last:border-0 hover:bg-muted/10 transition-colors">
                                            <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                                            <td className="px-3 py-2 font-medium max-w-[200px] truncate">{bm.title}</td>
                                            <td className="px-3 py-2 text-muted-foreground max-w-[240px] truncate hidden md:table-cell">
                                                <span className="flex items-center gap-1">
                                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                                    {bm.url}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 hidden lg:table-cell">
                                                <div className="flex flex-wrap gap-1">
                                                    {bm.tags.slice(0, 3).map((tag, ti) => (
                                                        <span key={ti} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 border border-accent/20 text-accent">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                    {bm.tags.length > 3 && (
                                                        <span className="text-[10px] text-muted-foreground">+{bm.tags.length - 3}</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {totalCount > previewItems.length && (
                            <div className="bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground text-center border-t border-border/20">
                                Showing {previewItems.length} of {totalCount.toLocaleString()} bookmarks
                            </div>
                        )}
                    </div>

                    {/* Import target */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/20">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <ChevronRight className="w-3.5 h-3.5" />
                            <span>Importing into</span>
                            {(() => {
                                const ws = wsList.find(w => w.id === workspaceId)
                                if (!ws) return <span className="text-foreground font-medium">unknown workspace</span>
                                return (
                                    <span className="flex items-center gap-1.5 text-foreground font-medium">
                                        <span className="w-4 h-4">{getWorkspaceIcon(ws.icon)}</span>
                                        {ws.name}
                                    </span>
                                )
                            })()}
                        </div>

                        <button
                            className="btn-primary text-xs py-2 px-5 gap-2"
                            onClick={handleImport}
                            disabled={importing || !workspaceId}
                        >
                            {importing ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Importing...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    Import {totalCount.toLocaleString()} Bookmarks
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

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
                                <p className="text-xs text-muted-foreground mt-1">
                                    Successfully imported {result.imported.toLocaleString()} bookmarks
                                    {result.skipped > 0 && `, ${result.skipped} skipped (duplicates)`}
                                    .
                                </p>
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
                                    className="text-xs text-accent hover:text-accent/80 mt-2 inline-flex items-center gap-1"
                                >
                                    <Upload className="w-3 h-3" /> Import more bookmarks
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
