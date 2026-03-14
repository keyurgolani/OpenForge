import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, Trash2, RefreshCw, Save, FileText,
    Download, CheckCircle,
} from 'lucide-react'
import {
    listCLIPModels, downloadCLIPModel, deleteCLIPModel, getCLIPDefault, setCLIPDefault,
    listMarkerModels, downloadMarkerModel, deleteMarkerModel,
    reindexImages,
} from '@/lib/api'
import {
    RECOMMENDED_CLIP_MODELS, QUALITY_COLORS, VRAM_TIER_COLORS,
} from '../constants'

// ── CLIP Visual Model Tab ─────────────────────────────────────────────────────
function CLIPTab() {
    const qc = useQueryClient()

    const [clipModel, setClipModel] = useState('')
    const [savingClip, setSavingClip] = useState(false)
    const [savedClip, setSavedClip] = useState(false)
    const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
    const [deletingModel, setDeletingModel] = useState<string | null>(null)
    const [reindexing, setReindexing] = useState(false)
    const [reindexStarted, setReindexStarted] = useState(false)

    const { data: clipStatuses = [], refetch: refetchClip } = useQuery({
        queryKey: ['clip-models'],
        queryFn: listCLIPModels,
    })

    const { data: clipDefault } = useQuery({
        queryKey: ['clip-default'],
        queryFn: getCLIPDefault,
    })

    const clipDownloaded = useMemo(() => {
        const set = new Set<string>()
        for (const m of clipStatuses as { id: string; downloaded: boolean }[]) {
            if (m.downloaded) set.add(m.id)
        }
        return set
    }, [clipStatuses])

    const currentDefault = (clipDefault as { model_id?: string })?.model_id ?? ''
    useEffect(() => { if (currentDefault) setClipModel(currentDefault) }, [currentDefault])

    const handleDownloadClip = async (modelId: string) => {
        setDownloadingModel(modelId)
        try {
            await downloadCLIPModel(modelId)
            refetchClip()
        } finally {
            setDownloadingModel(null)
        }
    }

    const handleDeleteClip = async (modelId: string) => {
        setDeletingModel(modelId)
        try {
            await deleteCLIPModel(modelId)
            refetchClip()
            if (clipModel === modelId) {
                setClipModel('')
                setSavedClip(false)
            }
        } finally {
            setDeletingModel(null)
        }
    }

    const handleSaveClip = async () => {
        if (!clipDownloaded.has(clipModel)) return
        setSavingClip(true)
        try {
            await setCLIPDefault(clipModel)
            qc.invalidateQueries({ queryKey: ['clip-default'] })
            setSavedClip(true)
            setTimeout(() => setSavedClip(false), 2000)
        } finally {
            setSavingClip(false)
        }
    }

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-sm font-medium">CLIP Visual Search Models</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    CLIP models generate visual embeddings for image search. Select and download a model, then set it as default. Changing the default model requires re-processing existing images to update their embeddings.
                </p>
            </div>

            <div className="space-y-1.5">
                {RECOMMENDED_CLIP_MODELS.map(m => {
                    const isSelected = clipModel === m.id
                    const isDownloaded = clipDownloaded.has(m.id)
                    const isDownloading = downloadingModel === m.id
                    const isDeleting = deletingModel === m.id
                    const statusInfo = (clipStatuses as { id: string; disk_size?: string }[]).find(s => s.id === m.id)

                    return (
                        <div
                            key={m.id}
                            className={`glass-card-hover transition-all duration-300 ${isSelected ? 'ring-1 ring-accent/40' : ''}`}
                        >
                            <div className="px-4 py-3 flex items-start gap-3">
                                {/* Radio selector */}
                                <button
                                    type="button"
                                    onClick={() => isDownloaded && setClipModel(m.id)}
                                    disabled={!isDownloaded}
                                    className="mt-1 flex-shrink-0"
                                    title={isDownloaded ? 'Select this model' : 'Download first'}
                                >
                                    <div className={`w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center ${
                                        isSelected ? 'border-accent bg-accent/20' : isDownloaded ? 'border-muted-foreground/40 hover:border-accent/60' : 'border-muted-foreground/20 opacity-40'
                                    }`}>
                                        {isSelected && <div className="w-2 h-2 rounded-full bg-accent" />}
                                    </div>
                                </button>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                        <span className="font-medium text-sm">{m.name}</span>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${QUALITY_COLORS[m.quality]}`}>{m.quality}</span>
                                        <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.diskSize}</span>
                                        <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.vramReq} VRAM</span>
                                        <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.dimension}D</span>
                                        {isDownloaded && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                                                Downloaded{statusInfo?.disk_size ? ` (${statusInfo.disk_size})` : ''}
                                            </span>
                                        )}
                                        {m.recommendedFor?.map(tier => (
                                            <span key={tier} className={`text-[8px] px-1.5 py-0.5 rounded border font-medium ${VRAM_TIER_COLORS[tier]}`}>{tier}</span>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {isDownloaded ? (
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteClip(m.id)}
                                            disabled={isDeleting}
                                            className="p-1.5 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                                            title="Delete model"
                                        >
                                            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => handleDownloadClip(m.id)}
                                            disabled={isDownloading}
                                            className="btn-primary text-xs py-1.5 px-3"
                                            title="Download model"
                                        >
                                            {isDownloading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Downloading…</> : <><Download className="w-3.5 h-3.5" /> Download</>}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Save default button */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={handleSaveClip}
                    disabled={savingClip || !clipModel.trim() || !clipDownloaded.has(clipModel) || clipModel === currentDefault}
                    className="btn-primary text-xs py-1.5 px-4 gap-1.5"
                    title={clipModel && !clipDownloaded.has(clipModel) ? 'Download the model first' : ''}
                >
                    {savingClip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Set as Default
                </button>
                {savedClip && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Saved
                    </span>
                )}
                {currentDefault && (
                    <span className="text-[10px] text-muted-foreground">
                        Current: {RECOMMENDED_CLIP_MODELS.find(m => m.id === currentDefault)?.name || currentDefault}
                    </span>
                )}
            </div>

            {/* Re-index images */}
            <div className="glass-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-medium">Re-index Images</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            Re-process CLIP embeddings for all images using the current model. Runs automatically when you change the default model.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={async () => {
                            setReindexing(true)
                            try {
                                await reindexImages()
                                setReindexStarted(true)
                                setTimeout(() => setReindexStarted(false), 3000)
                            } finally {
                                setReindexing(false)
                            }
                        }}
                        disabled={reindexing}
                        className="btn-primary text-xs py-1.5 px-4 gap-1.5 flex-shrink-0"
                    >
                        {reindexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Re-index All Images
                    </button>
                </div>
                {reindexStarted && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Re-indexing started in background
                    </span>
                )}
            </div>
        </div>
    )
}

// ── PDF Processing Tab ────────────────────────────────────────────────────────
export function PDFProcessingTab() {
    const [deleting, setDeleting] = useState(false)
    const { data: markerModels = [], refetch } = useQuery({
        queryKey: ['marker-models'],
        queryFn: listMarkerModels,
        refetchInterval: (query) => {
            const models = query.state.data as { downloading?: boolean }[] | undefined
            return models?.[0]?.downloading ? 3000 : false
        },
    })

    const model = (markerModels as { id: string; name: string; downloaded: boolean; downloading?: boolean; disk_size: string | null }[])[0]
    const isDownloaded = model?.downloaded ?? false
    const isDownloading = model?.downloading ?? false
    const diskSize = model?.disk_size ?? null
    const [localDownloading, setLocalDownloading] = useState(false)
    const downloading = isDownloading || localDownloading

    const handleDownload = async () => {
        setLocalDownloading(true)
        try {
            await downloadMarkerModel()
            refetch()
        } finally {
            setLocalDownloading(false)
        }
    }

    const handleDelete = async () => {
        setDeleting(true)
        try {
            await deleteMarkerModel()
            refetch()
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-sm font-medium">PDF Processing</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Marker PDF uses deep learning models for layout-aware text extraction from PDFs. Without it, basic PyMuPDF text extraction is used as a fallback.
                </p>
            </div>

            <div className="glass-card-hover transition-all duration-300">
                <div className="px-4 py-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center border bg-red-500/10 border-red-500/20 flex-shrink-0">
                            <FileText className="w-4.5 h-4.5 text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-medium text-sm">Marker PDF</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-purple-500/15 text-purple-300 border-purple-500/30">Best</span>
                                <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">~1.5 GB disk</span>
                                <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">~3 GB VRAM</span>
                                {isDownloaded && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                                        Downloaded{diskSize ? ` (${diskSize})` : ''}
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Layout-aware PDF extraction with table detection, OCR, and markdown output. Produces significantly better results than basic text extraction, especially for PDFs with complex layouts, tables, and multi-column text.
                            </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            {isDownloaded ? (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="p-1.5 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                                    title="Delete model"
                                >
                                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleDownload}
                                    disabled={downloading}
                                    className="btn-primary text-xs py-1.5 px-3"
                                    title="Download model"
                                >
                                    {downloading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Downloading…</> : <><Download className="w-3.5 h-3.5" /> Download</>}
                                </button>
                            )}
                        </div>
                    </div>

                    {!isDownloaded && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                            <p className="text-[11px] text-amber-300/90">
                                Without this model, PDFs will be processed using basic text extraction (PyMuPDF) which may not handle complex layouts, tables, or scanned documents well.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default CLIPTab
