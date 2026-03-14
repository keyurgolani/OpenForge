import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, Trash2, CheckCircle2, Plus,
    ChevronDown, ChevronUp, RefreshCw, Search, Check,
    Save, AlertCircle, Database, Download, ShieldAlert,
    CheckCircle,
} from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'
import { sanitizeProviderDisplayName } from '@/lib/provider-display'
import {
    listProviders, listModels,
    listSettings, updateSetting,
    listEmbeddingModelStatus, downloadEmbeddingModel, deleteEmbeddingModel,
    reindexKnowledge,
} from '@/lib/api'
import type { ProviderRow, TypedModel } from '../types'
import {
    PROVIDER_META,
    RECOMMENDED_EMBEDDING_MODELS, QUALITY_COLORS,
} from '../constants'
import { parseBoolSetting, TogglePill } from '../components'

// ── Embedding Tab ─────────────────────────────────────────────────────────────
function EmbeddingTab() {
    const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const qc = useQueryClient()

    const embeddingModel = (settings as { key: string; value: string }[]).find(s => s.key === 'embedding_model')?.value ?? ''
    const [model, setModel] = useState('')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [localExpanded, setLocalExpanded] = useState(true)
    const [showEmbedConfirm, setShowEmbedConfirm] = useState(false)

    // Provider-based embedding models
    const configKey = 'system_embedding_models'
    const configuredModels: TypedModel[] = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === configKey)?.value
        return Array.isArray(raw) ? (raw as TypedModel[]) : []
    }, [settings])

    const [showAdd, setShowAdd] = useState(false)
    const [addProviderId, setAddProviderId] = useState('')
    const [fetchedModels, setFetchedModels] = useState<{ id: string; name: string }[] | null>(null)
    const [fetchingModels, setFetchingModels] = useState(false)
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [modelSearch, setModelSearch] = useState('')
    const [selectedEmbModels, setSelectedEmbModels] = useState<Set<string>>(new Set())
    const [manualModel, setManualModel] = useState('')
    const [addSaving, setAddSaving] = useState(false)
    const [removing, setRemoving] = useState<string | null>(null)
    const [downloadingEmb, setDownloadingEmb] = useState<string | null>(null)
    const [deletingEmb, setDeletingEmb] = useState<string | null>(null)
    const [reindexingKnowledge, setReindexingKnowledge] = useState(false)
    const [reindexKnowledgeStarted, setReindexKnowledgeStarted] = useState(false)
    const [togglingRerank, setTogglingRerank] = useState(false)

    const rerankingEnabled = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === 'search.reranking_enabled')?.value
        return parseBoolSetting(raw, true)
    }, [settings])

    // Query download status for all recommended embedding models
    const allEmbIds = useMemo(() => RECOMMENDED_EMBEDDING_MODELS.map(m => m.id).join(','), [])
    const { data: embStatuses = [], refetch: refetchEmb } = useQuery({
        queryKey: ['embedding-model-status', allEmbIds],
        queryFn: () => listEmbeddingModelStatus(allEmbIds),
    })
    const embDownloaded = useMemo(() => {
        const set = new Set<string>()
        for (const s of embStatuses as { id: string; downloaded: boolean }[]) {
            if (s.downloaded) set.add(s.id)
        }
        return set
    }, [embStatuses])

    useEffect(() => { setModel(embeddingModel) }, [embeddingModel])

    const handleDownloadEmb = async (modelId: string) => {
        setDownloadingEmb(modelId)
        try {
            await downloadEmbeddingModel(modelId)
            refetchEmb()
        } finally {
            setDownloadingEmb(null)
        }
    }

    const handleDeleteEmb = async (modelId: string) => {
        setDeletingEmb(modelId)
        try {
            await deleteEmbeddingModel(modelId)
            refetchEmb()
            if (model === modelId) {
                setModel('')
                setSaved(false)
            }
        } finally {
            setDeletingEmb(null)
        }
    }

    const handleSaveLocal = () => {
        // If changing an existing model, require confirmation
        if (embeddingModel && embeddingModel !== model) {
            setShowEmbedConfirm(true)
        } else {
            void doSaveLocal()
        }
    }

    const doSaveLocal = async () => {
        setSaving(true); setShowEmbedConfirm(false)
        await updateSetting('embedding_model', { value: model })
        qc.invalidateQueries({ queryKey: ['settings'] })
        setSaving(false); setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    const filteredFetchedModels = useMemo(() => {
        if (!fetchedModels) return []
        const q = modelSearch.toLowerCase()
        return q ? fetchedModels.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : fetchedModels
    }, [fetchedModels, modelSearch])

    const handleFetchModels = async () => {
        if (!addProviderId) return
        setFetchingModels(true); setFetchError(null); setFetchedModels(null); setSelectedEmbModels(new Set())
        try {
            const models = await listModels(addProviderId)
            setFetchedModels(models)
            if (models.length <= 10) setSelectedEmbModels(new Set(models.map((m: { id: string }) => m.id)))
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setFetchError(err?.response?.data?.detail ?? err?.message ?? 'Failed to fetch models')
        } finally { setFetchingModels(false) }
    }

    const handleAddEmbModels = async () => {
        const toAdd = fetchedModels
            ? [...selectedEmbModels].map(id => ({
                provider_id: addProviderId,
                model_id: id,
                model_name: fetchedModels.find(m => m.id === id)?.name ?? id,
            }))
            : manualModel.trim()
                ? [{ provider_id: addProviderId, model_id: manualModel.trim(), model_name: manualModel.trim() }]
                : []
        if (!toAdd.length) return
        setAddSaving(true)
        try {
            const existing = configuredModels.filter(m => !toAdd.some(n => n.provider_id === m.provider_id && n.model_id === m.model_id))
            await updateSetting(configKey, { value: [...existing, ...toAdd], category: 'llm' })
            qc.invalidateQueries({ queryKey: ['settings'] })
            setShowAdd(false); setAddProviderId(''); setFetchedModels(null); setSelectedEmbModels(new Set()); setManualModel('')
        } finally { setAddSaving(false) }
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

    const totalSelected = fetchedModels ? selectedEmbModels.size : (manualModel.trim() ? 1 : 0)

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-sm">Embedding Models</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Models used for semantic indexing and vector search. Add provider-based models or configure the built-in local model.
                    </p>
                </div>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                    <Plus className="w-3.5 h-3.5" /> {showAdd ? 'Close' : 'Add Model'}
                </button>
            </div>

            {/* Add model form */}
            {showAdd && (
                <div className="glass-card p-4 space-y-4 border border-accent/20 animate-fade-in">
                    <h4 className="text-xs font-medium text-accent uppercase tracking-wide">Add Embedding Models from Provider</h4>

                    {(providers as unknown[]).length === 0 ? (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>No providers configured. Go to the <strong>Providers</strong> tab to add one first.</span>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground font-medium">1. Select provider</label>
                                <select className="input text-sm" value={addProviderId} onChange={e => { setAddProviderId(e.target.value); setFetchedModels(null); setSelectedEmbModels(new Set()); setFetchError(null); setModelSearch('') }}>
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
                                                    selectedEmbModels.size === filteredFetchedModels.length
                                                        ? setSelectedEmbModels(new Set())
                                                        : setSelectedEmbModels(new Set(filteredFetchedModels.map(m => m.id)))
                                                }}>{selectedEmbModels.size === filteredFetchedModels.length ? 'Deselect all' : 'Select all'}</button>
                                            </div>
                                            <div className="max-h-52 overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20">
                                                {filteredFetchedModels.map(m => {
                                                    const checked = selectedEmbModels.has(m.id)
                                                    return (
                                                        <button key={m.id} onClick={() => setSelectedEmbModels(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n })}
                                                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-muted/30 transition-colors ${checked ? 'bg-accent/5' : ''}`}>
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
                                        <input className="input text-xs" placeholder="Or enter model ID manually (e.g. text-embedding-3-small)" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                    )}
                                </div>
                            )}

                            <button className="btn-primary text-xs py-1.5 px-3 w-full justify-center" onClick={handleAddEmbModels} disabled={addSaving || !addProviderId || totalSelected === 0}>
                                {addSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                {addSaving ? 'Saving…' : totalSelected > 0 ? `Add ${totalSelected} model${totalSelected > 1 ? 's' : ''}` : 'Select models above'}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Provider-based embedding models */}
            {configuredModels.length > 0 && (
                <div className="space-y-2">
                    {configuredModels.map(m => {
                        const removeKey = `${m.provider_id}:${m.model_id}`
                        const provider = (providers as ProviderRow[]).find(p => p.id === m.provider_id)
                        const meta = provider ? PROVIDER_META[provider.provider_name] : undefined
                        return (
                            <div key={removeKey} className="glass-card px-4 py-3 flex items-center gap-3">
                                {provider && (
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center border flex-shrink-0 ${meta?.color ?? 'bg-muted border-border'}`}>
                                        <ProviderIcon providerId={provider.provider_name} className="w-3.5 h-3.5" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{m.model_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{getProviderDisplay(m.provider_id)}</p>
                                </div>
                                <button className="btn-ghost p-1.5 text-red-400" onClick={() => handleRemove(m)} disabled={removing === removeKey}>
                                    {removing === removeKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Built-in local embedding model */}
            <div className="glass-card-hover transition-all duration-300">
                <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                    onClick={() => setLocalExpanded(p => !p)}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLocalExpanded(p => !p) } }}
                >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center border bg-lime-500/10 border-lime-500/20">
                        <Database className="w-4 h-4 text-lime-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">Built-in Local</span>
                            <span className="chip-muted text-[10px]">sentence-transformers</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {model || 'No model configured'}
                        </p>
                    </div>
                    <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); setLocalExpanded(p => !p) }}>
                        {localExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                </div>

                {localExpanded && (
                    <div className="border-t border-border/50 px-4 py-4 space-y-3 animate-fade-in">
                        <label className="text-xs text-muted-foreground mb-2 block font-medium">Download a model, then set it as default</label>
                        <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto pr-1">
                            {RECOMMENDED_EMBEDDING_MODELS.map(m => {
                                const isSelected = model === m.id
                                const isDownloaded = embDownloaded.has(m.id)
                                const isDownloading = downloadingEmb === m.id
                                const isDeleting = deletingEmb === m.id
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
                                                onClick={() => { if (isDownloaded) { setModel(m.id); setSaved(false) } }}
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
                                                    {m.dims && <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.dims}d</span>}
                                                    {isDownloaded && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Downloaded</span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {isDownloaded ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteEmb(m.id)}
                                                        disabled={isDeleting || isSelected}
                                                        className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                                                        title={isSelected ? 'Cannot delete active model' : 'Delete model'}
                                                    >
                                                        {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadEmb(m.id)}
                                                        disabled={isDownloading || downloadingEmb !== null}
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
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>Changing the embedding model requires re-indexing all knowledge. Search results will be unavailable until re-indexing completes.</span>
                        </div>
                        <button
                            className="btn-primary text-xs py-1.5 px-3"
                            onClick={handleSaveLocal}
                            disabled={saving || !model.trim() || !embDownloaded.has(model)}
                            title={model && !embDownloaded.has(model) ? 'Download the model first' : ''}
                        >
                            {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5" /> Set as Default</>}
                        </button>
                    </div>
                )}
            </div>

            {/* Re-index knowledge */}
            <div className="glass-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-medium">Re-index Knowledge</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            Re-process text embeddings for all knowledge items using the current model.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={async () => {
                            setReindexingKnowledge(true)
                            try {
                                await reindexKnowledge()
                                setReindexKnowledgeStarted(true)
                                setTimeout(() => setReindexKnowledgeStarted(false), 3000)
                            } finally {
                                setReindexingKnowledge(false)
                            }
                        }}
                        disabled={reindexingKnowledge}
                        className="btn-primary text-xs py-1.5 px-4 gap-1.5 flex-shrink-0"
                    >
                        {reindexingKnowledge ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Re-index All Knowledge
                    </button>
                </div>
                {reindexKnowledgeStarted && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Re-indexing started in background
                    </span>
                )}
            </div>

            {/* Cross-encoder reranking toggle */}
            <div className="glass-card p-4">
                <button
                    type="button"
                    className="w-full text-left"
                    onClick={async () => {
                        setTogglingRerank(true)
                        try {
                            await updateSetting('search.reranking_enabled', {
                                value: !rerankingEnabled,
                                category: 'search',
                                sensitive: false,
                            })
                            qc.invalidateQueries({ queryKey: ['settings'] })
                        } finally {
                            setTogglingRerank(false)
                        }
                    }}
                    disabled={togglingRerank}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-medium">Cross-Encoder Reranking</h4>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Rerank search results using a cross-encoder model for improved relevance. Adds slight latency per query.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                            {togglingRerank && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                            <TogglePill checked={rerankingEnabled} />
                        </div>
                    </div>
                </button>
            </div>

            {/* Critical embedding model change confirmation */}
            {showEmbedConfirm && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setShowEmbedConfirm(false)} />
                    <div className="relative w-full max-w-lg animate-fade-in">
                        {/* Danger glow border */}
                        <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-red-600/60 via-red-500/40 to-orange-600/60 blur-sm" />
                        <div className="relative rounded-2xl bg-background border border-red-600/50 shadow-2xl overflow-hidden">
                            {/* Critical header stripe */}
                            <div className="bg-gradient-to-r from-red-900/80 via-red-800/70 to-red-900/80 border-b border-red-600/40 px-6 py-4 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center flex-shrink-0">
                                    <ShieldAlert className="w-5 h-5 text-red-400" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-widest text-red-400/80 mb-0.5">Destructive Operation</p>
                                    <h3 className="text-base font-bold text-foreground">Change Embedding Model</h3>
                                </div>
                            </div>

                            <div className="px-6 py-5 space-y-4">
                                {/* Model change summary */}
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/60 text-xs font-mono">
                                    <span className="text-muted-foreground truncate max-w-[180px]">{embeddingModel || '(none)'}</span>
                                    <span className="text-red-400 font-bold flex-shrink-0">&rarr;</span>
                                    <span className="text-foreground font-semibold truncate max-w-[180px]">{model}</span>
                                </div>

                                {/* Consequences */}
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">What will happen</p>
                                    {[
                                        'All existing knowledge vectors will be invalidated immediately.',
                                        'Semantic search will be unavailable until full re-indexing completes.',
                                        'Re-indexing every knowledge item may take hours on large datasets.',
                                        'The new model will be downloaded on first use (can be several GB).',
                                        'This action cannot be undone without manually re-indexing with the old model.',
                                    ].map(line => (
                                        <div key={line} className="flex items-start gap-2 text-xs text-muted-foreground">
                                            <span className="text-red-500 font-bold flex-shrink-0 mt-0.5">!</span>
                                            <span>{line}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="px-6 pb-5 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowEmbedConfirm(false)}
                                    className="btn-ghost px-4 py-2 text-sm font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void doSaveLocal()}
                                    className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 border border-red-500/50 shadow-lg shadow-red-900/30 transition-all focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                                >
                                    <ShieldAlert className="w-4 h-4" />
                                    Yes, Change Model &amp; Re-index
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default EmbeddingTab
