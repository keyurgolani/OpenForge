import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import {
    getUnifiedModelStatus,
    downloadWhisperModel, deleteWhisperModel,
    downloadMarkerModel, deleteMarkerModel,
    downloadCLIPModel, deleteCLIPModel,
    downloadEmbeddingModel, deleteEmbeddingModel,
    downloadTTSModel, deleteTTSModel,
    downloadDoclingModel, deleteDoclingModel,
} from '@/lib/api'
import { ModelCategoryCard } from './ModelCategoryCard'

const CATEGORY_USAGE: Record<string, string[]> = {
    whisper: ['Audio Transcription', 'Video Transcription'],
    tts: ['Text-to-Speech'],
    marker: ['PDF Text Extraction'],
    docling: ['PDF Table Extraction', 'Document Analysis'],
    clip: ['Image CLIP Embedding', 'Video CLIP Embedding'],
    embeddings: ['All Knowledge Types'],
}


interface PipelineModelsPageProps {
    /** Filter to specific categories. If omitted, shows all. */
    filter?: string[]
    title?: string
    description?: string
    onModelDeleted?: (category: string, modelId: string) => void
    /** Called when user clicks Add on a downloaded model */
    onModelAdd?: (category: string, modelId: string, modelName: string) => void
    /** Set of model IDs already added to configured models */
    addedModels?: Set<string>
}

export function PipelineModelsPage({ filter, title, description, onModelDeleted, onModelAdd, addedModels }: PipelineModelsPageProps) {
    const qc = useQueryClient()
    const [downloading, setDownloading] = useState<Set<string>>(new Set())

    const { data: status, isLoading } = useQuery({
        queryKey: ['model-status'],
        queryFn: getUnifiedModelStatus,
        refetchInterval: (query) => {
            if (downloading.size > 0) return 3000
            const data = query.state.data as any
            const anyDownloading = data?.categories?.some((c: any) =>
                c.models?.some((m: any) => m.downloading)
            )
            return anyDownloading ? 5000 : false
        },
    })

    const handleDownload = useCallback(async (category: string, modelId: string) => {
        const key = `${category}:${modelId}`
        setDownloading(prev => new Set(prev).add(key))
        try {
            switch (category) {
                case 'whisper': await downloadWhisperModel(modelId); break
                case 'marker': await downloadMarkerModel(); break
                case 'clip': await downloadCLIPModel(modelId); break
                case 'embeddings': await downloadEmbeddingModel(modelId); break
                case 'tts': await downloadTTSModel(modelId); break
                case 'docling': await downloadDoclingModel(); break
            }
        } catch (err) {
            console.error(`Download failed for ${category}/${modelId}:`, err)
        } finally {
            setDownloading(prev => { const next = new Set(prev); next.delete(key); return next })
            await qc.refetchQueries({ queryKey: ['model-status'] })
        }
    }, [qc])

    const handleDelete = useCallback(async (category: string, modelId: string) => {
        try {
            switch (category) {
                case 'whisper': await deleteWhisperModel(modelId); break
                case 'marker': await deleteMarkerModel(); break
                case 'clip': await deleteCLIPModel(modelId); break
                case 'embeddings': await deleteEmbeddingModel(modelId); break
                case 'tts': await deleteTTSModel(modelId); break
                case 'docling': await deleteDoclingModel(); break
            }
        } finally {
            await qc.refetchQueries({ queryKey: ['model-status'] })
            onModelDeleted?.(category, modelId)
        }
    }, [qc, onModelDeleted])



    if (isLoading) return (
        <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
    )

    let categories = status?.categories ?? []
    if (filter) {
        const filterSet = new Set(filter)
        categories = categories.filter((c: any) => filterSet.has(c.category))
    }

    return (
        <div className="space-y-4">
            {(title || description) && (
                <div>
                    {title && <h3 className="font-semibold text-sm">{title}</h3>}
                    {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                </div>
            )}
            <div className="space-y-3">
                {categories.map((cat: any) => {
                    const models = (cat.models ?? []).map((m: any) => ({
                        ...m,
                        downloading: m.downloading || downloading.has(`${cat.category}:${m.model_id}`),
                    }))
                    return (
                        <ModelCategoryCard
                            key={cat.category}
                            category={cat.category}
                            displayName={cat.display_name}
                            models={models}
                            totalDiskSize={cat.total_disk_size}
                            usedBy={CATEGORY_USAGE[cat.category] ?? []}
                            addedModels={addedModels}
                            onDownload={(modelId) => handleDownload(cat.category, modelId)}
                            onDelete={(modelId) => handleDelete(cat.category, modelId)}
                            onAdd={onModelAdd ? (modelId) => {
                                const model = models.find((m: any) => m.model_id === modelId)
                                onModelAdd(cat.category, modelId, model?.name ?? modelId)
                            } : undefined}
                        />
                    )
                })}
            </div>
        </div>
    )
}

export default PipelineModelsPage
