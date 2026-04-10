/**
 * ModelTypeSelector - Reusable model selection component for any capability type.
 *
 * Works identically in settings pages and onboarding flows.
 * Fetches providers, lists models, handles downloads for local models,
 * and manages a configured model list with default selection.
 */

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    HardDrive, Download, Check, Loader2, Star, X, Plus, Cpu,
    ChevronDown, Search, RefreshCw, AlertCircle, Server,
    Trash2, CheckCircle2,
} from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'
import { sanitizeProviderDisplayName } from '@/lib/provider-display'
import {
    listProviders, listModels,
    downloadWhisperModel, downloadEmbeddingModel, downloadCLIPModel,
    downloadTTSModel, downloadMarkerModel,
    getOllamaStatus, getOllamaModels, getRecommendedOllamaModels,
    pullOllamaModel, deleteOllamaModel,
} from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConfiguredModel {
    provider_id: string
    model_id: string
    model_name: string
    is_default?: boolean
}

interface ProviderRow {
    id: string
    display_name: string
    provider_name: string
    has_api_key: boolean
    base_url: string | null
}

interface FetchedModel {
    id: string
    name: string
    capability_type?: string
    downloaded?: boolean
    downloading?: boolean
    requires_gpu?: boolean
    size_mb?: number
    engine?: string
}

