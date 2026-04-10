import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    Loader2, Trash2, Plus, ChevronDown, ChevronUp,
    Download, Server, CheckCircle2,
} from 'lucide-react'
import {
    getOllamaStatus, getOllamaModels, getRecommendedOllamaModels,
    pullOllamaModel, deleteOllamaModel,
} from '@/lib/api'
import type { TypedModel } from '../types'

interface OllamaNativeSectionProps {
    capability: 'chat' | 'vision' | 'embedding'
    configuredModels: TypedModel[]
    systemProviderId: string
    onAddModel: (providerId: string, modelId: string, modelName: string) => void
    /** When true, render only the inner content (no card wrapper or header). For embedding in an outer container. */
    headless?: boolean
}

function OllamaNativeSection({ capability, configuredModels, systemProviderId, onAddModel, headless = false }: OllamaNativeSectionProps) {
    const [expanded, setExpanded] = useState(true)
    const [pullingModel, setPullingModel] = useState<string | null>(null)
    const [pullStatus, setPullStatus] = useState<string>('')
    const [deletingModel, setDeletingModel] = useState<string | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
    const [customModel, setCustomModel] = useState('')
    const [pullingCustom, setPullingCustom] = useState(false)

    const hasProvider = !!systemProviderId

    const { data: status } = useQuery({
        queryKey: ['ollama-status'],
        queryFn: getOllamaStatus,
        refetchInterval: 30_000,
        enabled: hasProvider,
    })

    const { data: installedModels = [], refetch: refetchModels } = useQuery({
        queryKey: ['ollama-models'],
        queryFn: getOllamaModels,
        enabled: hasProvider,
    })

    const { data: recommendedModels = [] } = useQuery({
        queryKey: ['ollama-recommended', capability],
        queryFn: () => getRecommendedOllamaModels(capability),
        enabled: hasProvider,
    })

    const connected = status?.connected ?? false

    const installedSet = useMemo(() => {
        const set = new Set<string>()
        for (const m of installedModels) {
            set.add(m.name)
            // Also add base name without :tag so "nomic-embed-text" matches "nomic-embed-text:latest"
            const base = m.name.split(':')[0]
            if (base) set.add(base)
        }
        return set
    }, [installedModels])

    const configuredSet = useMemo(() => {
        const set = new Set<string>()
        for (const m of configuredModels) {
            if (m.provider_id === systemProviderId) set.add(m.model_id)
        }
        return set
    }, [configuredModels, systemProviderId])

    const handlePull = async (modelName: string) => {
        setPullingModel(modelName)
        setPullStatus('Starting pull…')
        try {
            const resp = await pullOllamaModel(modelName)
            if (!resp.ok) {
                setPullStatus('Pull failed')
                return
            }
            const reader = resp.body?.getReader()
            if (!reader) {
                setPullStatus('Pull failed — no stream')
                return
            }
            const decoder = new TextDecoder()
            let buf = ''
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += decoder.decode(value, { stream: true })
                const lines = buf.split('\n')
                buf = lines.pop() ?? ''
                for (const line of lines) {
                    if (!line.trim()) continue
                    try {
                        const data = JSON.parse(line)
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
            refetchModels()
        } catch {
            setPullStatus('Pull failed')
        } finally {
            setPullingModel(null)
            setTimeout(() => setPullStatus(''), 3000)
        }
    }

    const handleDelete = async (modelName: string) => {
        setDeletingModel(modelName)
        setConfirmDelete(null)
        try {
            await deleteOllamaModel(modelName)
            refetchModels()
        } finally {
            setDeletingModel(null)
        }
    }

    const handlePullCustom = async () => {
        const name = customModel.trim()
        if (!name) return
        setPullingCustom(true)
        await handlePull(name)
        setPullingCustom(false)
        setCustomModel('')
    }

    // Don't render if no system provider
    if (!systemProviderId) return null

    const innerContent = (<>
                    {/* Connection status */}
                    <div className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg ${connected ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/10 text-red-300 border border-red-500/20'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        {connected ? 'Connected to Ollama' : 'Ollama is disconnected'}
                    </div>

                    {/* Pull progress */}
                    {pullStatus && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground px-2.5 py-1.5 rounded-lg bg-muted/20 border border-border/20">
                            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                            <span className="truncate">{pullStatus}</span>
                        </div>
                    )}

                    {/* Curated model list */}
                    <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto pr-1">
                        {recommendedModels.map(m => {
                            const isPulled = installedSet.has(m.name)
                            const isAdded = configuredSet.has(m.name)
                            const isPulling = pullingModel === m.name
                            const isDeleting = deletingModel === m.name
                            return (
                                <div
                                    key={m.name}
                                    className={`text-left p-3 rounded-xl border transition-all duration-200 ${isAdded
                                        ? 'border-accent/30 bg-accent/5'
                                        : 'border-border/20 hover:border-border hover:bg-muted/20'
                                    }`}
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
                                                        onClick={() => onAddModel(systemProviderId, m.name, m.name)}
                                                        className="text-[10px] px-2 py-1 rounded-md bg-accent/15 text-accent hover:bg-accent/25 transition-colors font-medium"
                                                    >
                                                        <Plus className="w-3 h-3 inline mr-0.5" />Add
                                                    </button>
                                                    {confirmDelete === m.name ? (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDelete(m.name)}
                                                                className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
                                                            >
                                                                Confirm
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setConfirmDelete(null)}
                                                                className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDelete(m.name)}
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
                                                    onClick={() => handlePull(m.name)}
                                                    disabled={!connected || isPulling || pullingModel !== null}
                                                    className="text-[10px] px-2 py-1 rounded-md bg-muted/30 text-foreground/70 hover:bg-muted/50 transition-colors font-medium disabled:opacity-40"
                                                    title={!connected ? 'Ollama is disconnected' : 'Pull model'}
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

                    {/* Other installed models (not in curated list) */}
                    {(() => {
                        const recommendedNames = new Set(recommendedModels.map((m: any) => m.name))
                        const otherInstalled = (installedModels as any[]).filter(m => {
                            // Exclude if exact match or base name matches a recommended model
                            const base = m.name.split(':')[0]
                            return !recommendedNames.has(m.name) && !recommendedNames.has(base)
                        })
                        if (otherInstalled.length === 0) return null
                        return (
                            <div className="pt-2 border-t border-border/20">
                                <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">Other Installed Models</p>
                                <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto pr-1">
                                    {otherInstalled.map((m: any) => {
                                        const isAdded = configuredSet.has(m.name)
                                        const isDeleting = deletingModel === m.name
                                        const sizeLabel = m.size ? `${(m.size / 1e9).toFixed(1)} GB` : ''
                                        return (
                                            <div
                                                key={m.name}
                                                className={`text-left p-3 rounded-xl border transition-all duration-200 ${isAdded
                                                    ? 'border-accent/30 bg-accent/5'
                                                    : 'border-border/20 hover:border-border hover:bg-muted/20'
                                                }`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                                            <span className="text-xs font-medium text-foreground/80">{m.name}</span>
                                                            {sizeLabel && <span className="text-[9px] text-muted-foreground border border-border/25 px-1.5 py-0.5 rounded">{sizeLabel}</span>}
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Pulled</span>
                                                            {isAdded && <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-accent/15 text-accent border-accent/30">Added</span>}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        {isAdded ? (
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-accent/50" />
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => onAddModel(systemProviderId, m.name, m.name)}
                                                                className="text-[10px] px-2 py-1 rounded-md bg-accent/15 text-accent hover:bg-accent/25 transition-colors font-medium"
                                                            >
                                                                <Plus className="w-3 h-3 inline mr-0.5" />Add
                                                            </button>
                                                        )}
                                                        {confirmDelete === m.name ? (
                                                            <div className="flex items-center gap-1">
                                                                <button type="button" onClick={() => handleDelete(m.name)}
                                                                    className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors">Confirm</button>
                                                                <button type="button" onClick={() => setConfirmDelete(null)}
                                                                    className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setConfirmDelete(m.name)}
                                                                disabled={isDeleting}
                                                                className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                                                                title="Delete model from Ollama"
                                                            >
                                                                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })()}

                    {/* Free-form pull input */}
                    <div className="pt-2 border-t border-border/20">
                        <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Pull any model from Ollama registry</label>
                        <div className="flex gap-2">
                            <input
                                className="input text-xs flex-1"
                                placeholder="e.g. mistral:7b-instruct"
                                value={customModel}
                                onChange={e => setCustomModel(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handlePullCustom() }}
                                disabled={!connected || pullingModel !== null}
                            />
                            <button
                                type="button"
                                onClick={handlePullCustom}
                                disabled={!connected || !customModel.trim() || pullingModel !== null || pullingCustom}
                                className="btn-primary text-xs py-1.5 px-3 flex-shrink-0"
                            >
                                {pullingCustom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                Pull
                            </button>
                        </div>
                    </div>
    </>)

    if (headless) return <div className="space-y-3">{innerContent}</div>

    return (
        <div className="glass-card-hover transition-all duration-300">
            <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={() => setExpanded(p => !p)}
                role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(p => !p) } }}
            >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center border bg-lime-500/10 border-lime-500/20">
                    <Server className="w-4 h-4 text-lime-300" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">OpenForge Local</span>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className="chip-muted text-[10px]">Ollama</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {connected ? `Connected — ${status?.model_count ?? 0} model(s) installed` : 'Disconnected'}
                    </p>
                </div>
                <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); setExpanded(p => !p) }}>
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
            </div>

            {expanded && (
                <div className="border-t border-border/20 px-4 py-4 space-y-3 animate-fade-in">
                    {innerContent}
                </div>
            )}
        </div>
    )
}

export default OllamaNativeSection
