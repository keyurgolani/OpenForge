/**
 * ReasoningPage - Reasoning model configuration
 *
 * Uses ModelTypeSelector for model management.
 * Includes OllamaNativeSection for native Ollama model management
 * via the unified OpenForge Local provider.
 */

import { useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import OllamaNativeSection from '@/pages/settings/llm/OllamaNativeSection'
import { listSettings, updateSetting, listProviders } from '@/lib/api'

const CONFIG_KEY = 'system_chat_models'

export function ReasoningPage() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
  const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
  const qc = useQueryClient()

  const systemProviderId = useMemo(() => {
    const p = (providers as any[]).find(p => p.is_system)
    return p?.id ?? ''
  }, [providers])

  const configuredModels: ConfiguredModel[] = useMemo(() => {
    const raw = settings?.find((s: any) => s.key === CONFIG_KEY)?.value
    if (!raw) return []
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return [] }
  }, [settings])

  const handleModelsChange = async (models: ConfiguredModel[]) => {
    await updateSetting(CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

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

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Reasoning Models
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Add models from cloud providers above, or pull and manage local Ollama models below.
        </p>
      </div>

      <ModelTypeSelector
        configType="chat"
        configuredModels={configuredModels}
        onModelsChange={handleModelsChange}
        excludeLocalProvider
      />

      <div className="border-t border-border/20 pt-4">
        <OllamaNativeSection
          capability="chat"
          configuredModels={configuredModels}
          systemProviderId={systemProviderId}
          onAddModel={handleAddOllamaModel}
        />
      </div>
    </div>
  )
}

export default ReasoningPage