export interface ModelTypeSelectorProps {
    configType: 'chat' | 'vision' | 'embedding' | 'stt' | 'tts' | 'clip' | 'pdf'
    configuredModels: ConfiguredModel[]
    onModelsChange: (models: ConfiguredModel[]) => void
    compact?: boolean
    /** Hide the OpenForge Local provider from the Add Model picker (when local models are managed separately below). */
    excludeLocalProvider?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const LOCAL_PROVIDER_NAME = 'openforge-local'

function isOpenForgeLocal(providerName: string): boolean {
    return providerName.toLowerCase() === LOCAL_PROVIDER_NAME
}

/** Pick the right download endpoint based on capability type. */
async function downloadLocalModel(configType: string, modelId: string): Promise<void> {
    switch (configType) {
        case 'stt':
            await downloadWhisperModel(modelId)
            break
        case 'embedding':
            await downloadEmbeddingModel(modelId)
            break
        case 'clip':
            await downloadCLIPModel(modelId)
            break
        case 'tts':
            await downloadTTSModel(modelId)
            break
        case 'pdf':
            await downloadMarkerModel()
            break
        default:
            // chat / vision - generally cloud-only, no local download
            break
    }
}

// ── Component ────────────────────────────────────────────────────────────────

export function ModelTypeSelector({
    configType,
    configuredModels,
    onModelsChange,
    compact = false,
    excludeLocalProvider = false,
}: ModelTypeSelectorProps) {
    // Provider list
    const { data: providers = [] } = useQuery({
        queryKey: ['providers'],
        queryFn: listProviders,
    })

    // State
    const [selectedProviderId, setSelectedProviderId] = useState('')
    const [availableModels, setAvailableModels] = useState<FetchedModel[] | null>(null)
    const [fetchingModels, setFetchingModels] = useState(false)
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [modelSearch, setModelSearch] = useState('')
    const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
    const [showSelector, setShowSelector] = useState(false)

    // ── Ollama pull state ──────────────────────────────────────────────────
    const [pullingModel, setPullingModel] = useState<string | null>(null)
    const [pullStatus, setPullStatus] = useState<string>('')
    const [customPullModel, setCustomPullModel] = useState('')
    const [deletingOllamaModel, setDeletingOllamaModel] = useState<string | null>(null)
    const [confirmOllamaDelete, setConfirmOllamaDelete] = useState<string | null>(null)

    // Determine which providers to show:
    // - When excludeLocalProvider is true, hide openforge-local (local models managed separately)
    // - Otherwise show all providers
    const visibleProviders = useMemo(() => {
        return (providers as ProviderRow[]).filter(p =>
            excludeLocalProvider ? !isOpenForgeLocal(p.provider_name) : true,
        )
    }, [providers, excludeLocalProvider])

    const selectedProvider = useMemo(() => {
        return (providers as ProviderRow[]).find(p => p.id === selectedProviderId) ?? null
    }, [providers, selectedProviderId])

    const isLocalSelected = selectedProvider ? isOpenForgeLocal(selectedProvider.provider_name) : false

    // ── Ollama queries (only active when local provider is selected) ─────
    const ollamaCapabilities = ['chat', 'vision', 'embedding'] as const
    const isOllamaCapability = ollamaCapabilities.includes(configType as typeof ollamaCapabilities[number])

    const { data: ollamaStatus } = useQuery({
        queryKey: ['ollama-status'],
        queryFn: getOllamaStatus,
        refetchInterval: 30_000,
        enabled: isOllamaCapability,
    })

    const { data: ollamaInstalledModels = [], refetch: refetchOllamaModels } = useQuery({
        queryKey: ['ollama-models'],
        queryFn: getOllamaModels,
        enabled: isOllamaCapability,
    })

    const { data: ollamaRecommendedModels = [] } = useQuery({
        queryKey: ['ollama-recommended', configType],
        queryFn: () => getRecommendedOllamaModels(configType),
        enabled: isOllamaCapability,
    })

    const ollamaConnected = ollamaStatus?.connected ?? false

    const ollamaInstalledSet = useMemo(() => {
        const set = new Set<string>()
        for (const m of ollamaInstalledModels) set.add(m.name)
        return set
    }, [ollamaInstalledModels])

    const ollamaConfiguredSet = useMemo(() => {
        const set = new Set<string>()
        if (!selectedProviderId) return set
        for (const m of configuredModels) {
            if (m.provider_id === selectedProviderId) set.add(m.model_id)
        }
        return set
    }, [configuredModels, selectedProviderId])

    const handleOllamaPull = async (modelName: string) => {
        setPullingModel(modelName)
        setPullStatus('Starting pull…')
        try {
            const resp = await pullOllamaModel(modelName)
            if (!resp.ok) { setPullStatus('Pull failed'); return }
            const reader = resp.body?.getReader()
            if (!reader) { setPullStatus('Pull failed — no stream'); return }
            const decoder = new TextDecoder()
            let buf = ''
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += decoder.decode(value, { stream: true })
                const lines = buf.split('\n')
                buf = lines.pop() ?? ''
                for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed || trimmed === 'data: [DONE]') continue
                    const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
                    try {
                        const data = JSON.parse(jsonStr)
                        if (data.status) {
                            const pct = data.completed && data.total
                                ? ` (${Math.round((data.completed / data.total) * 100)}%)`
                                : ''
                            setPullStatus(`${data.status}${pct}`)
                        }
                    } catch { /* skip malformed lines */ }
                }
            }
            setPullStatus('')
            refetchOllamaModels()
        } catch {
            setPullStatus('Pull failed')
        } finally {
            setPullingModel(null)
            setTimeout(() => setPullStatus(''), 3000)
        }
    }

    const handleOllamaDelete = async (modelName: string) => {
        setDeletingOllamaModel(modelName)
        setConfirmOllamaDelete(null)
        try {
            await deleteOllamaModel(modelName)
            refetchOllamaModels()
        } finally {
            setDeletingOllamaModel(null)
        }
    }

    const handleOllamaAddModel = (modelName: string) => {
        if (!selectedProviderId) return
        const newModel: ConfiguredModel = {
            provider_id: selectedProviderId,
            model_id: modelName,
            model_name: modelName,
            is_default: configuredModels.length === 0,
        }
        onModelsChange([
            ...configuredModels.filter(m => !(m.provider_id === selectedProviderId && m.model_id === modelName)),
            newModel,
        ])
    }

    const handlePullCustomOllama = async () => {
        const name = customPullModel.trim()
        if (!name) return
        await handleOllamaPull(name)
        setCustomPullModel('')
    }

    // Filter fetched models by configType for local provider
    const filteredModels = useMemo(() => {
        if (!availableModels) return []
        const q = modelSearch.trim().toLowerCase()
        let models = availableModels

        // For local provider, filter by capability_type
        if (isLocalSelected) {
            models = models.filter(m =>
                !m.capability_type || m.capability_type === configType,
            )
        }

        if (q) {
            models = models.filter(m =>
                m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
            )
        }
        return models
    }, [availableModels, modelSearch, isLocalSelected, configType])

    // Check if a model is already configured
    const isConfigured = useCallback((providerId: string, modelId: string) => {
        return configuredModels.some(m => m.provider_id === providerId && m.model_id === modelId)
    }, [configuredModels])

    // Fetch models when provider is selected
    const handleProviderChange = async (providerId: string) => {
        setSelectedProviderId(providerId)
        setAvailableModels(null)
        setFetchError(null)
        setModelSearch('')

        if (!providerId) return

        setFetchingModels(true)
        try {
            const models = await listModels(providerId)
            setAvailableModels(models)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setFetchError(err?.response?.data?.detail ?? err?.message ?? 'Failed to fetch models')
        } finally {
            setFetchingModels(false)
        }
    }

    const handleRefresh = async () => {
        if (!selectedProviderId) return
        setFetchingModels(true)
        setFetchError(null)
        try {
            const models = await listModels(selectedProviderId)
            setAvailableModels(models)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setFetchError(err?.response?.data?.detail ?? err?.message ?? 'Failed to fetch models')
        } finally {
            setFetchingModels(false)
        }
    }

    // Add a model to the configured list
    const handleAddModel = async (model: FetchedModel) => {
        if (isConfigured(selectedProviderId, model.id)) return

        // For local models that aren't downloaded, download first
        if (isLocalSelected && !model.downloaded) {
            setDownloadingIds(prev => new Set(prev).add(model.id))
            try {
                await downloadLocalModel(configType, model.id)
                // Refresh the model list to get updated download status
                const refreshed = await listModels(selectedProviderId)
                setAvailableModels(refreshed)
            } catch {
                // Download failed, don't add
                setDownloadingIds(prev => {
                    const next = new Set(prev)
                    next.delete(model.id)
                    return next
                })
                return
            }
            setDownloadingIds(prev => {
                const next = new Set(prev)
                next.delete(model.id)
                return next
            })
        }

        const newModel: ConfiguredModel = {
            provider_id: selectedProviderId,
            model_id: model.id,
            model_name: model.name,
            is_default: configuredModels.length === 0, // First model is default
        }
        onModelsChange([...configuredModels, newModel])
    }

    // Remove a model from the configured list
    const handleRemoveModel = (providerId: string, modelId: string) => {
        const updated = configuredModels.filter(
            m => !(m.provider_id === providerId && m.model_id === modelId),
        )
        // If we removed the default, make the first remaining model default
        if (updated.length > 0 && !updated.some(m => m.is_default)) {
            updated[0] = { ...updated[0], is_default: true }
        }
        onModelsChange(updated)
    }

    // Toggle default status
    const handleToggleDefault = (providerId: string, modelId: string) => {
        const updated = configuredModels.map(m => ({
            ...m,
            is_default: m.provider_id === providerId && m.model_id === modelId,
        }))
        onModelsChange(updated)
    }

    // Get provider display name by ID
    const getProviderDisplay = (pid: string) => {
        const p = (providers as ProviderRow[]).find(x => x.id === pid)
        return p ? sanitizeProviderDisplayName(p.display_name) : pid.slice(0, 8)
    }

    const getProviderMeta = (pid: string) => {
        return (providers as ProviderRow[]).find(x => x.id === pid) ?? null
    }

    return (
        <div className={cn('space-y-3', compact && 'space-y-2')}>
            {/* Add model button */}
            <div className="flex items-center justify-end">
                <button
                    className={cn(
                        'btn-primary text-xs py-1.5 px-3',
                        compact && 'text-[11px] py-1 px-2',
                    )}
                    onClick={() => setShowSelector(p => !p)}
                >
                    <Plus className={cn('w-3.5 h-3.5', compact && 'w-3 h-3')} />
                    {showSelector ? 'Close' : 'Add Model'}
                </button>
            </div>

            {/* Model selector panel */}
            {showSelector && (
                <div className={cn(
                    'glass-card space-y-3 border border-accent/20 animate-fade-in',
                    compact ? 'p-3' : 'p-4',
                )}>
                    <h4 className={cn(
                        'font-medium text-accent uppercase tracking-wide',
                        compact ? 'text-[10px]' : 'text-xs',
                    )}>
                        Select a model
                    </h4>

                    {visibleProviders.length === 0 ? (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>No providers configured. Add a provider first.</span>
                        </div>
                    ) : (
                        <>
                            {/* Provider selector */}
                            <div className="space-y-1.5">
                                <label className={cn(
                                    'text-muted-foreground font-medium block',
                                    compact ? 'text-[10px]' : 'text-xs',
                                )}>
                                    1. Select provider
                                </label>
                                <select
                                    className={cn('input', compact ? 'text-xs' : 'text-sm')}
                                    value={selectedProviderId}
                                    onChange={e => handleProviderChange(e.target.value)}
                                >
                                    <option value="">Choose a provider...</option>
                                    {visibleProviders.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {isOpenForgeLocal(p.provider_name) ? 'OpenForge Local' : sanitizeProviderDisplayName(p.display_name)}
                                            {' '}({p.provider_name})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Model list */}
                            {selectedProviderId && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className={cn(
                                            'text-muted-foreground font-medium',
                                            compact ? 'text-[10px]' : 'text-xs',
                                        )}>
                                            2. Choose models
                                        </label>
                                        <button
                                            className="btn-ghost text-xs py-1 px-2.5 gap-1"
                                            onClick={handleRefresh}
                                            disabled={fetchingModels}
                                        >
                                            {fetchingModels
                                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                                : <RefreshCw className="w-3 h-3" />}
                                            {availableModels ? 'Refresh' : 'Fetch Models'}
                                        </button>
                                    </div>

                                    {fetchError && (
                                        <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-300 border border-destructive/20">
                                            {fetchError}
                                        </div>
                                    )}

                                    {fetchingModels && !availableModels && (
                                        <div className="flex items-center justify-center py-6 text-muted-foreground">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        </div>
                                    )}

                                    {availableModels !== null && (
                                        <>
                                            {/* Search */}
                                            {filteredModels.length > 5 && (
                                                <div className="relative">
                                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                                                    <input
                                                        className={cn('input pl-8', compact ? 'text-[11px]' : 'text-xs')}
                                                        placeholder={`Filter ${filteredModels.length} models...`}
                                                        value={modelSearch}
                                                        onChange={e => setModelSearch(e.target.value)}
                                                    />
                                                </div>
                                            )}

                                            {filteredModels.length === 0 ? (
                                                <p className="text-xs text-muted-foreground italic px-1 py-2">
                                                    No models found{modelSearch ? ' matching your search' : ` for ${configType}`}.
                                                </p>
                                            ) : (
                                                <div className={cn(
                                                    'overflow-y-auto rounded-lg border border-border/20 bg-background/30 divide-y divide-border/20',
                                                    compact ? 'max-h-40' : 'max-h-56',
                                                )}>
                                                    {filteredModels.map(model => {
                                                        const already = isConfigured(selectedProviderId, model.id)
                                                        const isDownloading = downloadingIds.has(model.id)
                                                        const isLocal = isLocalSelected

                                                        return (
                                                            <div
                                                                key={model.id}
                                                                className={cn(
                                                                    'flex items-center gap-2.5 transition-colors',
                                                                    compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
                                                                    already
                                                                        ? 'bg-accent/5 opacity-60'
                                                                        : 'hover:bg-muted/30',
                                                                )}
                                                            >
                                                                {/* Model info */}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className={cn(
                                                                            'font-medium truncate',
                                                                            compact ? 'text-[11px]' : 'text-xs',
                                                                        )}>
                                                                            {model.name}
                                                                        </span>

                                                                        {/* Status badges for local models */}
                                                                        {isLocal && !compact && (
                                                                            <>
                                                                                {model.downloaded && (
                                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30 flex items-center gap-0.5">
                                                                                        <Check className="w-2.5 h-2.5" /> Downloaded
                                                                                    </span>
                                                                                )}
                                                                                {model.requires_gpu && (
                                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-violet-500/15 text-violet-300 border-violet-500/30 flex items-center gap-0.5">
                                                                                        <Cpu className="w-2.5 h-2.5" /> GPU
                                                                                    </span>
                                                                                )}
                                                                                {model.size_mb != null && (
                                                                                    <span className="text-[9px] text-muted-foreground border border-border/25 px-1.5 py-0.5 rounded">
                                                                                        {model.size_mb >= 1000 ? `${(model.size_mb / 1000).toFixed(1)} GB` : `${model.size_mb} MB`}
                                                                                    </span>
                                                                                )}
                                                                            </>
                                                                        )}

                                                                        {already && (
                                                                            <span className="text-[9px] text-muted-foreground italic">added</span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Add / Download button */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleAddModel(model)}
                                                                    disabled={already || isDownloading}
                                                                    className={cn(
                                                                        'flex items-center gap-1 rounded-lg border transition-all flex-shrink-0',
                                                                        compact ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
                                                                        already
                                                                            ? 'border-border/20 text-muted-foreground/60 cursor-not-allowed'
                                                                            : isLocal && !model.downloaded
                                                                                ? 'border-accent/30 text-accent hover:bg-accent/15'
                                                                                : 'border-accent/30 text-accent hover:bg-accent/15',
                                                                    )}
                                                                    title={
                                                                        already
                                                                            ? 'Already added'
                                                                            : isLocal && !model.downloaded
                                                                                ? 'Download and add'
                                                                                : 'Add model'
                                                                    }
                                                                >
                                                                    {isDownloading ? (
                                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                                    ) : isLocal && !model.downloaded ? (
                                                                        <Download className="w-3 h-3" />
                                                                    ) : (
                                                                        <Plus className="w-3 h-3" />
                                                                    )}
                                                                    {isDownloading
                                                                        ? 'Downloading...'
                                                                        : isLocal && !model.downloaded
                                                                            ? 'Download & Add'
                                                                            : 'Add'}
                                                                </button>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Ollama Recommended Models (when local provider selected) ── */}
                    {isLocalSelected && isOllamaCapability && selectedProviderId && (
                        <div className="space-y-3 border-t border-border/20 pt-3">
                            {/* Ollama connection status */}
                            <div className="flex items-center gap-2">
                                <Server className="w-3.5 h-3.5 text-lime-300" />
                                <span className={cn('text-xs font-medium', compact ? 'text-[10px]' : 'text-xs')}>
                                    Ollama
                                </span>
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ollamaConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                <span className="text-[10px] text-muted-foreground">
                                    {ollamaConnected ? `Connected — ${ollamaStatus?.model_count ?? 0} model(s)` : 'Disconnected'}
                                </span>
                            </div>

                            {/* Pull progress */}
                            {pullStatus && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground px-2.5 py-1.5 rounded-lg bg-muted/20 border border-border/20">
                                    <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                                    <span className="truncate">{pullStatus}</span>
                                </div>
                            )}

                            {/* Recommended models header */}
                            <label className={cn(
                                'text-muted-foreground font-medium block',
                                compact ? 'text-[10px]' : 'text-xs',
                            )}>
                                Recommended Models
                            </label>

                            {/* Recommended model list */}
                            <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto pr-1">
                                {ollamaRecommendedModels.map((m: { name: string; size_label: string; description: string }) => {
                                    const isPulled = ollamaInstalledSet.has(m.name)
                                    const isAdded = ollamaConfiguredSet.has(m.name)
                                    const isPulling = pullingModel === m.name
                                    const isDeleting = deletingOllamaModel === m.name
                                    return (
                                        <div
                                            key={m.name}
                                            className={cn(
                                                'text-left p-3 rounded-xl border transition-all duration-200',
                                                isAdded
                                                    ? 'border-accent/30 bg-accent/5'
                                                    : 'border-border/20 hover:border-border hover:bg-muted/20',
                                            )}
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                                        <span className="text-xs font-medium text-foreground/80">{m.name}</span>
                                                        <span className="text-[9px] text-muted-foreground border border-border/25 px-1.5 py-0.5 rounded">{m.size_label}</span>
                                                        {isPulled && (
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Pulled</span>
                                                        )}
                                                        {isAdded && (
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-accent/15 text-accent border-accent/30">Added</span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground leading-relaxed">{m.description}</p>
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    {isAdded ? (
                                                        <span className="text-[10px] text-muted-foreground px-2 py-1">
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-accent/50" />
                                                        </span>
                                                    ) : isPulled ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOllamaAddModel(m.name)}
                                                                className="text-[10px] px-2 py-1 rounded-md bg-accent/15 text-accent hover:bg-accent/25 transition-colors font-medium"
                                                            >
                                                                <Plus className="w-3 h-3 inline mr-0.5" />Add
                                                            </button>
                                                            {confirmOllamaDelete === m.name ? (
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOllamaDelete(m.name)}
                                                                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
                                                                    >
                                                                        Confirm
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setConfirmOllamaDelete(null)}
                                                                        className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setConfirmOllamaDelete(m.name)}
                                                                    disabled={isDeleting}
                                                                    className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                                                                    title="Delete model from Ollama"
                                                                >
                                                                    {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                                </button>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOllamaPull(m.name)}
                                                            disabled={!ollamaConnected || isPulling || pullingModel !== null}
                                                            className="text-[10px] px-2 py-1 rounded-md bg-muted/30 text-foreground/70 hover:bg-muted/50 transition-colors font-medium disabled:opacity-40"
                                                            title={!ollamaConnected ? 'Ollama is disconnected' : 'Pull model'}
                                                        >
                                                            {isPulling ? <Loader2 className="w-3 h-3 animate-spin inline mr-0.5" /> : <Download className="w-3 h-3 inline mr-0.5" />}
                                                            Pull
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Free-form pull input */}
                            <div className="pt-2 border-t border-border/20">
                                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Pull any model from Ollama registry</label>
                                <div className="flex gap-2">
                                    <input
                                        className={cn('input text-xs flex-1', compact && 'text-[11px]')}
                                        placeholder="e.g. mistral:7b-instruct"
                                        value={customPullModel}
                                        onChange={e => setCustomPullModel(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handlePullCustomOllama() }}
                                        disabled={!ollamaConnected || pullingModel !== null}
                                    />
                                    <button
                                        type="button"
                                        onClick={handlePullCustomOllama}
                                        disabled={!ollamaConnected || !customPullModel.trim() || pullingModel !== null}
                                        className="btn-primary text-xs py-1.5 px-3 flex-shrink-0"
                                    >
                                        {pullingModel && customPullModel.trim() && pullingModel === customPullModel.trim()
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <Download className="w-3.5 h-3.5" />}
                                        Pull
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Configured models list */}
            {configuredModels.length > 0 ? (
                <div className={cn('space-y-1.5', compact && 'space-y-1')}>
                    {configuredModels.map(m => {
                        const provider = getProviderMeta(m.provider_id)
                        const providerIsLocal = provider ? isOpenForgeLocal(provider.provider_name) : false

                        return (
                            <div
                                key={`${m.provider_id}:${m.model_id}`}
                                className={cn(
                                    'glass-card flex items-center gap-3',
                                    compact ? 'px-3 py-2' : 'px-4 py-3',
                                    m.is_default && 'ring-1 ring-accent/30',
                                )}
                            >
                                {/* Provider icon */}
                                <div className={cn(
                                    'rounded-lg flex items-center justify-center border flex-shrink-0',
                                    compact ? 'w-6 h-6' : 'w-7 h-7',
                                    providerIsLocal
                                        ? 'bg-lime-500/10 border-lime-500/20'
                                        : 'bg-muted border-border',
                                )}>
                                    {providerIsLocal ? (
                                        <HardDrive className={cn(
                                            'text-lime-300',
                                            compact ? 'w-3 h-3' : 'w-3.5 h-3.5',
                                        )} />
                                    ) : provider ? (
                                        <ProviderIcon
                                            providerId={provider.provider_name}
                                            className={cn(compact ? 'w-3 h-3' : 'w-3.5 h-3.5')}
                                        />
                                    ) : null}
                                </div>

                                {/* Model name + provider */}
                                <div className="flex-1 min-w-0">
                                    <p className={cn(
                                        'font-medium truncate',
                                        compact ? 'text-xs' : 'text-sm',
                                    )}>
                                        {m.model_name}
                                    </p>
                                    <p className={cn(
                                        'text-muted-foreground truncate',
                                        compact ? 'text-[10px]' : 'text-xs',
                                    )}>
                                        {getProviderDisplay(m.provider_id)}
                                    </p>
                                </div>

                                {/* Default star + remove */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleToggleDefault(m.provider_id, m.model_id)}
                                        className={cn(
                                            'p-1 rounded transition-colors',
                                            m.is_default
                                                ? 'text-amber-400'
                                                : 'text-muted-foreground/60 hover:text-amber-400/60',
                                        )}
                                        title={m.is_default ? 'Default model' : 'Set as default'}
                                    >
                                        <Star className={cn(
                                            compact ? 'w-3 h-3' : 'w-3.5 h-3.5',
                                            m.is_default && 'fill-amber-400',
                                        )} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveModel(m.provider_id, m.model_id)}
                                        className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                        title="Remove model"
                                    >
                                        <X className={cn(compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                !showSelector && (
                    <div className={cn(
                        'text-center text-muted-foreground',
                        compact ? 'py-4 text-[11px]' : 'py-6 text-xs',
                    )}>
                        <p>No models configured for {configType}.</p>
                        <p className="mt-1 opacity-70">Click "Add Model" to get started.</p>
                    </div>
                )
            )}
        </div>
    )
}

export default ModelTypeSelector
