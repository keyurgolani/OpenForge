import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, Trash2, Plus, RefreshCw, Search, Check, Star,
    AlertCircle,
} from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'
import { sanitizeProviderDisplayName } from '@/lib/provider-display'
import {
    listProviders, listModels,
    listSettings, updateSetting,
} from '@/lib/api'
import type { ProviderRow, TypedModel } from '../types'
import { PROVIDER_META } from '../constants'

// ── Model Type Tab (Chat / Vision) ─────────────────────────────────────────────
function ModelTypeTab({
    configType,
    title,
    description,
    Icon,
}: {
    configType: 'chat' | 'vision'
    title: string
    description: string
    Icon: React.ElementType
}) {
    const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const qc = useQueryClient()

    const configKey = `system_${configType}_models`
    const configuredModels: TypedModel[] = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === configKey)?.value
        return Array.isArray(raw) ? (raw as TypedModel[]) : []
    }, [settings, configKey])

    // Form state for adding a model
    const [showAdd, setShowAdd] = useState(false)
    const [addProviderId, setAddProviderId] = useState('')
    const [fetchedModels, setFetchedModels] = useState<{ id: string; name: string }[] | null>(null)
    const [fetchingModels, setFetchingModels] = useState(false)
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [modelSearch, setModelSearch] = useState('')
    const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
    const [manualModel, setManualModel] = useState('')
    const [saving, setSaving] = useState(false)
    const [removing, setRemoving] = useState<string | null>(null)

    const filteredFetchedModels = useMemo(() => {
        if (!fetchedModels) return []
        const q = modelSearch.toLowerCase()
        return q ? fetchedModels.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : fetchedModels
    }, [fetchedModels, modelSearch])

    const handleFetchModels = async () => {
        if (!addProviderId) return
        setFetchingModels(true); setFetchError(null); setFetchedModels(null)
        setSelectedModels(new Set()); setModelSearch('')
        try {
            const models = await listModels(addProviderId)
            setFetchedModels(models)
            if (models.length <= 10) setSelectedModels(new Set(models.map((m: { id: string }) => m.id)))
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setFetchError(err?.response?.data?.detail ?? err?.message ?? 'Failed to fetch models')
        } finally { setFetchingModels(false) }
    }

    const handleAddModels = async () => {
        const modelsToAdd = fetchedModels
            ? [...selectedModels].map(id => {
                const label = fetchedModels.find(m => m.id === id)?.name ?? id
                return { provider_id: addProviderId, model_id: id, model_name: label }
            })
            : manualModel.trim()
                ? [{ provider_id: addProviderId, model_id: manualModel.trim(), model_name: manualModel.trim() }]
                : []
        if (!modelsToAdd.length) return
        setSaving(true)
        try {
            // Merge with existing, dedup by model_id+provider_id
            const existing = configuredModels.filter(
                m => !modelsToAdd.some(n => n.provider_id === m.provider_id && n.model_id === m.model_id)
            )
            const updated = [...existing, ...modelsToAdd]
            await updateSetting(configKey, { value: updated, category: 'llm' })
            qc.invalidateQueries({ queryKey: ['settings'] })
            setShowAdd(false)
            setAddProviderId(''); setFetchedModels(null); setSelectedModels(new Set()); setManualModel('')
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

    const handleSetDefault = async (m: TypedModel) => {
        const updated = configuredModels.map(x => ({
            ...x,
            is_default: x.provider_id === m.provider_id && x.model_id === m.model_id,
        }))
        await updateSetting(configKey, { value: updated, category: 'llm' })
        qc.invalidateQueries({ queryKey: ['settings'] })
    }

    const getProviderDisplay = (pid: string) => {
        const p = (providers as ProviderRow[]).find(x => x.id === pid)
        return p ? sanitizeProviderDisplayName(p.display_name) : pid.slice(0, 8)
    }

    const totalSelected = fetchedModels ? selectedModels.size : (manualModel.trim() ? 1 : 0)

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-sm">{title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                    <Plus className="w-3.5 h-3.5" /> {showAdd ? 'Close' : 'Add Model'}
                </button>
            </div>

            {/* Add model form */}
            {showAdd && (
                <div className="glass-card p-4 space-y-4 border border-accent/20 animate-fade-in">
                    <h4 className="text-xs font-medium text-accent uppercase tracking-wide">Add Models</h4>

                    {(providers as unknown[]).length === 0 ? (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>No providers configured. Go to the <strong>Providers</strong> tab to add one first.</span>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground font-medium">1. Select provider</label>
                                <select
                                    className="input text-sm"
                                    value={addProviderId}
                                    onChange={e => { setAddProviderId(e.target.value); setFetchedModels(null); setSelectedModels(new Set()); setFetchError(null); setModelSearch('') }}
                                >
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
                                            <input className="input text-xs mt-1" placeholder="Or enter model ID manually (e.g. gpt-4o)" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                        </div>
                                    )}

                                    {!fetchError && fetchedModels !== null && fetchedModels.length === 0 && (
                                        <div className="text-xs p-2.5 rounded-lg bg-muted/20 text-muted-foreground border border-border/50 space-y-1">
                                            <p>This provider doesn't support model listing. Enter the model ID manually.</p>
                                            <input className="input text-xs mt-1" placeholder="Enter model ID (e.g. meta-llama/Meta-Llama-3-8B-Instruct)" value={manualModel} onChange={e => setManualModel(e.target.value)} />
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
                                                    selectedModels.size === filteredFetchedModels.length
                                                        ? setSelectedModels(new Set())
                                                        : setSelectedModels(new Set(filteredFetchedModels.map(m => m.id)))
                                                }}>{selectedModels.size === filteredFetchedModels.length ? 'Deselect all' : 'Select all'}</button>
                                            </div>
                                            <div className="max-h-52 overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20">
                                                {filteredFetchedModels.map(m => {
                                                    const checked = selectedModels.has(m.id)
                                                    return (
                                                        <button key={m.id} onClick={() => setSelectedModels(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n })}
                                                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-muted/30 transition-colors ${checked ? 'bg-accent/5' : ''}`}>
                                                            <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${checked ? 'bg-accent border-accent' : 'border-border'}`}>
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
                                        <input className="input text-xs" placeholder="Or enter model ID manually (e.g. gpt-4o)" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                    )}
                                </div>
                            )}

                            <button
                                className="btn-primary text-xs py-1.5 px-3 w-full justify-center"
                                onClick={handleAddModels}
                                disabled={saving || !addProviderId || totalSelected === 0}
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                {saving ? 'Saving…' : totalSelected > 0 ? `Add ${totalSelected} model${totalSelected > 1 ? 's' : ''}` : 'Select models above'}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Configured models list */}
            {configuredModels.length > 0 ? (
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
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {m.is_default ? (
                                        <span className="chip-accent text-[10px]"><Star className="w-2.5 h-2.5 mr-0.5 inline" />Default</span>
                                    ) : (
                                        <button className="btn-ghost p-1.5" title="Set as default" onClick={() => handleSetDefault(m)}>
                                            <Star className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <button
                                        className="btn-ghost p-1.5 text-red-400"
                                        onClick={() => handleRemove(m)}
                                        disabled={removing === removeKey}
                                    >
                                        {removing === removeKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : !showAdd && (
                <div className="text-center py-10 text-muted-foreground text-sm">
                    <Icon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No {title.toLowerCase()} configured yet.</p>
                    <p className="text-xs mt-1 opacity-70">Click &quot;Add Model&quot; to fetch models from a configured provider.</p>
                </div>
            )}
        </div>
    )
}

export default ModelTypeTab
