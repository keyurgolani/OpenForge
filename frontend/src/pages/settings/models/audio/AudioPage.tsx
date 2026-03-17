/**
 * AudioPage - Audio model configuration
 *
 * Uses two ModelTypeSelector instances: one for STT, one for TTS.
 * Local Whisper and Piper/Coqui models are available via the OpenForge Local provider.
 */

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mic, Music, Volume2 } from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import { listSettings, updateSetting } from '@/lib/api'

const STT_CONFIG_KEY = 'system_stt_models'
const TTS_CONFIG_KEY = 'system_tts_models'

export function AudioPage() {
  const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
  const qc = useQueryClient()

  // ── STT models ──────────────────────────────────────────────────────────
  const sttModels: ConfiguredModel[] = useMemo(() => {
    const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === STT_CONFIG_KEY)?.value
    if (!raw) return []
    try { return typeof raw === 'string' ? JSON.parse(raw as string) : (Array.isArray(raw) ? raw : []) } catch { return [] }
  }, [settings])

  const handleSttModelsChange = async (models: ConfiguredModel[]) => {
    await updateSetting(STT_CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  // ── TTS models ──────────────────────────────────────────────────────────
  const ttsModels: ConfiguredModel[] = useMemo(() => {
    const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === TTS_CONFIG_KEY)?.value
    if (!raw) return []
    try { return typeof raw === 'string' ? JSON.parse(raw as string) : (Array.isArray(raw) ? raw : []) } catch { return [] }
  }, [settings])

  const handleTtsModelsChange = async (models: ConfiguredModel[]) => {
    await updateSetting(TTS_CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Music className="w-4 h-4" />
          Audio Models
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure Speech-to-Text and Text-to-Speech models. Local Whisper and Piper/Coqui models are available via the OpenForge Local provider.
        </p>
      </div>

      {/* ── Speech-to-Text (STT) ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Mic className="w-3.5 h-3.5 text-accent" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">Speech-to-Text (STT)</h4>
          <div className="flex-1 h-px bg-border/30" />
        </div>

        <ModelTypeSelector
          configType="stt"
          configuredModels={sttModels}
          onModelsChange={handleSttModelsChange}
        />
      </div>

      {/* ── Text-to-Speech (TTS) ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Volume2 className="w-3.5 h-3.5 text-accent" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">Text-to-Speech (TTS)</h4>
          <div className="flex-1 h-px bg-border/30" />
        </div>

        <ModelTypeSelector
          configType="tts"
          configuredModels={ttsModels}
          onModelsChange={handleTtsModelsChange}
        />
      </div>
    </div>
  )
}

export default AudioPage
