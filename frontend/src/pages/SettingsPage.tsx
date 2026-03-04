import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    listProviders, createProvider, updateProvider, deleteProvider,
    testConnection, listModels, setDefaultProvider, updateWorkspace, getWorkspace
} from '@/lib/api'
import {
    Settings, Globe2, Loader2, Trash2, CheckCircle2, XCircle, Star, Plus,
    ChevronDown, ChevronUp, Eye, EyeOff, RefreshCw, Zap, Server
} from 'lucide-react'

// ── Provider registry ──────────────────────────────────────────────────────
const PROVIDER_META: Record<string, { name: string; icon: string; color: string; needsKey: boolean; placeholder: string }> = {
    openai: { name: 'OpenAI', icon: '🌐', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300', needsKey: true, placeholder: 'sk-proj-…' },
    anthropic: { name: 'Anthropic', icon: '🔮', color: 'bg-orange-500/10 border-orange-500/20 text-orange-300', needsKey: true, placeholder: 'sk-ant-…' },
    gemini: { name: 'Google Gemini', icon: '♊', color: 'bg-blue-500/10 border-blue-500/20 text-blue-300', needsKey: true, placeholder: 'AIza…' },
    groq: { name: 'Groq', icon: '⚡', color: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300', needsKey: true, placeholder: 'gsk_…' },
    deepseek: { name: 'DeepSeek', icon: '🧠', color: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300', needsKey: true, placeholder: 'sk-…' },
    mistral: { name: 'Mistral AI', icon: '🌀', color: 'bg-purple-500/10 border-purple-500/20 text-purple-300', needsKey: true, placeholder: 'Key…' },
    openrouter: { name: 'OpenRouter', icon: '🔀', color: 'bg-pink-500/10 border-pink-500/20 text-pink-300', needsKey: true, placeholder: 'sk-or-…' },
    xai: { name: 'xAI (Grok)', icon: '𝕏', color: 'bg-gray-500/10 border-gray-500/20 text-gray-300', needsKey: true, placeholder: 'xai-…' },
    cohere: { name: 'Cohere', icon: '🌊', color: 'bg-teal-500/10 border-teal-500/20 text-teal-300', needsKey: true, placeholder: 'API key…' },
    ollama: { name: 'Ollama', icon: '🦙', color: 'bg-lime-500/10 border-lime-500/20 text-lime-300', needsKey: false, placeholder: 'http://localhost:11434' },
}

const PROVIDER_NAMES = Object.keys(PROVIDER_META)

export default function SettingsPage() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const [activeTab, setActiveTab] = useState<'workspace' | 'llm'>('workspace')

    return (
        <div className="max-w-2xl mx-auto p-6">
            <div className="flex items-center gap-3 mb-8">
                <Settings className="w-5 h-5 text-accent" />
                <h1 className="text-xl font-bold">Settings</h1>
            </div>

            <div className="flex gap-2 mb-6">
                {(['workspace', 'llm'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setActiveTab(t)}
                        className={`px-4 py-2 text-sm rounded-lg transition-all ${activeTab === t ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                    >
                        {t === 'workspace' ? '🗂️ Workspace' : '🤖 AI Providers'}
                    </button>
                ))}
            </div>

            {activeTab === 'workspace' && <WorkspaceSettings workspaceId={workspaceId} />}
            {activeTab === 'llm' && <LLMSettings />}
        </div>
    )
}

// ── Workspace Settings ────────────────────────────────────────────────────
function WorkspaceSettings({ workspaceId }: { workspaceId: string }) {
    const qc = useQueryClient()
    const { data: ws } = useQuery({ queryKey: ['workspace', workspaceId], queryFn: () => getWorkspace(workspaceId) })
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        if (ws) { setName(ws.name ?? ''); setDescription(ws.description ?? '') }
    }, [ws])

    const handleSave = async () => {
        setSaving(true)
        await updateWorkspace(workspaceId, { name, description })
        qc.invalidateQueries({ queryKey: ['workspaces'] })
        qc.invalidateQueries({ queryKey: ['workspace', workspaceId] })
        setSaving(false); setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    return (
        <div className="space-y-4">
            <div className="glass-card p-5 space-y-4">
                <h3 className="font-semibold text-sm">Workspace Settings</h3>
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                    <input className="input" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                    <textarea className="input resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : null}
                    {saved ? 'Saved!' : 'Save Changes'}
                </button>
            </div>
        </div>
    )
}

// ── LLM Settings ─────────────────────────────────────────────────────────
function LLMSettings() {
    const qc = useQueryClient()
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const [expanded, setExpanded] = useState<string | null>(null)
    const [showAdd, setShowAdd] = useState(false)

    // Add provider form state
    const [newP, setNewP] = useState({
        provider_name: 'openai', display_name: '', api_key: '', base_url: '', default_model: ''
    })
    const [showKey, setShowKey] = useState(false)
    const [adding, setAdding] = useState(false)
    const [addError, setAddError] = useState<string | null>(null)

    const meta = PROVIDER_META[newP.provider_name]

    // Reset api_key when provider changes
    const handleProviderChange = (id: string) => {
        setNewP({ provider_name: id, display_name: PROVIDER_META[id]?.name ?? id, api_key: '', base_url: '', default_model: '' })
        setShowKey(false)
        setAddError(null)
    }

    const handleAdd = async () => {
        setAdding(true)
        setAddError(null)
        try {
            await createProvider({
                provider_name: newP.provider_name,
                display_name: newP.display_name || PROVIDER_META[newP.provider_name]?.name || newP.provider_name,
                api_key: newP.api_key || undefined,
                base_url: newP.base_url || undefined,
                default_model: newP.default_model || undefined,
            })
            qc.invalidateQueries({ queryKey: ['providers'] })
            setShowAdd(false)
            setNewP({ provider_name: 'openai', display_name: '', api_key: '', base_url: '', default_model: '' })
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setAddError(err?.response?.data?.detail ?? err?.message ?? 'Failed to add provider')
        } finally {
            setAdding(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-sm">AI Providers</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Each provider can have multiple models. The ⭐ default is used for new chats.</p>
                </div>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => { setShowAdd(p => !p); setAddError(null) }}>
                    <Plus className="w-3.5 h-3.5" /> Add Provider
                </button>
            </div>

            {/* ── Add Provider form ── */}
            {showAdd && (
                <div className="glass-card p-5 space-y-4 animate-scale-in border border-accent/20">
                    <h4 className="text-sm font-semibold text-accent">New Provider</h4>

                    {/* Provider selector as pill grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {PROVIDER_NAMES.map(id => {
                            const m = PROVIDER_META[id]
                            return (
                                <button
                                    key={id}
                                    onClick={() => handleProviderChange(id)}
                                    className={`p-2 rounded-lg border text-center text-xs transition-all ${newP.provider_name === id
                                            ? `${m.color} border-2 scale-105`
                                            : 'border-border hover:bg-muted/30'
                                        }`}
                                >
                                    <div className="text-base">{m.icon}</div>
                                    <div className="text-[10px] leading-tight mt-0.5 truncate">{m.name}</div>
                                </button>
                            )
                        })}
                    </div>

                    {/* Display name */}
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Display name</label>
                        <input
                            className="input text-sm"
                            placeholder={PROVIDER_META[newP.provider_name]?.name}
                            value={newP.display_name}
                            onChange={e => setNewP(p => ({ ...p, display_name: e.target.value }))}
                        />
                    </div>

                    {/* API key (or base URL for Ollama) */}
                    {meta?.needsKey ? (
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">API Key</label>
                            <div className="relative">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    className="input text-sm pr-10"
                                    placeholder={meta.placeholder}
                                    value={newP.api_key}
                                    onChange={e => setNewP(p => ({ ...p, api_key: e.target.value }))}
                                    autoComplete="off"
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    onClick={() => setShowKey(v => !v)}
                                >
                                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Ollama Base URL</label>
                            <input
                                className="input text-sm"
                                placeholder="http://localhost:11434"
                                value={newP.base_url}
                                onChange={e => setNewP(p => ({ ...p, base_url: e.target.value }))}
                            />
                        </div>
                    )}

                    {/* Default model */}
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Default model <span className="text-muted-foreground/60">(optional)</span></label>
                        <input
                            className="input text-sm"
                            placeholder="e.g. gpt-4o, claude-3-5-sonnet-20241022"
                            value={newP.default_model}
                            onChange={e => setNewP(p => ({ ...p, default_model: e.target.value }))}
                        />
                    </div>

                    {addError && (
                        <div className="p-2 rounded-lg bg-destructive/10 text-red-300 text-xs">{addError}</div>
                    )}

                    <div className="flex gap-2">
                        <button className="btn-primary text-sm flex-1 justify-center" onClick={handleAdd} disabled={adding}>
                            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            {adding ? 'Saving…' : 'Save Provider'}
                        </button>
                        <button className="btn-ghost text-sm px-4" onClick={() => { setShowAdd(false); setAddError(null) }}>Cancel</button>
                    </div>
                </div>
            )}

            {/* ── Provider List ── */}
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
                    <p>No AI providers configured.</p>
                    <p className="text-xs mt-1">Add one above to enable AI features.</p>
                </div>
            )}
        </div>
    )
}

type ProviderRow = {
    id: string
    provider_name: string
    display_name: string
    is_system_default: boolean
    has_api_key: boolean
    default_model: string | null
    base_url: string | null
}

// ── Provider card with inline model management ────────────────────────────
function ProviderCard({
    provider, expanded, onToggle, onDelete, onSetDefault
}: {
    provider: ProviderRow
    expanded: boolean
    onToggle: () => void
    onDelete: () => void
    onSetDefault: () => void
}) {
    const qc = useQueryClient()
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
    const [models, setModels] = useState<{ id: string; name: string }[] | null>(null)
    const [loadingModels, setLoadingModels] = useState(false)
    const [selectedModel, setSelectedModel] = useState(provider.default_model ?? '')
    const [savingModel, setSavingModel] = useState(false)
    const [modelSaved, setModelSaved] = useState(false)

    const meta = PROVIDER_META[provider.provider_name]

    const handleTest = async () => {
        setTesting(true)
        setTestResult(null)
        try {
            const result = await testConnection(provider.id)
            setTestResult(result)
        } catch {
            setTestResult({ success: false, message: 'Request failed' })
        } finally {
            setTesting(false)
        }
    }

    const handleLoadModels = async () => {
        setLoadingModels(true)
        try {
            const list = await listModels(provider.id)
            setModels(list)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setTestResult({ success: false, message: err?.response?.data?.detail ?? err?.message ?? 'Failed to fetch models' })
            setModels([])
        } finally {
            setLoadingModels(false)
        }
    }

    const handleSaveModel = async () => {
        setSavingModel(true)
        await updateProvider(provider.id, { default_model: selectedModel })
        qc.invalidateQueries({ queryKey: ['providers'] })
        setSavingModel(false)
        setModelSaved(true)
        setTimeout(() => setModelSaved(false), 2000)
    }

    return (
        <div className="glass-card overflow-hidden transition-all duration-200">
            {/* Header row */}
            <div className="flex items-center gap-3 px-4 py-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base border ${meta?.color ?? 'bg-muted border-border'}`}>
                    {meta?.icon ?? '🤖'}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{provider.display_name}</span>
                        <span className="chip-muted text-[10px]">{provider.provider_name}</span>
                        {provider.is_system_default && (
                            <span className="chip-accent text-[10px]"><Star className="w-2.5 h-2.5 mr-0.5 inline" />Default</span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {provider.has_api_key ? '🔑 Key configured' : provider.base_url ? `🌐 ${provider.base_url}` : '⚠️ No credentials'}
                        {provider.default_model ? ` · ${provider.default_model}` : ''}
                    </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                    {!provider.is_system_default && (
                        <button className="btn-ghost text-xs p-1.5" title="Set as default" onClick={onSetDefault}>
                            <Star className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button className="btn-ghost text-xs p-1.5 text-red-400 hover:text-red-300" onClick={onDelete} title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button className="btn-ghost text-xs p-1.5" onClick={onToggle}>
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {/* Expanded panel */}
            {expanded && (
                <div className="border-t border-border/50 px-4 py-4 space-y-4 animate-fade-in">

                    {/* Test Connection */}
                    <div className="space-y-2">
                        <button
                            className="btn-ghost text-xs border border-border w-full justify-center py-2"
                            onClick={handleTest}
                            disabled={testing}
                        >
                            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe2 className="w-3.5 h-3.5" />}
                            {testing ? 'Testing…' : 'Test Connection'}
                        </button>
                        {testResult && (
                            <div className={`flex items-start gap-2 text-xs p-2.5 rounded-lg ${testResult.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-destructive/10 text-red-300 border border-destructive/20'}`}>
                                {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                                <span>{testResult.message}</span>
                            </div>
                        )}
                    </div>

                    {/* Model Management */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">Default Model</label>
                            <button
                                className="text-xs text-accent hover:text-accent/80 flex items-center gap-1"
                                onClick={handleLoadModels}
                                disabled={loadingModels}
                            >
                                {loadingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                {models ? 'Refresh models' : 'Load models'}
                            </button>
                        </div>

                        {models !== null ? (
                            models.length > 0 ? (
                                <div className="space-y-1">
                                    {/* Model list as selectable pills */}
                                    <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 bg-background/30">
                                        {models.map(m => (
                                            <button
                                                key={m.id}
                                                onClick={() => setSelectedModel(m.id)}
                                                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted/30 transition-colors ${selectedModel === m.id ? 'bg-accent/10 text-accent' : 'text-foreground'}`}
                                            >
                                                {selectedModel === m.id ? <Zap className="w-3 h-3 flex-shrink-0" /> : <span className="w-3" />}
                                                {m.name}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 items-center pt-1">
                                        <input
                                            className="input text-xs flex-1 py-1.5"
                                            placeholder="Or type model ID…"
                                            value={selectedModel}
                                            onChange={e => setSelectedModel(e.target.value)}
                                        />
                                        <button
                                            className="btn-primary text-xs py-1.5 px-3"
                                            onClick={handleSaveModel}
                                            disabled={savingModel || !selectedModel}
                                        >
                                            {modelSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : savingModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                            {modelSaved ? 'Saved' : 'Set Default'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground text-center py-3 border border-border/50 rounded-lg">
                                    No models found — check connection
                                </p>
                            )
                        ) : (
                            <div className="flex gap-2 items-center">
                                <input
                                    className="input text-xs flex-1 py-1.5"
                                    placeholder="Type model ID…"
                                    value={selectedModel}
                                    onChange={e => setSelectedModel(e.target.value)}
                                />
                                <button
                                    className="btn-primary text-xs py-1.5 px-3"
                                    onClick={handleSaveModel}
                                    disabled={savingModel || !selectedModel}
                                >
                                    {modelSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : savingModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                    {modelSaved ? 'Saved' : 'Set Default'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
