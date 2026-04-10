import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Image, Loader2, RefreshCw, CheckCircle } from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import { listSettings, updateSetting, reindexImages, listProviders } from '@/lib/api'
import { PipelineModelsPage } from './PipelineModelsPage'

const CONFIG_KEY = 'system_clip_models'

export function PipelineCLIPPage() {
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const qc = useQueryClient()

    const configuredModels: ConfiguredModel[] = useMemo(() => {
        const raw = (settings as any[])?.find((s: any) => s.key === CONFIG_KEY)?.value
        if (!raw) return []
        try { return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []) } catch { return [] }
    }, [settings])

    const systemProviderId = useMemo(() => {
        const p = (providers as any[]).find(p => p.is_system)
        return p?.id ?? ''
    }, [providers])

    const addedModelIds = useMemo(() => {
        return new Set(configuredModels.map(m => m.model_id))
    }, [configuredModels])

    const handleModelsChange = async (models: ConfiguredModel[]) => {
        await updateSetting(CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
        qc.invalidateQueries({ queryKey: ['settings'] })
    }

    const handleModelDeleted = useCallback((category: string, modelId: string) => {
        const updated = configuredModels.filter(m => m.model_id !== modelId)
        if (updated.length !== configuredModels.length) {
            handleModelsChange(updated)
        }
    }, [configuredModels, handleModelsChange])

    const handleModelAdd = useCallback((category: string, modelId: string, modelName: string) => {
        if (!systemProviderId) return
        const exists = configuredModels.some(m => m.model_id === modelId)
        if (!exists) {
            handleModelsChange([...configuredModels, {
                provider_id: systemProviderId,
                model_id: modelId,
                model_name: modelName,
                is_default: configuredModels.length === 0,
            }])
        }
    }, [configuredModels, handleModelsChange, systemProviderId])

    const [reindexing, setReindexing] = useState(false)
    const [reindexStarted, setReindexStarted] = useState(false)

    return (
        <div className="space-y-6">
            <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    Vision / CLIP
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Configure CLIP models. Use a provider model (top) or download a local model (below). Provider models override local defaults.
                </p>
            </div>

            <ModelTypeSelector
                excludeLocalProvider
                configType="clip"
                configuredModels={configuredModels}
                onModelsChange={handleModelsChange}
            />

            <div className="border-t border-border/25 pt-4">
                <PipelineModelsPage
                    filter={['clip']}
                    title="Local CLIP Models"
                    description="Download OpenCLIP models for local visual embedding. The default local model is used when no provider model is configured above."
                    onModelDeleted={handleModelDeleted}
                    onModelAdd={handleModelAdd}
                    addedModels={addedModelIds}
                />
            </div>

            <div className="border-t border-border/25 pt-4">
                <div className="glass-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-medium">Re-index Images</h4>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Re-process CLIP embeddings for all images using the current model.
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
                                } finally { setReindexing(false) }
                            }}
                            disabled={reindexing}
                            className="btn-primary text-xs py-1.5 px-4 gap-1.5 flex-shrink-0"
                        >
                            {reindexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            Re-index All Images
                        </button>
                    </div>
                    {reindexStarted && (
                        <p className="text-xs text-emerald-400 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Re-indexing started in background.
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

export default PipelineCLIPPage
