import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    listProviders, createProvider, updateProvider, deleteProvider,
    testConnection, listModels, setDefaultProvider, updateWorkspace, getWorkspace
} from '@/lib/api'
import { Settings, Globe2, Loader2, Trash2, CheckCircle2, XCircle, Star, Plus, ChevronDown, ChevronUp } from 'lucide-react'

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
                        {t === 'workspace' ? 'Workspace' : 'AI Providers'}
                    </button>
                ))}
            </div>

            {activeTab === 'workspace' && <WorkspaceSettings workspaceId={workspaceId} />}
            {activeTab === 'llm' && <LLMSettings workspaceId={workspaceId} />}
        </div>
    )
}

function WorkspaceSettings({ workspaceId }: { workspaceId: string }) {
    const qc = useQueryClient()
    const { data: ws } = useQuery({ queryKey: ['workspace', workspaceId], queryFn: () => getWorkspace(workspaceId) })
    const [name, setName] = useState(ws?.name ?? '')
    const [description, setDescription] = useState(ws?.description ?? '')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        await updateWorkspace(workspaceId, { name, description })
        qc.invalidateQueries({ queryKey: ['workspaces'] })
        qc.invalidateQueries({ queryKey: ['workspace', workspaceId] })
        setSaving(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    return (
        <div className="space-y-4">
            <div className="glass-card p-5 space-y-4">
                <h3 className="font-semibold text-sm">Workspace Settings</h3>
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                    <input className="input" value={name || ws?.name || ''} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                    <textarea className="input resize-none" rows={3} value={description || ws?.description || ''} onChange={e => setDescription(e.target.value)} />
                </div>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : null}
                    {saved ? 'Saved!' : 'Save Changes'}
                </button>
            </div>
        </div>
    )
}

function LLMSettings({ workspaceId }: { workspaceId: string }) {
    const qc = useQueryClient()
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const [expanded, setExpanded] = useState<string | null>(null)
    const [showAdd, setShowAdd] = useState(false)
    const [testing, setTesting] = useState<string | null>(null)
    const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})
    const [models, setModels] = useState<Record<string, { id: string; name: string }[]>>({})
    const [newProvider, setNewProvider] = useState({ provider_name: 'openai', display_name: '', api_key: '', base_url: '', default_model: '' })

    const PROVIDER_NAMES = ['openai', 'anthropic', 'gemini', 'groq', 'deepseek', 'mistral', 'openrouter', 'ollama']

    const handleTest = async (providerId: string) => {
        setTesting(providerId)
        const result = await testConnection(providerId)
        setTestResults(p => ({ ...p, [providerId]: result }))
        const modelList = await listModels(providerId)
        setModels(p => ({ ...p, [providerId]: modelList }))
        setTesting(null)
    }

    const handleDelete = async (providerId: string) => {
        await deleteProvider(providerId)
        qc.invalidateQueries({ queryKey: ['providers'] })
    }

    const handleSetDefault = async (providerId: string) => {
        await setDefaultProvider(providerId)
        qc.invalidateQueries({ queryKey: ['providers'] })
    }

    const handleAdd = async () => {
        await createProvider({
            provider_name: newProvider.provider_name,
            display_name: newProvider.display_name || newProvider.provider_name,
            api_key: newProvider.api_key || undefined,
            base_url: newProvider.base_url || undefined,
            default_model: newProvider.default_model || undefined,
        })
        qc.invalidateQueries({ queryKey: ['providers'] })
        setShowAdd(false)
        setNewProvider({ provider_name: 'openai', display_name: '', api_key: '', base_url: '', default_model: '' })
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">AI Providers</h3>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                    <Plus className="w-3.5 h-3.5" /> Add Provider
                </button>
            </div>

            {showAdd && (
                <div className="glass-card p-4 space-y-3 animate-slide-up">
                    <select className="input text-sm" value={newProvider.provider_name} onChange={e => setNewProvider(p => ({ ...p, provider_name: e.target.value, display_name: e.target.value }))}>
                        {PROVIDER_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <input className="input text-sm" placeholder="Display name" value={newProvider.display_name} onChange={e => setNewProvider(p => ({ ...p, display_name: e.target.value }))} />
                    {newProvider.provider_name !== 'ollama' && (
                        <input type="password" className="input text-sm" placeholder="API key" value={newProvider.api_key} onChange={e => setNewProvider(p => ({ ...p, api_key: e.target.value }))} />
                    )}
                    {newProvider.provider_name === 'ollama' && (
                        <input className="input text-sm" placeholder="Base URL (http://localhost:11434)" value={newProvider.base_url} onChange={e => setNewProvider(p => ({ ...p, base_url: e.target.value }))} />
                    )}
                    <input className="input text-sm" placeholder="Default model (optional)" value={newProvider.default_model} onChange={e => setNewProvider(p => ({ ...p, default_model: e.target.value }))} />
                    <div className="flex gap-2">
                        <button className="btn-primary text-sm" onClick={handleAdd}>Save Provider</button>
                        <button className="btn-ghost text-sm" onClick={() => setShowAdd(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {(providers as { id: string; provider_name: string; display_name: string; is_system_default: boolean; has_api_key: boolean; default_model: string }[]).map(p => (
                <div key={p.id} className="glass-card overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{p.display_name}</span>
                                <span className="chip-muted text-xs">{p.provider_name}</span>
                                {p.is_system_default && <span className="chip-accent text-xs"><Star className="w-3 h-3 mr-0.5 inline" />Default</span>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {p.has_api_key ? '🔑 API key configured' : '⚠️ No API key'} {p.default_model ? `• ${p.default_model}` : ''}
                            </p>
                        </div>
                        <div className="flex gap-1">
                            {!p.is_system_default && (
                                <button className="btn-ghost text-xs p-1.5" title="Set as default" onClick={() => handleSetDefault(p.id)}>
                                    <Star className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <button className="btn-ghost text-xs p-1.5 text-red-400" onClick={() => handleDelete(p.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button className="btn-ghost text-xs p-1.5" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                                {expanded === p.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                    </div>

                    {expanded === p.id && (
                        <div className="border-t border-border/50 px-4 py-3 space-y-3">
                            <button
                                className="btn-ghost text-xs border border-border w-full justify-center"
                                onClick={() => handleTest(p.id)}
                                disabled={testing === p.id}
                            >
                                {testing === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe2 className="w-3.5 h-3.5" />}
                                {testing === p.id ? 'Testing…' : 'Test Connection'}
                            </button>
                            {testResults[p.id] && (
                                <div className={`flex items-center gap-2 text-xs p-2 rounded-lg ${testResults[p.id].success ? 'bg-emerald-500/10 text-emerald-300' : 'bg-destructive/10 text-red-300'}`}>
                                    {testResults[p.id].success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                    {testResults[p.id].message}
                                </div>
                            )}
                            {models[p.id] && models[p.id].length > 0 && (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Available models ({models[p.id].length})</p>
                                    <div className="max-h-32 overflow-y-auto space-y-0.5">
                                        {models[p.id].map(m => (
                                            <div key={m.id} className="text-xs text-muted-foreground py-0.5 px-2 hover:bg-muted/30 rounded">{m.name}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}

            {(providers as unknown[]).length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm">
                    No AI providers configured. Add one to enable AI features.
                </div>
            )}
        </div>
    )
}
