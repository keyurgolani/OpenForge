import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    listProviders, createProvider, updateProvider, deleteProvider,
    testConnection, listModels, setDefaultProvider,
    listWorkspaces, updateWorkspace, createWorkspace, deleteWorkspace
} from '@/lib/api'
import {
    Settings, Globe2, Loader2, Trash2, CheckCircle2, XCircle, Star, Plus,
    ChevronDown, ChevronUp, Eye, EyeOff, RefreshCw, Zap, Server, Search, Check,
    Layers, Bot, FolderOpen, Pencil, Save, X
} from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'

// ── Provider registry ────────────────────────────────────────────────────────
const PROVIDER_META: Record<string, {
    name: string; color: string
    needsKey: boolean; needsUrl: boolean; placeholder: string; urlPlaceholder?: string
}> = {
    openai: { name: 'OpenAI', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300', needsKey: true, needsUrl: false, placeholder: 'sk-proj-…' },
    anthropic: { name: 'Anthropic', color: 'bg-orange-500/10 border-orange-500/20 text-orange-300', needsKey: true, needsUrl: false, placeholder: 'sk-ant-…' },
    gemini: { name: 'Google Gemini', color: 'bg-blue-500/10 border-blue-500/20 text-blue-300', needsKey: true, needsUrl: false, placeholder: 'AIza…' },
    groq: { name: 'Groq', color: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300', needsKey: true, needsUrl: false, placeholder: 'gsk_…' },
    deepseek: { name: 'DeepSeek', color: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300', needsKey: true, needsUrl: false, placeholder: 'sk-…' },
    mistral: { name: 'Mistral AI', color: 'bg-purple-500/10 border-purple-500/20 text-purple-300', needsKey: true, needsUrl: false, placeholder: 'Key…' },
    openrouter: { name: 'OpenRouter', color: 'bg-pink-500/10 border-pink-500/20 text-pink-300', needsKey: true, needsUrl: false, placeholder: 'sk-or-…' },
    xai: { name: 'xAI (Grok)', color: 'bg-gray-500/10 border-gray-500/20 text-gray-300', needsKey: true, needsUrl: false, placeholder: 'xai-…' },
    cohere: { name: 'Cohere', color: 'bg-teal-500/10 border-teal-500/20 text-teal-300', needsKey: true, needsUrl: false, placeholder: 'API key…' },
    zhipuai: { name: 'Z.AI (ZhipuAI)', color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300', needsKey: true, needsUrl: false, placeholder: 'API key…' },
    huggingface: { name: 'HuggingFace', color: 'bg-orange-400/10 border-orange-400/20 text-orange-200', needsKey: true, needsUrl: false, placeholder: 'hf_…' },
    ollama: { name: 'Ollama (Local)', color: 'bg-lime-500/10 border-lime-500/20 text-lime-300', needsKey: false, needsUrl: true, placeholder: 'Token (optional)', urlPlaceholder: 'http://localhost:11434' },
    'custom-openai': { name: 'Custom OpenAI-compatible', color: 'bg-violet-500/10 border-violet-500/20 text-violet-300', needsKey: false, needsUrl: true, placeholder: 'Token (optional)', urlPlaceholder: 'https://your-api.com' },
    'custom-anthropic': { name: 'Custom Anthropic-compat.', color: 'bg-rose-500/10 border-rose-500/20 text-rose-300', needsKey: false, needsUrl: true, placeholder: 'Token (optional)', urlPlaceholder: 'https://your-api.com' },
}
const PROVIDER_NAMES = Object.keys(PROVIDER_META)

// ── Root component ────────────────────────────────────────────────────────────
export default function SettingsPage() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const [activeTab, setActiveTab] = useState<'workspaces' | 'llm'>('workspaces')

    const TABS = [
        { id: 'workspaces' as const, label: 'Workspaces', Icon: FolderOpen },
        { id: 'llm' as const, label: 'AI Providers', Icon: Bot },
    ]

    return (
        <div className="max-w-3xl mx-auto p-6">
            <div className="flex items-center gap-3 mb-8">
                <Settings className="w-5 h-5 text-accent" />
                <h1 className="text-xl font-bold">Settings</h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-border/50">
                {TABS.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all ${activeTab === id
                                ? 'border-accent text-accent'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <Icon className="w-4 h-4" />
                        {label}
                    </button>
                ))}
            </div>

            {activeTab === 'workspaces' && <WorkspacesSettings activeWorkspaceId={workspaceId} />}
            {activeTab === 'llm' && <LLMSettings />}
        </div>
    )
}

// ── Workspaces Tab ────────────────────────────────────────────────────────────
type WorkspaceRow = {
    id: string; name: string; description: string | null
    icon: string | null; color: string | null
    llm_provider_id: string | null; llm_model: string | null
    note_count: number; conversation_count: number
}

function WorkspacesSettings({ activeWorkspaceId }: { activeWorkspaceId: string }) {
    const qc = useQueryClient()
    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })

    const [showAdd, setShowAdd] = useState(false)
    const [newName, setNewName] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [adding, setAdding] = useState(false)

    const handleAdd = async () => {
        if (!newName.trim()) return
        setAdding(true)
        await createWorkspace({ name: newName.trim(), description: newDesc || undefined })
        qc.invalidateQueries({ queryKey: ['workspaces'] })
        setNewName(''); setNewDesc(''); setShowAdd(false); setAdding(false)
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h3 className="font-semibold text-sm">Workspaces</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Configure each workspace's details, AI provider override, and model.
                    </p>
                </div>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                    <Plus className="w-3.5 h-3.5" /> New Workspace
                </button>
            </div>

            {showAdd && (
                <div className="glass-card p-4 space-y-3 border border-accent/20 animate-fade-in">
                    <h4 className="text-sm font-semibold text-accent">New Workspace</h4>
                    <input className="input text-sm" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
                    <input className="input text-sm" placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                    <div className="flex gap-2">
                        <button className="btn-primary text-xs py-1.5 px-3" onClick={handleAdd} disabled={!newName.trim() || adding}>
                            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Create
                        </button>
                        <button className="btn-ghost text-xs py-1.5 px-3" onClick={() => setShowAdd(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {(workspaces as WorkspaceRow[]).map(ws => (
                <WorkspaceCard
                    key={ws.id}
                    workspace={ws}
                    providers={providers as ProviderRow[]}
                    isActive={ws.id === activeWorkspaceId}
                    onDeleted={() => qc.invalidateQueries({ queryKey: ['workspaces'] })}
                    onSaved={() => qc.invalidateQueries({ queryKey: ['workspaces'] })}
                />
            ))}
        </div>
    )
}

type ProviderRow = { id: string; display_name: string; provider_name: string; default_model: string | null; is_system_default: boolean; has_api_key: boolean; base_url: string | null }

function WorkspaceCard({ workspace: ws, providers, isActive, onDeleted, onSaved }: {
    workspace: WorkspaceRow
    providers: ProviderRow[]
    isActive: boolean
    onDeleted: () => void
    onSaved: () => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [name, setName] = useState(ws.name)
    const [description, setDescription] = useState(ws.description ?? '')
    const [icon, setIcon] = useState(ws.icon ?? '')
    const [providerId, setProviderId] = useState(ws.llm_provider_id ?? '')
    const [model, setModel] = useState(ws.llm_model ?? '')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const selectedProvider = providers.find(p => p.id === providerId)

    const handleSave = async () => {
        setSaving(true)
        await updateWorkspace(ws.id, {
            name: name.trim(),
            description: description || null,
            icon: icon || null,
            llm_provider_id: providerId || null,
            llm_model: model || null,
        })
        setSaving(false); setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        onSaved()
    }

    const handleDelete = async () => {
        if (!confirm(`Delete workspace "${ws.name}"? This cannot be undone.`)) return
        setDeleting(true)
        await deleteWorkspace(ws.id)
        onDeleted()
    }

    return (
        <div className={`glass-card overflow-hidden ${isActive ? 'border-accent/40' : ''}`}>
            <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0 text-lg">
                    {ws.icon || <FolderOpen className="w-4 h-4 text-accent" />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{ws.name}</span>
                        {isActive && <span className="chip-accent text-[10px]">Current</span>}
                        <span className="text-xs text-muted-foreground">{ws.note_count} notes · {ws.conversation_count} chats</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {ws.description || (ws.llm_provider_id ? `Provider override set` : 'Using global default provider')}
                    </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                    <button className="btn-ghost p-1.5" onClick={() => setExpanded(p => !p)}>
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <button className="btn-ghost p-1.5 text-red-400 hover:bg-destructive/10" onClick={handleDelete} disabled={deleting}>
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-border/50 px-4 py-4 space-y-3 animate-fade-in">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                            <input className="input text-sm" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Icon (emoji)</label>
                            <input className="input text-sm" placeholder="e.g. 🧠" value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                        <textarea className="input text-sm resize-none" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
                    </div>

                    <div className="border-t border-border/40 pt-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">AI Override <span className="text-xs font-normal opacity-60">(overrides global default for this workspace)</span></p>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Provider</label>
                            <select className="input text-sm" value={providerId} onChange={e => { setProviderId(e.target.value); setModel('') }}>
                                <option value="">Use global default</option>
                                {providers.map(p => (
                                    <option key={p.id} value={p.id}>{p.display_name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Model override</label>
                            <input
                                className="input text-sm"
                                placeholder={selectedProvider?.default_model ?? 'Inherits from provider'}
                                value={model}
                                onChange={e => setModel(e.target.value)}
                            />
                        </div>
                    </div>

                    <button className="btn-primary text-xs py-1.5 px-3" onClick={handleSave} disabled={saving}>
                        {saved
                            ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</>
                            : saving
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <><Save className="w-3.5 h-3.5" /> Save</>}
                    </button>
                </div>
            )}
        </div>
    )
}

// ── LLM Settings Tab ──────────────────────────────────────────────────────────
function LLMSettings() {
    const qc = useQueryClient()
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const [expanded, setExpanded] = useState<string | null>(null)
    const [showAdd, setShowAdd] = useState(false)

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-sm">AI Providers</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Each entry is a provider + model pair. <Star className="w-3 h-3 inline-block text-amber-400" /> default is used for new chats.
                    </p>
                </div>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                    <Plus className="w-3.5 h-3.5" /> {showAdd ? 'Close' : 'Add Provider'}
                </button>
            </div>

            {showAdd && (
                <AddProviderPanel onAdded={() => qc.invalidateQueries({ queryKey: ['providers'] })} />
            )}

            {(providers as ProviderRow[]).map(p => (
                <ProviderCard
                    key={p.id}
                    provider={p}
                    expanded={expanded === p.id}
                    onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                    onDelete={() => deleteProvider(p.id).then(() => qc.invalidateQueries({ queryKey: ['providers'] }))}
                    onSetDefault={() => setDefaultProvider(p.id).then(() => qc.invalidateQueries({ queryKey: ['providers'] }))}
                />
            ))}

            {(providers as unknown[]).length === 0 && !showAdd && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                    <Server className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>No AI providers configured yet.</p>
                </div>
            )}
        </div>
    )
}

// ── Add Provider Panel ────────────────────────────────────────────────────────
function AddProviderPanel({ onAdded }: { onAdded: () => void }) {
    const [providerName, setProviderName] = useState('openai')
    const [displayName, setDisplayName] = useState('')
    const [apiKey, setApiKey] = useState('')
    const [baseUrl, setBaseUrl] = useState('')
    const [showKey, setShowKey] = useState(false)

    const [loadingModels, setLoadingModels] = useState(false)
    const [models, setModels] = useState<{ id: string; name: string }[] | null>(null)
    const [modelError, setModelError] = useState<string | null>(null)
    const [modelSearch, setModelSearch] = useState('')
    const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
    const [manualModel, setManualModel] = useState('')

    const [saving, setSaving] = useState(false)
    const [savedCount, setSavedCount] = useState(0)
    const [saveError, setSaveError] = useState<string | null>(null)

    const meta = PROVIDER_META[providerName]

    const handleProviderChange = (id: string) => {
        setProviderName(id); setDisplayName(''); setApiKey(''); setBaseUrl('')
        setShowKey(false); setModels(null); setModelError(null)
        setModelSearch(''); setSelectedModels(new Set()); setManualModel('')
        setSavedCount(0); setSaveError(null)
    }

    const filteredModels = useMemo(() => {
        if (!models) return []
        const q = modelSearch.toLowerCase()
        return q ? models.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : models
    }, [models, modelSearch])

    const handleFetchModels = async () => {
        setLoadingModels(true); setModelError(null); setModels(null)
        setSelectedModels(new Set()); setModelSearch('')
        try {
            const temp = await createProvider({
                provider_name: providerName,
                display_name: displayName || meta?.name || providerName,
                api_key: apiKey || undefined,
                base_url: baseUrl || undefined,
            })
            const list = await listModels(temp.id)
            setModels(list)
            if (list.length <= 10) setSelectedModels(new Set(list.map((m: { id: string }) => m.id)))
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setModelError(err?.response?.data?.detail ?? err?.message ?? 'Failed to fetch models')
        } finally { setLoadingModels(false) }
    }

    const toggleModel = (id: string) => setSelectedModels(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
    })

    const handleSave = async () => {
        const modelsToSave = models ? [...selectedModels] : manualModel.trim() ? [manualModel.trim()] : []
        if (!modelsToSave.length) { setSaveError('Select at least one model or type a model ID.'); return }
        setSaving(true); setSaveError(null); let count = 0
        try {
            for (const modelId of modelsToSave) {
                const label = models?.find(m => m.id === modelId)?.name ?? modelId
                await createProvider({
                    provider_name: providerName,
                    display_name: displayName ? `${displayName} — ${label}` : `${meta?.name ?? providerName} — ${label}`,
                    api_key: apiKey || undefined,
                    base_url: baseUrl || undefined,
                    default_model: modelId,
                })
                count++
            }
            setSavedCount(count); onAdded()
            setModels(null); setSelectedModels(new Set()); setManualModel(''); setSaveError(null)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setSaveError(err?.response?.data?.detail ?? err?.message ?? 'Save failed')
        } finally { setSaving(false) }
    }

    const canFetch = meta?.needsUrl ? !!baseUrl : !!apiKey
    const totalSelected = models ? selectedModels.size : (manualModel.trim() ? 1 : 0)

    return (
        <div className="glass-card p-5 space-y-4 border border-accent/20 animate-fade-in">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-accent">Add Provider + Models</h4>
                {savedCount > 0 && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {savedCount} added
                    </span>
                )}
            </div>

            {/* Step 1 — Provider */}
            <div>
                <label className="text-xs text-muted-foreground mb-2 block font-medium">1. Select provider</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {PROVIDER_NAMES.map(id => {
                        const m = PROVIDER_META[id]
                        return (
                            <button key={id} onClick={() => handleProviderChange(id)}
                                className={`p-2 rounded-lg border text-center text-xs transition-all ${providerName === id ? `${m.color} border-2 scale-105` : 'border-border hover:bg-muted/30'
                                    }`}
                            >
                                <div className="flex justify-center mb-1">
                                    <ProviderIcon providerId={id} className="w-4 h-4" />
                                </div>
                                <div className="text-[10px] leading-tight truncate">{m.name}</div>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Step 2 — Credentials */}
            <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium block">2. Enter credentials</label>
                <input className="input text-sm" placeholder={`Display name (default: ${meta?.name})`} value={displayName} onChange={e => setDisplayName(e.target.value)} />
                {meta?.needsUrl ? (
                    <>
                        <input className="input text-sm" placeholder={meta.urlPlaceholder ?? 'https://your-api.com'} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                        <div className="relative">
                            <input type={showKey ? 'text' : 'password'} className="input text-sm pr-10" placeholder={meta.placeholder} value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(v => !v)}>
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="relative">
                        <input type={showKey ? 'text' : 'password'} className="input text-sm pr-10" placeholder={meta?.placeholder ?? 'API Key'} value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(v => !v)}>
                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                )}
            </div>

            {/* Step 3 — Test + model fetch */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground font-medium">3. Test &amp; fetch models</label>
                    <button className="btn-primary text-xs py-1.5 px-3 gap-1.5" onClick={handleFetchModels} disabled={loadingModels || !canFetch}>
                        {loadingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe2 className="w-3 h-3" />}
                        {models ? 'Refresh' : 'Test & Fetch Models'}
                    </button>
                </div>

                {modelError && (
                    <div className="text-xs p-3 rounded-lg bg-destructive/10 text-red-300 border border-destructive/20 space-y-1">
                        <p className="font-medium">Could not fetch model list</p>
                        <p className="opacity-80">{modelError}</p>
                        <p className="text-muted-foreground mt-1">Type model ID directly:</p>
                        <input className="input text-xs mt-1" placeholder="e.g. gpt-4o" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                    </div>
                )}

                {models !== null && models.length > 0 && (
                    <div className="space-y-1.5">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input className="input text-xs pl-8" placeholder={`Filter ${models.length} models…`} value={modelSearch} onChange={e => setModelSearch(e.target.value)} />
                        </div>
                        <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] text-muted-foreground">{selectedModels.size} / {filteredModels.length} selected</span>
                            <button className="text-[10px] text-accent hover:underline" onClick={() => {
                                selectedModels.size === filteredModels.length
                                    ? setSelectedModels(new Set())
                                    : setSelectedModels(new Set(filteredModels.map(m => m.id)))
                            }}>{selectedModels.size === filteredModels.length ? 'Deselect all' : 'Select all'}</button>
                        </div>
                        <div className="max-h-52 overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20">
                            {filteredModels.map(m => {
                                const checked = selectedModels.has(m.id)
                                return (
                                    <button key={m.id} onClick={() => toggleModel(m.id)} className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-muted/30 transition-colors ${checked ? 'bg-accent/5' : ''}`}>
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

                {models === null && !modelError && (
                    <input className="input text-xs" placeholder="Or type model ID directly (e.g. gpt-4o)" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                )}
            </div>

            {saveError && <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-300 border border-destructive/20">{saveError}</div>}

            {/* Step 4 — Save */}
            <button className="btn-primary w-full justify-center py-2.5" onClick={handleSave} disabled={saving || totalSelected === 0}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? `Saving…` : totalSelected > 0 ? `Add ${totalSelected} provider${totalSelected > 1 ? 's' : ''}` : 'Select models above'}
            </button>
            <p className="text-[10px] text-muted-foreground text-center">Panel stays open — add more providers after saving</p>
        </div>
    )
}

// ── Provider Card ────────────────────────────────────────────────────────────
function ProviderCard({ provider, expanded, onToggle, onDelete, onSetDefault }: {
    provider: ProviderRow; expanded: boolean
    onToggle: () => void; onDelete: () => void; onSetDefault: () => void
}) {
    const qc = useQueryClient()
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
    const [models, setModels] = useState<{ id: string; name: string }[] | null>(null)
    const [loadingModels, setLoadingModels] = useState(false)
    const [modelSearch, setModelSearch] = useState('')
    const [selectedModel, setSelectedModel] = useState(provider.default_model ?? '')
    const [savingModel, setSavingModel] = useState(false)
    const [modelSaved, setModelSaved] = useState(false)

    const meta = PROVIDER_META[provider.provider_name]
    const filteredModels = useMemo(() => {
        if (!models) return []
        const q = modelSearch.toLowerCase()
        return q ? models.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : models
    }, [models, modelSearch])

    const handleTest = async () => {
        setTesting(true); setTestResult(null)
        try { setTestResult(await testConnection(provider.id)) }
        catch { setTestResult({ success: false, message: 'Request failed' }) }
        finally { setTesting(false) }
    }

    const handleLoadModels = async () => {
        setLoadingModels(true)
        try { setModels(await listModels(provider.id)) }
        catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setTestResult({ success: false, message: err?.response?.data?.detail ?? err?.message ?? 'Failed' })
            setModels([])
        }
        finally { setLoadingModels(false) }
    }

    const handleSaveModel = async () => {
        setSavingModel(true)
        await updateProvider(provider.id, { default_model: selectedModel })
        qc.invalidateQueries({ queryKey: ['providers'] })
        setSavingModel(false); setModelSaved(true)
        setTimeout(() => setModelSaved(false), 2000)
    }

    return (
        <div className="glass-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${meta?.color ?? 'bg-muted border-border'}`}>
                    <ProviderIcon providerId={provider.provider_name} className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{provider.display_name}</span>
                        <span className="chip-muted text-[10px]">{provider.provider_name}</span>
                        {provider.is_system_default && <span className="chip-accent text-[10px]"><Star className="w-2.5 h-2.5 mr-0.5 inline" />Default</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {provider.has_api_key ? 'Key set' : provider.base_url ?? 'No credentials'}
                        {provider.default_model ? ` · ${provider.default_model}` : ''}
                    </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                    {!provider.is_system_default && (
                        <button className="btn-ghost p-1.5" title="Set as default" onClick={onSetDefault}><Star className="w-3.5 h-3.5" /></button>
                    )}
                    <button className="btn-ghost p-1.5 text-red-400" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></button>
                    <button className="btn-ghost p-1.5" onClick={onToggle}>
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-border/50 px-4 py-4 space-y-3 animate-fade-in">
                    <button className="btn-ghost text-xs border border-border w-full justify-center py-2" onClick={handleTest} disabled={testing}>
                        {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe2 className="w-3.5 h-3.5" />}
                        {testing ? 'Testing…' : 'Test Connection'}
                    </button>
                    {testResult && (
                        <div className={`flex items-start gap-2 text-xs p-2.5 rounded-lg ${testResult.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-destructive/10 text-red-300 border border-destructive/20'}`}>
                            {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                            {testResult.message}
                        </div>
                    )}

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">Model</label>
                            <button className="text-xs text-accent flex items-center gap-1" onClick={handleLoadModels} disabled={loadingModels}>
                                {loadingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                {models ? 'Refresh' : 'Load models'}
                            </button>
                        </div>
                        {models !== null && models.length > 0 && (
                            <>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                    <input className="input text-xs pl-7" placeholder="Filter models…" value={modelSearch} onChange={e => setModelSearch(e.target.value)} />
                                </div>
                                <div className="max-h-36 overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20">
                                    {filteredModels.map(m => (
                                        <button key={m.id} onClick={() => setSelectedModel(m.id)}
                                            className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-muted/30 transition-colors ${selectedModel === m.id ? 'bg-accent/10 text-accent' : 'text-muted-foreground'}`}>
                                            {selectedModel === m.id ? <Zap className="w-3 h-3 flex-shrink-0" /> : <span className="w-3" />}
                                            {m.name}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                        <div className="flex gap-2">
                            <input className="input text-xs flex-1 py-1.5" placeholder="Model ID…" value={selectedModel} onChange={e => setSelectedModel(e.target.value)} />
                            <button className="btn-primary text-xs py-1.5 px-3" onClick={handleSaveModel} disabled={savingModel || !selectedModel}>
                                {modelSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : savingModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                {modelSaved ? 'Saved' : 'Set'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
