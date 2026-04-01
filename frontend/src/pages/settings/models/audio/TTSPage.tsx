/**
 * TTSPage - Text-to-Speech model configuration
 */

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Volume2 } from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import { listSettings, updateSetting } from '@/lib/api'

const TTS_CONFIG_KEY = 'system_tts_models'

export function TTSPage() {
  const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
  const qc = useQueryClient()

  const ttsModels: ConfiguredModel[] = useMemo(() => {
    const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === TTS_CONFIG_KEY)?.value
    if (!raw) return []
    try { return typeof raw === 'string' ? JSON.parse(raw as string) : (Array.isArray(raw) ? raw : []) } catch { return [] }
  }, [settings])

  const handleModelsChange = async (models: ConfiguredModel[]) => {
    await updateSetting(TTS_CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          Text to Speech
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure text-to-speech models. Local Piper and Coqui models are available via the OpenForge Local provider.
        </p>
      </div>

      <ModelTypeSelector
        configType="tts"
        configuredModels={ttsModels}
        onModelsChange={handleModelsChange}
      />
    </div>
  )
}

export default TTSPage
