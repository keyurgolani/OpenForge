/**
 * AudioPage - Audio model configuration
 *
 * Uses two ModelTypeSelector instances: one for STT, one for TTS.
 * Preserves built-in local Whisper model controls below the STT section.
 */

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Trash2, CheckCircle2,
  ChevronDown, ChevronUp,
  Save, Download, Mic, Music, Volume2,
} from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import {
  listSettings, updateSetting,
  listWhisperModels, downloadWhisperModel, deleteWhisperModel,
} from '@/lib/api'
import {
  RECOMMENDED_WHISPER_MODELS, QUALITY_COLORS, VRAM_TIER_COLORS,
} from '../../constants'

const STT_CONFIG_KEY = 'system_stt_models'
const TTS_CONFIG_KEY = 'system_tts_models'

export function AudioPage() {
  const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
  const qc = useQueryClient()

  // ── STT ModelTypeSelector state ──────────────────────────────────────────
  const sttModels: ConfiguredModel[] = useMemo(() => {
    const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === STT_CONFIG_KEY)?.value
    if (!raw) return []
    try { return typeof raw === 'string' ? JSON.parse(raw as string) : (Array.isArray(raw) ? raw : []) } catch { return [] }
  }, [settings])

  const handleSttModelsChange = async (models: ConfiguredModel[]) => {
    await updateSetting(STT_CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  // ── TTS ModelTypeSelector state ──────────────────────────────────────────
  const ttsModels: ConfiguredModel[] = useMemo(() => {
    const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === TTS_CONFIG_KEY)?.value
    if (!raw) return []
    try { return typeof raw === 'string' ? JSON.parse(raw as string) : (Array.isArray(raw) ? raw : []) } catch { return [] }
  }, [settings])

  const handleTtsModelsChange = async (models: ConfiguredModel[]) => {
    await updateSetting(TTS_CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  // ── Built-in local Whisper state ─────────────────────────────────────────
  const [whisperModel, setWhisperModel] = useState('')
  const [whisperExpanded, setWhisperExpanded] = useState(true)
  const [savingWhisper, setSavingWhisper] = useState(false)
  const [savedWhisper, setSavedWhisper] = useState(false)
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
  const [deletingModel, setDeletingModel] = useState<string | null>(null)

  const { data: whisperModelStatuses = [], refetch: refetchWhisper } = useQuery({
    queryKey: ['whisper-models'],
    queryFn: listWhisperModels,
  })
  const whisperDownloaded = useMemo(() => {
    const set = new Set<string>()
    for (const m of whisperModelStatuses as { id: string; downloaded: boolean }[]) {
      if (m.downloaded) set.add(m.id)
    }
    return set
  }, [whisperModelStatuses])

  const localWhisperModel = (settings as { key: string; value: string }[]).find(s => s.key === 'local_whisper_model')?.value ?? ''
  useEffect(() => { setWhisperModel(localWhisperModel) }, [localWhisperModel])

  const handleSaveWhisper = async () => {
    if (!whisperDownloaded.has(whisperModel)) return
    setSavingWhisper(true)
    await updateSetting('local_whisper_model', { value: whisperModel, category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
    setSavingWhisper(false); setSavedWhisper(true)
    setTimeout(() => setSavedWhisper(false), 2000)
  }

  const handleDownloadWhisper = async (modelId: string) => {
    setDownloadingModel(modelId)
    try {
      await downloadWhisperModel(modelId)
      refetchWhisper()
    } finally {
      setDownloadingModel(null)
    }
  }

  const handleDeleteWhisper = async (modelId: string) => {
    setDeletingModel(modelId)
    try {
      await deleteWhisperModel(modelId)
      refetchWhisper()
      if (whisperModel === modelId) {
        setWhisperModel('')
        setSavedWhisper(false)
      }
    } finally {
      setDeletingModel(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Music className="w-4 h-4" />
          Audio Models
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure Speech-to-Text (STT) and Text-to-Speech (TTS) models from providers or use local Whisper.
        </p>
      </div>

      {/* ── Speech-to-Text (STT) Section ────────────────────────────────────── */}
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

        {/* Built-in local Whisper */}
        <div className="glass-card-hover transition-all duration-300">
          <div
            className="flex items-center gap-3 px-4 py-3 cursor-pointer"
            onClick={() => setWhisperExpanded(p => !p)}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setWhisperExpanded(p => !p) } }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center border bg-indigo-500/10 border-indigo-500/20">
              <Mic className="w-4 h-4 text-indigo-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Built-in Local STT</span>
                <span className="chip-muted text-[10px]">Whisper</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {whisperModel || 'No model configured'}
              </p>
            </div>
            <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); setWhisperExpanded(p => !p) }}>
              {whisperExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          {whisperExpanded && (
            <div className="border-t border-border/50 px-4 py-4 space-y-3 animate-fade-in">
              <label className="text-xs text-muted-foreground mb-2 block font-medium">Download a Whisper model, then set it as default</label>
              <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto pr-1">
                {RECOMMENDED_WHISPER_MODELS.map(m => {
                  const isSelected = whisperModel === m.id
                  const isDownloaded = whisperDownloaded.has(m.id)
                  const isDownloading = downloadingModel === m.id
                  const isDeleting = deletingModel === m.id
                  return (
                    <div
                      key={m.id}
                      className={`text-left p-3 rounded-xl border transition-all duration-200 ${isSelected
                        ? 'border-accent bg-accent/10 shadow-glass-sm'
                        : 'border-border/50 hover:border-border hover:bg-muted/20'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => { if (isDownloaded) { setWhisperModel(m.id); setSavedWhisper(false) } }}
                          disabled={!isDownloaded}
                          className="mt-0.5 flex-shrink-0"
                          title={isDownloaded ? 'Select as default' : 'Download first'}
                        >
                          <div className={`w-3.5 h-3.5 rounded-full border transition-colors ${isSelected ? 'bg-accent border-accent' : isDownloaded ? 'border-border hover:border-accent/50' : 'border-border/30 opacity-40'}`} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className={`text-xs font-medium ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>{m.name}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${QUALITY_COLORS[m.quality]}`}>{m.quality}</span>
                            <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.diskSize} disk</span>
                            <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.vramReq} VRAM</span>
                            {isDownloaded && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Downloaded</span>
                            )}
                          </div>
                          {m.recommendedFor && m.recommendedFor.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap mb-0.5">
                              <span className="text-[9px] text-muted-foreground">Recommended for:</span>
                              {m.recommendedFor.map(tier => (
                                <span key={tier} className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${VRAM_TIER_COLORS[tier]}`}>{tier} VRAM</span>
                              ))}
                            </div>
                          )}
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isDownloaded ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteWhisper(m.id)}
                              disabled={isDeleting || isSelected}
                              className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                              title={isSelected ? 'Cannot delete active model' : 'Delete model'}
                            >
                              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDownloadWhisper(m.id)}
                              disabled={isDownloading || downloadingModel !== null}
                              className="p-1 rounded text-accent/70 hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
                              title="Download model"
                            >
                              {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <button
                className="btn-primary text-xs py-1.5 px-3"
                onClick={handleSaveWhisper}
                disabled={savingWhisper || !whisperModel.trim() || !whisperDownloaded.has(whisperModel)}
                title={whisperModel && !whisperDownloaded.has(whisperModel) ? 'Download the model first' : ''}
              >
                {savedWhisper ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : savingWhisper ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5" /> Set as Default</>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Text-to-Speech (TTS) Section ────────────────────────────────────── */}
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
