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
    ChevronDown, Search, RefreshCw, AlertCircle,
} from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'
import { sanitizeProviderDisplayName } from '@/lib/provider-display'
import {
    listProviders, listModels,
    downloadWhisperModel, downloadEmbeddingModel, downloadCLIPModel,
    downloadTTSModel, downloadMarkerModel,
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

    // Determine which providers to show:
    // - openforge-local: always visible
    // - cloud providers: always visible (multi-purpose)
    const visibleProviders = useMemo(() => {
        return (providers as ProviderRow[]).filter(p =>
            isOpenForgeLocal(p.provider_name) || !isOpenForgeLocal(p.provider_name),
        )
    }, [providers])

    const selectedProvider = useMemo(() => {
        return (providers as ProviderRow[]).find(p => p.id === selectedProviderId) ?? null
    }, [providers, selectedProviderId])

    const isLocalSelected = selectedProvider ? isOpenForgeLocal(selectedProvider.provider_name) : false

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
                                                    'overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20',
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
                                                                                    <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">
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
                                                                            ? 'border-border/30 text-muted-foreground/40 cursor-not-allowed'
                                                                            : isLocal && !model.downloaded
                                                                                ? 'border-accent/30 text-accent hover:bg-accent/10'
                                                                                : 'border-accent/30 text-accent hover:bg-accent/10',
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
                                                : 'text-muted-foreground/40 hover:text-amber-400/60',
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
