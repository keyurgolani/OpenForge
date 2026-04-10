import { useState, useMemo, useCallback, lazy, Suspense } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Type, Loader2, RefreshCw, CheckCircle, Server } from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import { listSettings, updateSetting, reindexKnowledge, listProviders } from '@/lib/api'
import { PipelineModelsPage } from './PipelineModelsPage'

const OllamaNativeSection = lazy(() => import('@/pages/settings/llm/OllamaNativeSection'))

const CONFIG_KEY = 'system_embedding_models'

export function PipelineEmbeddingsPage() {
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const qc = useQueryClient()

    const configuredModels: ConfiguredModel[] = useMemo(() => {
        const raw = (settings as any[])?.find((s: any) => s.key === CONFIG_KEY)?.value
        if (!raw) return []
        try { return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []) } catch { return [] }
    }, [settings])

    const systemProviderId = useMemo(() => {
        const p = (providers as any[]).find((p: any) => p.is_system)
        return p?.id ?? ''
    }, [providers])

    const addedModelIds = useMemo(() => {
        return new Set(configuredModels.map(m => m.model_id))
    }, [configuredModels])

    const handleModelsChange = useCallback(async (models: ConfiguredModel[]) => {
        await updateSetting(CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
        qc.invalidateQueries({ queryKey: ['settings'] })
    }, [qc])

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

    const handleAddOllamaModel = useCallback((providerId: string, modelId: string, modelName: string) => {
        const exists = configuredModels.some(m => m.provider_id === providerId && m.model_id === modelId)
        if (!exists) {
            handleModelsChange([...configuredModels, {
                provider_id: providerId,
                model_id: modelId,
                model_name: modelName,
                is_default: configuredModels.length === 0,
            }])
        }
    }, [configuredModels, handleModelsChange])

    const [reindexing, setReindexing] = useState(false)
    const [reindexStarted, setReindexStarted] = useState(false)
    const [localExpanded, setLocalExpanded] = useState(true)

    return (
        <div className="space-y-6">
            <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Type className="w-4 h-4" />
                    Text Embeddings
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Configure text embedding models from cloud providers or use local models via OpenForge Local.
                </p>
            </div>

            <ModelTypeSelector
                excludeLocalProvider
                configType="embedding"
                configuredModels={configuredModels}
                onModelsChange={handleModelsChange}
            />

            {/* Unified OpenForge Local section — Ollama + downloadable sentence-transformers */}
            <div className="glass-card-hover transition-all duration-300">
                <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                    onClick={() => setLocalExpanded(p => !p)}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLocalExpanded(p => !p) } }}
                >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center border bg-lime-500/10 border-lime-500/20">
                        <Server className="w-4 h-4 text-lime-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">OpenForge Local</span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Ollama embedding models and downloadable sentence-transformers
                        </p>
                    </div>
                </div>

                {localExpanded && (
                    <div className="border-t border-border/20 px-4 py-4 space-y-4">
                        {/* Ollama embedding models */}
                        {systemProviderId && (
                            <Suspense fallback={<Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}>
                                <OllamaNativeSection
                                    headless
                                    capability="embedding"
                                    configuredModels={configuredModels as any}
                                    systemProviderId={systemProviderId}
                                    onAddModel={handleAddOllamaModel}
                                />
                            </Suspense>
                        )}

                        {/* Downloadable sentence-transformer models */}
                        <div className="border-t border-border/20 pt-3">
                            <PipelineModelsPage
                                filter={['embeddings']}
                                title="Sentence-Transformer Models"
                                description="Download and run locally without Ollama."
                                onModelDeleted={handleModelDeleted}
                                onModelAdd={handleModelAdd}
                                addedModels={addedModelIds}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="border-t border-border/25 pt-4">
                <div className="glass-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-medium">Re-index Knowledge</h4>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Re-process text embeddings for all knowledge using the current model.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                setReindexing(true)
                                try {
                                    await reindexKnowledge()
                                    setReindexStarted(true)
                                    setTimeout(() => setReindexStarted(false), 3000)
                                } finally { setReindexing(false) }
                            }}
                            disabled={reindexing}
                            className="btn-primary text-xs py-1.5 px-4 gap-1.5 flex-shrink-0"
                        >
                            {reindexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            Re-index All Knowledge
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

export default PipelineEmbeddingsPage
