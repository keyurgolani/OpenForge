/**
 * TTSPage - Text-to-Speech model configuration
 */

import { useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Volume2 } from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import { listSettings, updateSetting, listProviders } from '@/lib/api'
import { PipelineModelsPage } from '@/pages/settings/models/pipeline/PipelineModelsPage'

const TTS_CONFIG_KEY = 'system_tts_models'

export function TTSPage() {
  const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
  const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
  const qc = useQueryClient()

  const ttsModels: ConfiguredModel[] = useMemo(() => {
    const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === TTS_CONFIG_KEY)?.value
    if (!raw) return []
    try { return typeof raw === 'string' ? JSON.parse(raw as string) : (Array.isArray(raw) ? raw : []) } catch { return [] }
  }, [settings])

  const systemProviderId = useMemo(() => {
    const p = (providers as any[]).find(p => p.is_system)
    return p?.id ?? ''
  }, [providers])

  const addedModelIds = useMemo(() => {
    return new Set(ttsModels.map(m => m.model_id))
  }, [ttsModels])

  const handleModelsChange = useCallback(async (models: ConfiguredModel[]) => {
    await updateSetting(TTS_CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }, [qc])

  const handleModelDeleted = useCallback((category: string, modelId: string) => {
    const updated = ttsModels.filter(m => m.model_id !== modelId)
    if (updated.length !== ttsModels.length) {
      handleModelsChange(updated)
    }
  }, [ttsModels, handleModelsChange])

  const handleModelAdd = useCallback((category: string, modelId: string, modelName: string) => {
    if (!systemProviderId) return
    const exists = ttsModels.some(m => m.model_id === modelId)
    if (!exists) {
      handleModelsChange([...ttsModels, {
        provider_id: systemProviderId,
        model_id: modelId,
        model_name: modelName,
        is_default: ttsModels.length === 0,
      }])
    }
  }, [ttsModels, handleModelsChange, systemProviderId])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          Text to Speech
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure TTS models. Use a provider model (top) or download local models (below). Provider models override local defaults.
        </p>
      </div>

      <ModelTypeSelector
        configType="tts"
        configuredModels={ttsModels}
        onModelsChange={handleModelsChange}
        excludeLocalProvider
      />

      <div className="border-t border-border/25 pt-4">
        <PipelineModelsPage
          filter={['tts']}
          title="Local TTS Models"
          description="Download Piper, Coqui, or Liquid Audio voices for local text-to-speech. The default local model is used when no provider model is configured above."
          onModelDeleted={handleModelDeleted}
          onModelAdd={handleModelAdd}
          addedModels={addedModelIds}
        />
      </div>
    </div>
  )
}

export default TTSPage
