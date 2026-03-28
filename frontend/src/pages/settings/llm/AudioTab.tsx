import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, Trash2, CheckCircle2, Plus,
    ChevronDown, ChevronUp, RefreshCw, Search, Check,
    Save, AlertCircle, Download, Mic,
} from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'
import { sanitizeProviderDisplayName } from '@/lib/provider-display'
import {
    listProviders, listModels,
    listSettings, updateSetting,
    listWhisperModels, downloadWhisperModel, deleteWhisperModel,
} from '@/lib/api'
import type { ProviderRow, TypedModel } from '../types'
import {
    PROVIDER_META,
    RECOMMENDED_WHISPER_MODELS, QUALITY_COLORS, VRAM_TIER_COLORS,
} from '../constants'

// ── Audio Tab ─────────────────────────────────────────────────────────────────
function AudioTab() {
    const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const qc = useQueryClient()

    const configKey = 'system_audio_models'
    const configuredModels: (TypedModel & { subtype: 'tts' | 'stt' })[] = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === configKey)?.value
        return Array.isArray(raw) ? (raw as (TypedModel & { subtype: 'tts' | 'stt' })[]) : []
    }, [settings])

    // Sub-tab: stt or tts
    const [audioSubTab, setAudioSubTab] = useState<'stt' | 'tts'>('stt')
    const [showAdd, setShowAdd] = useState(false)
    const [addProviderId, setAddProviderId] = useState('')
    const [fetchedModels, setFetchedModels] = useState<{ id: string; name: string }[] | null>(null)
    const [fetchingModels, setFetchingModels] = useState(false)
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [modelSearch, setModelSearch] = useState('')
    const [selectedAudioModels, setSelectedAudioModels] = useState<Set<string>>(new Set())
    const [manualModel, setManualModel] = useState('')
    const [saving, setSaving] = useState(false)
    const [removing, setRemoving] = useState<string | null>(null)
    // Built-in local Whisper state
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

    const filteredFetchedModels = useMemo(() => {
        if (!fetchedModels) return []
        const q = modelSearch.toLowerCase()
        return q ? fetchedModels.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : fetchedModels
    }, [fetchedModels, modelSearch])

    const handleFetchModels = async () => {
        if (!addProviderId) return
        setFetchingModels(true); setFetchError(null); setFetchedModels(null); setSelectedAudioModels(new Set())
        try {
            const models = await listModels(addProviderId)
            setFetchedModels(models)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setFetchError(err?.response?.data?.detail ?? err?.message ?? 'Failed to fetch models')
        } finally { setFetchingModels(false) }
    }

    const handleAddModels = async () => {
        const toAdd: (TypedModel & { subtype: 'tts' | 'stt' })[] = fetchedModels
            ? [...selectedAudioModels].map(id => ({
                provider_id: addProviderId, model_id: id,
                model_name: fetchedModels.find(m => m.id === id)?.name ?? id, subtype: audioSubTab,
            }))
            : manualModel.trim()
                ? [{ provider_id: addProviderId, model_id: manualModel.trim(), model_name: manualModel.trim(), subtype: audioSubTab }]
                : []
        if (!toAdd.length) return
        setSaving(true)
        try {
            const existing = configuredModels.filter(m => !toAdd.some(n => n.provider_id === m.provider_id && n.model_id === m.model_id))
            await updateSetting(configKey, { value: [...existing, ...toAdd], category: 'llm' })
            qc.invalidateQueries({ queryKey: ['settings'] })
            setShowAdd(false); setAddProviderId(''); setFetchedModels(null); setSelectedAudioModels(new Set()); setManualModel('')
        } finally { setSaving(false) }
    }

    const handleRemove = async (m: TypedModel) => {
        const key = `${m.provider_id}:${m.model_id}`
        setRemoving(key)
        try {
            const updated = configuredModels.filter(x => !(x.provider_id === m.provider_id && x.model_id === m.model_id))
            await updateSetting(configKey, { value: updated, category: 'llm' })
            qc.invalidateQueries({ queryKey: ['settings'] })
        } finally { setRemoving(null) }
    }

    const getProviderDisplay = (pid: string) => {
        const p = (providers as ProviderRow[]).find(x => x.id === pid)
        return p ? sanitizeProviderDisplayName(p.display_name) : pid.slice(0, 8)
    }

    const ttsModels = configuredModels.filter(m => m.subtype === 'tts')
    const sttModels = configuredModels.filter(m => m.subtype === 'stt')
    const totalSelected = fetchedModels ? selectedAudioModels.size : (manualModel.trim() ? 1 : 0)
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
            // If the deleted model was the selected default, clear selection
            if (whisperModel === modelId) {
                setWhisperModel('')
                setSavedWhisper(false)
            }
        } finally {
            setDeletingModel(null)
        }
    }

    const resetAddForm = () => {
        setShowAdd(false); setAddProviderId(''); setFetchedModels(null)
        setSelectedAudioModels(new Set()); setManualModel(''); setFetchError(null); setModelSearch('')
    }

    return (
        <div className="space-y-4">
            <div>
                <h3 className="font-semibold text-sm">Audio Models</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Configure Speech-to-Text (STT) and Text-to-Speech (TTS) models from providers or use local Whisper.
                </p>
            </div>

            {/* STT / TTS sub-tabs */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted/30 border border-border/50">
                {([['stt', 'Speech-to-Text (STT)', sttModels.length], ['tts', 'Text-to-Speech (TTS)', ttsModels.length]] as const).map(([key, label, count]) => (
                    <button
                        key={key}
                        onClick={() => { setAudioSubTab(key); resetAddForm() }}
                        className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${audioSubTab === key ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {label}
                        <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-medium ${audioSubTab === key ? 'bg-accent-foreground/20' : 'bg-muted text-muted-foreground'}`}>{count}</span>
                    </button>
                ))}
            </div>

            {/* Add model button + panel */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    {audioSubTab === 'stt' ? 'Provider-based STT models' : 'Provider-based TTS models'}
                </p>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                    <Plus className="w-3.5 h-3.5" /> {showAdd ? 'Close' : `Add ${audioSubTab.toUpperCase()} Model`}
                </button>
            </div>

            {showAdd && (
                <div className="glass-card p-4 space-y-4 border border-accent/20 animate-fade-in">
                    <h4 className="text-xs font-medium text-accent uppercase tracking-wide">
                        Add {audioSubTab === 'stt' ? 'Speech-to-Text' : 'Text-to-Speech'} Model
                    </h4>

                    {(providers as unknown[]).length === 0 ? (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>No providers configured. Go to the <strong>Providers</strong> tab to add one first.</span>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground font-medium">1. Select provider</label>
                                <select className="input text-sm" value={addProviderId} onChange={e => { setAddProviderId(e.target.value); setFetchedModels(null); setSelectedAudioModels(new Set()); setFetchError(null); setModelSearch('') }}>
                                    <option value="">Choose a provider…</option>
                                    {(providers as ProviderRow[]).map(p => (
                                        <option key={p.id} value={p.id}>{sanitizeProviderDisplayName(p.display_name)} ({p.provider_name})</option>
                                    ))}
                                </select>
                            </div>

                            {addProviderId && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs text-muted-foreground font-medium">2. Fetch and select models</label>
                                        <button className="btn-ghost text-xs py-1 px-2.5 gap-1" onClick={handleFetchModels} disabled={fetchingModels}>
                                            {fetchingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                            {fetchedModels ? 'Refresh' : 'Fetch Models'}
                                        </button>
                                    </div>

                                    {fetchError && (
                                        <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-300 border border-destructive/20 space-y-1">
                                            <p>{fetchError}</p>
                                            <input className="input text-xs mt-1" placeholder="Or enter model ID manually" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                        </div>
                                    )}

                                    {fetchedModels !== null && fetchedModels.length > 0 && (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between px-1">
                                                <div className="relative flex-1 mr-2">
                                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                                    <input className="input text-xs pl-8" placeholder={`Filter ${fetchedModels.length} models…`} value={modelSearch} onChange={e => setModelSearch(e.target.value)} />
                                                </div>
                                                <button className="text-[10px] text-accent hover:underline whitespace-nowrap" onClick={() => {
                                                    selectedAudioModels.size === filteredFetchedModels.length
                                                        ? setSelectedAudioModels(new Set())
                                                        : setSelectedAudioModels(new Set(filteredFetchedModels.map(m => m.id)))
                                                }}>{selectedAudioModels.size === filteredFetchedModels.length ? 'Deselect all' : 'Select all'}</button>
                                            </div>
                                            <div className="max-h-44 overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20">
                                                {filteredFetchedModels.map(m => {
                                                    const checked = selectedAudioModels.has(m.id)
                                                    return (
                                                        <button key={m.id} onClick={() => setSelectedAudioModels(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n })}
                                                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-muted/30 ${checked ? 'bg-accent/5' : ''}`}>
                                                            <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${checked ? 'bg-accent border-accent' : 'border-border'}`}>
                                                                {checked && <Check className="w-2.5 h-2.5 text-accent-foreground" />}
                                                            </div>
                                                            <span className={checked ? 'text-foreground' : 'text-muted-foreground'}>{m.name}</span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    {fetchedModels === null && !fetchError && (
                                        <input className="input text-xs" placeholder={`Or enter model ID manually (e.g. ${audioSubTab === 'stt' ? 'whisper-1' : 'tts-1'})`} value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                    )}
                                </div>
                            )}

                            <button className="btn-primary text-xs py-1.5 px-3 w-full justify-center" onClick={handleAddModels} disabled={saving || !addProviderId || totalSelected === 0}>
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                {saving ? 'Saving…' : totalSelected > 0 ? `Add ${totalSelected} ${audioSubTab.toUpperCase()} model${totalSelected > 1 ? 's' : ''}` : 'Select models above'}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Model list for active sub-tab */}
            {audioSubTab === 'stt' ? (
                <div className="space-y-2">
                    {sttModels.length > 0 ? sttModels.map(m => {
                        const removeKey = `${m.provider_id}:${m.model_id}`
                        const provider = (providers as ProviderRow[]).find(p => p.id === m.provider_id)
                        const meta = provider ? PROVIDER_META[provider.provider_name] : undefined
                        return (
                            <div key={removeKey} className="glass-card px-4 py-3 flex items-center gap-3">
                                {provider && <div className={`w-7 h-7 rounded-lg flex items-center justify-center border flex-shrink-0 ${meta?.color ?? 'bg-muted border-border'}`}><ProviderIcon providerId={provider.provider_name} className="w-3.5 h-3.5" /></div>}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{m.model_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{getProviderDisplay(m.provider_id)}</p>
                                </div>
                                <button className="btn-ghost p-1.5 text-red-400" onClick={() => handleRemove(m)} disabled={removing === removeKey}>
                                    {removing === removeKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        )
                    }) : <p className="text-xs text-muted-foreground italic px-1">No provider-based STT models configured.</p>}

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
                                                    ? 'border-accent bg-accent/15 shadow-glass-sm'
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
                                                        <div className={`w-3.5 h-3.5 rounded-full border transition-colors ${isSelected ? 'bg-accent border-accent' : isDownloaded ? 'border-border hover:border-accent/50' : 'border-border/50 opacity-40'}`} />
                                                    </button>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                                            <span className={`text-xs font-medium ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>{m.name}</span>
                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${QUALITY_COLORS[m.quality]}`}>{m.quality}</span>
                                                            <span className="text-[9px] text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded">{m.diskSize} disk</span>
                                                            <span className="text-[9px] text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded">{m.vramReq} VRAM</span>
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
                                                                className="p-1 rounded text-accent/70 hover:text-accent hover:bg-accent/15 transition-colors disabled:opacity-40"
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
            ) : (
                <div className="space-y-2">
                    {ttsModels.length > 0 ? ttsModels.map(m => {
                        const removeKey = `${m.provider_id}:${m.model_id}`
                        const provider = (providers as ProviderRow[]).find(p => p.id === m.provider_id)
                        const meta = provider ? PROVIDER_META[provider.provider_name] : undefined
                        return (
                            <div key={removeKey} className="glass-card px-4 py-3 flex items-center gap-3">
                                {provider && <div className={`w-7 h-7 rounded-lg flex items-center justify-center border flex-shrink-0 ${meta?.color ?? 'bg-muted border-border'}`}><ProviderIcon providerId={provider.provider_name} className="w-3.5 h-3.5" /></div>}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{m.model_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{getProviderDisplay(m.provider_id)}</p>
                                </div>
                                <button className="btn-ghost p-1.5 text-red-400" onClick={() => handleRemove(m)} disabled={removing === removeKey}>
                                    {removing === removeKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        )
                    }) : <p className="text-xs text-muted-foreground italic px-1">No TTS models configured.</p>}
                </div>
            )}
        </div>
    )
}

export default AudioTab
