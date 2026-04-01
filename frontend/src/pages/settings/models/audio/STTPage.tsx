/**
 * STTPage - Speech-to-Text model configuration
 */

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mic } from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import { listSettings, updateSetting } from '@/lib/api'

const STT_CONFIG_KEY = 'system_stt_models'

export function STTPage() {
  const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
  const qc = useQueryClient()

  const sttModels: ConfiguredModel[] = useMemo(() => {
    const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === STT_CONFIG_KEY)?.value
    if (!raw) return []
    try { return typeof raw === 'string' ? JSON.parse(raw as string) : (Array.isArray(raw) ? raw : []) } catch { return [] }
  }, [settings])

  const handleModelsChange = async (models: ConfiguredModel[]) => {
    await updateSetting(STT_CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Mic className="w-4 h-4" />
          Speech to Text
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure speech-to-text models. Local Whisper models are available via the OpenForge Local provider.
        </p>
      </div>

      <ModelTypeSelector
        configType="stt"
        configuredModels={sttModels}
        onModelsChange={handleModelsChange}
      />
    </div>
  )
}

export default STTPage
