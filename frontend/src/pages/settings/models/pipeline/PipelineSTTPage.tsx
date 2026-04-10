import { useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mic } from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import { listSettings, updateSetting, listProviders } from '@/lib/api'
import { PipelineModelsPage } from './PipelineModelsPage'

const CONFIG_KEY = 'system_stt_models'

export function PipelineSTTPage() {
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

    return (
        <div className="space-y-6">
            <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Mic className="w-4 h-4" />
                    Speech-to-Text
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Configure speech-to-text models. Use a provider model (top) or download a local model (below). Provider models override local defaults.
                </p>
            </div>

            <ModelTypeSelector
                excludeLocalProvider
                configType="stt"
                configuredModels={configuredModels}
                onModelsChange={handleModelsChange}
            />

            <div className="border-t border-border/25 pt-4">
                <PipelineModelsPage
                    filter={['whisper']}
                    title="Local Whisper Models"
                    description="Download faster-whisper models for local audio and video transcription. The default local model is used when no provider model is configured above."
                    onModelDeleted={handleModelDeleted}
                    onModelAdd={handleModelAdd}
                    addedModels={addedModelIds}
                />
            </div>
        </div>
    )
}

export default PipelineSTTPage
