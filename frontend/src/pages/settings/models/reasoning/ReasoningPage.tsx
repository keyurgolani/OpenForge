/**
 * ReasoningPage - Reasoning model configuration
 *
 * Uses ModelTypeSelector for model management.
 * Includes OllamaNativeSection for native Ollama model management
 * via the unified OpenForge Local provider.
 */

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import { listSettings, updateSetting } from '@/lib/api'

const CONFIG_KEY = 'system_chat_models'

export function ReasoningPage() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
  const qc = useQueryClient()

  const configuredModels: ConfiguredModel[] = useMemo(() => {
    const raw = settings?.find((s: any) => s.key === CONFIG_KEY)?.value
    if (!raw) return []
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return [] }
  }, [settings])

  const handleModelsChange = async (models: ConfiguredModel[]) => {
    await updateSetting(CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Reasoning Models
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Models used for reasoning and chat conversations. Configure the models available and set the system default.
        </p>
      </div>

      <ModelTypeSelector
        configType="chat"
        configuredModels={configuredModels}
        onModelsChange={handleModelsChange}
      />
    </div>
  )
}

export default ReasoningPage
