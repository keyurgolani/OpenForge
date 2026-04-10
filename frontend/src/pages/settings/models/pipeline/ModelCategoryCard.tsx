import { useState } from 'react'
import { Loader2, Download, Trash2, CheckCircle, HardDrive, AlertCircle, Plus } from 'lucide-react'

interface ModelItem {
    model_id: string
    name: string
    downloaded: boolean
    downloading?: boolean
    disk_size: string | null
    estimated_size?: string | null
    is_default: boolean
}

interface ModelCategoryCardProps {
    category: string
    displayName: string
    models: ModelItem[]
    totalDiskSize: string | null
    usedBy: string[]
    /** Set of model IDs that are already added to configured models */
    addedModels?: Set<string>
    onDownload: (modelId: string) => Promise<void>
    onDelete: (modelId: string) => Promise<void>
    /** Add a downloaded model to the system configured models */
    onAdd?: (modelId: string) => void
}

export function ModelCategoryCard({
    category, displayName, models, totalDiskSize, usedBy,
    addedModels, onDownload, onDelete, onAdd,
}: ModelCategoryCardProps) {
    const [busy, setBusy] = useState<string | null>(null)
    const downloadedCount = models.filter(m => m.downloaded).length

    const handleDownload = async (modelId: string) => {
        setBusy(modelId)
        try { await onDownload(modelId) } finally { setBusy(null) }
    }

    const handleDelete = async (modelId: string) => {
        setBusy(modelId)
        try { await onDelete(modelId) } finally { setBusy(null) }
    }

    return (
        <div className="glass-card p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-semibold">{displayName}</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                        {downloadedCount}/{models.length} models downloaded
                        {totalDiskSize && <span className="ml-2 inline-flex items-center gap-0.5"><HardDrive className="w-2.5 h-2.5" />{totalDiskSize}</span>}
                    </p>
                </div>
                {usedBy.length > 0 && (
                    <div className="text-[9px] text-muted-foreground/60 text-right">
                        <span className="font-medium">Used by:</span>{' '}
                        {usedBy.join(', ')}
                    </div>
                )}
            </div>

            {/* Models list */}
            <div className="space-y-1">
                {models.map(model => {
                    const isDownloading = model.downloading
                    const isBusy = busy === model.model_id
                    const isAdded = addedModels?.has(model.model_id) ?? false
                    const sizeLabel = model.downloaded
                        ? model.disk_size ?? 'Downloaded'
                        : model.estimated_size
                            ? `${model.estimated_size}`
                            : 'Not downloaded'

                    return (
                        <div key={model.model_id} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg bg-muted/10">
                            <div className="flex items-center gap-2 min-w-0">
                                {model.downloaded
                                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                    : (isDownloading || isBusy)
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-accent flex-shrink-0" />
                                        : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                                }
                                <div className="min-w-0">
                                    <p className="text-xs font-medium truncate">{model.name}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {(isDownloading || isBusy) && !model.downloaded ? 'Downloading...' : sizeLabel}
                                        {isAdded && <span className="ml-1 text-accent">(configured)</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                {isDownloading ? (
                                    <span className="text-[10px] text-muted-foreground/60 px-2">Downloading...</span>
                                ) : isBusy ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                                ) : model.downloaded ? (
                                    <>
                                        {onAdd && !isAdded && (
                                            <button onClick={() => onAdd(model.model_id)}
                                                className="text-[10px] text-accent/70 hover:text-accent flex items-center gap-1 px-2 py-1 rounded hover:bg-accent/10 transition-colors"
                                                title="Add to configured models">
                                                <Plus className="w-3 h-3" /> Add
                                            </button>
                                        )}
                                        <button onClick={() => handleDelete(model.model_id)}
                                            className="text-[10px] text-red-400/70 hover:text-red-400 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                                            title="Remove model">
                                            <Trash2 className="w-3 h-3" /> Remove
                                        </button>
                                    </>
                                ) : (
                                    <button onClick={() => handleDownload(model.model_id)}
                                        className="text-[10px] text-accent/80 hover:text-accent flex items-center gap-1 px-2 py-1 rounded hover:bg-accent/10 transition-colors"
                                        title={`Download model${model.estimated_size ? ` (${model.estimated_size})` : ''}`}>
                                        <Download className="w-3 h-3" /> Download
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
