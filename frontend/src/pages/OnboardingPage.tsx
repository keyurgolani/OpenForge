import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
    getOnboarding, advanceOnboarding, createProvider,
    testConnection, listModels, createWorkspace, listProviders
} from '@/lib/api'
import { Sparkles, ArrowRight, CheckCircle2, Loader2, Globe2, Eye, EyeOff, Plus, Trash2, FileText, Search, MessageSquare, Lock } from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', color: 'from-emerald-500/20 border-emerald-500/30', needsKey: true, needsUrl: false },
    { id: 'anthropic', name: 'Anthropic', color: 'from-orange-500/20 border-orange-500/30', needsKey: true, needsUrl: false },
    { id: 'gemini', name: 'Google Gemini', color: 'from-blue-500/20 border-blue-500/30', needsKey: true, needsUrl: false },
    { id: 'groq', name: 'Groq', color: 'from-yellow-500/20 border-yellow-500/30', needsKey: true, needsUrl: false },
    { id: 'deepseek', name: 'DeepSeek', color: 'from-cyan-500/20 border-cyan-500/30', needsKey: true, needsUrl: false },
    { id: 'mistral', name: 'Mistral AI', color: 'from-purple-500/20 border-purple-500/30', needsKey: true, needsUrl: false },
    { id: 'openrouter', name: 'OpenRouter', color: 'from-pink-500/20 border-pink-500/30', needsKey: true, needsUrl: false },
    { id: 'xai', name: 'xAI (Grok)', color: 'from-gray-500/20 border-gray-500/30', needsKey: true, needsUrl: false },
    { id: 'cohere', name: 'Cohere', color: 'from-teal-500/20 border-teal-500/30', needsKey: true, needsUrl: false },
    { id: 'zhipuai', name: 'Z.AI (ZhipuAI)', color: 'from-indigo-500/20 border-indigo-500/30', needsKey: true, needsUrl: false },
    { id: 'huggingface', name: 'HuggingFace', color: 'from-orange-400/20 border-orange-400/30', needsKey: true, needsUrl: false },
    { id: 'ollama', name: 'Ollama (Local)', color: 'from-lime-500/20 border-lime-500/30', needsKey: false, needsUrl: true },
    { id: 'custom-openai', name: 'Custom OpenAI-compatible', color: 'from-violet-500/20 border-violet-500/30', needsKey: false, needsUrl: true },
    { id: 'custom-anthropic', name: 'Custom Anthropic-compat.', color: 'from-rose-500/20 border-rose-500/30', needsKey: false, needsUrl: true },
]

const STEPS = ['welcome', 'llm_setup', 'workspace_create']

export default function OnboardingPage() {
    const navigate = useNavigate()
    const qc = useQueryClient()
    const { data: onboarding } = useQuery({
        queryKey: ['onboarding'],
        queryFn: getOnboarding,
        staleTime: 0,
        refetchOnMount: true,
    })
    const advance = useMutation({
        mutationFn: (step: string) => advanceOnboarding(step),
        onSuccess: () => {
            // Invalidate so the query re-fetches the new step from the server
            qc.invalidateQueries({ queryKey: ['onboarding'] })
        },
    })

    const step = onboarding?.current_step ?? 'welcome'

    useEffect(() => {
        if (onboarding?.is_complete) {
            qc.fetchQuery({
                queryKey: ['workspaces'],
                queryFn: () => import('@/lib/api').then(a => a.listWorkspaces()),
            }).then((ws: { id: string }[]) => {
                if (ws.length > 0) navigate(`/w/${ws[0].id}`)
            }).catch(() => { })
        }
    }, [onboarding?.is_complete, navigate, qc])

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <div className="w-full max-w-xl">
                {/* Logo */}
                <div className="flex items-center gap-3 mb-10 justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center shadow-lg shadow-accent/10">
                        <Sparkles className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">OpenForge</h1>
                        <p className="text-xs text-muted-foreground">Self-hosted AI workspace</p>
                    </div>
                </div>

                {/* Progress stepper */}
                <div className="flex items-center gap-2 justify-center mb-10">
                    {STEPS.map((s, i) => {
                        const stepIdx = STEPS.indexOf(step)
                        const isDone = stepIdx > i
                        const isActive = stepIdx === i
                        return (
                            <div key={s} className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${isDone ? 'bg-accent/40 text-accent ring-2 ring-accent/30' :
                                    isActive ? 'bg-accent text-accent-foreground scale-110 ring-2 ring-accent/50 shadow-lg shadow-accent/20' :
                                        'bg-muted text-muted-foreground'
                                    }`}>
                                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                                </div>
                                {i < STEPS.length - 1 && (
                                    <div className={`w-16 h-0.5 transition-all duration-500 ${isDone ? 'bg-accent/50' : 'bg-border'}`} />
                                )}
                            </div>
                        )
                    })}
                </div>

                {step === 'welcome' && (
                    <WelcomeStep onNext={() => advance.mutate('llm_setup')} loading={advance.isPending} />
                )}
                {step === 'llm_setup' && (
                    <LLMSetupStep onNext={() => advance.mutate('workspace_create')} loading={advance.isPending} />
                )}
                {step === 'workspace_create' && (
                    <WorkspaceCreateStep onNext={() => {
                        advance.mutateAsync('complete').then(() => {
                            qc.fetchQuery({
                                queryKey: ['workspaces'],
                                queryFn: () => import('@/lib/api').then(a => a.listWorkspaces()),
                            }).then((ws: { id: string }[]) => {
                                if (ws.length > 0) navigate(`/w/${ws[0].id}`)
                            })
                        })
                    }} />
                )}
            </div>
        </div>
    )
}

function WelcomeStep({ onNext, loading }: { onNext: () => void; loading: boolean }) {
    const FEATURES = [
        { Icon: FileText, text: 'Rich markdown notes with AI insights' },
        { Icon: Search, text: 'Semantic search across all your content' },
        { Icon: MessageSquare, text: 'Chat with your notes using any LLM' },
        { Icon: Lock, text: '100% private — runs on your hardware' },
    ]
    return (
        <div className="glass-card p-8 text-center space-y-6 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center mx-auto shadow-lg shadow-accent/10">
                <Sparkles className="w-8 h-8 text-accent" />
            </div>
            <div>
                <h2 className="text-2xl font-bold mb-2">Welcome to OpenForge</h2>
                <p className="text-muted-foreground leading-relaxed">
                    Your self-hosted AI workspace. Capture ideas, write beautifully, and chat with your knowledge — privately on your own server.
                </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-left text-sm">
                {FEATURES.map(({ Icon, text }) => (
                    <div key={text} className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/50">
                        <Icon className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                        <span className="text-muted-foreground text-xs leading-relaxed">{text}</span>
                    </div>
                ))}
            </div>
            <button className="btn-primary w-full justify-center text-base py-3" onClick={onNext} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Get Started <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    )
}

function LLMSetupStep({ onNext, loading }: { onNext: () => void; loading: boolean }) {
    // Configured providers (accumulated during this step)
    const [configured, setConfigured] = useState<{ id: string; name: string }[]>([])

    // Add-provider form state
    const [selected, setSelected] = useState<string | null>(null)
    const [apiKey, setApiKey] = useState('')
    const [showKey, setShowKey] = useState(false)
    const [baseUrl, setBaseUrl] = useState('')
    const [displayName, setDisplayName] = useState('')

    // Model fetch state
    const [fetchingModels, setFetchingModels] = useState(false)
    const [models, setModels] = useState<{ id: string; name: string }[] | null>(null)
    const [modelError, setModelError] = useState<string | null>(null)
    const [modelSearch, setModelSearch] = useState('')
    const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
    const [manualModel, setManualModel] = useState('')

    // Save state
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

    const provider = PROVIDERS.find(p => p.id === selected)

    const resetForm = () => {
        setSelected(null); setApiKey(''); setShowKey(false); setBaseUrl('')
        setDisplayName(''); setModels(null); setModelError(null); setModelSearch('')
        setSelectedModels(new Set()); setManualModel(''); setSaveError(null); setTestResult(null)
    }

    const handleSelectProvider = (id: string) => {
        setSelected(id); setApiKey(''); setShowKey(false)
        setBaseUrl(id === 'ollama' ? 'http://localhost:11434' : '')
        setDisplayName(''); setModels(null); setModelError(null)
        setSelectedModels(new Set()); setManualModel(''); setSaveError(null); setTestResult(null)
    }

    const canFetch = provider?.needsUrl ? !!baseUrl : !!apiKey

    const filteredModels = useMemo(() => {
        if (!models) return []
        const q = modelSearch.toLowerCase()
        return q ? models.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : models
    }, [models, modelSearch])

    const handleFetchModels = async () => {
        if (!selected || !canFetch) return
        setFetchingModels(true); setModelError(null); setModels(null)
        setSelectedModels(new Set()); setTestResult(null)
        try {
            const temp = await createProvider({
                provider_name: selected,
                display_name: displayName || provider?.name || selected,
                api_key: apiKey || undefined,
                base_url: baseUrl || undefined,
            })
            const result = await testConnection(temp.id)
            setTestResult(result)
            if (result.success) {
                try {
                    const list = await listModels(temp.id)
                    setModels(list)
                    if (list.length > 0 && list.length <= 20) {
                        setSelectedModels(new Set(list.map((m: { id: string }) => m.id)))
                    }
                } catch (me: unknown) {
                    const err = me as { response?: { data?: { detail?: string } }; message?: string }
                    setModelError(err?.response?.data?.detail ?? err?.message ?? 'Could not fetch models')
                    setModels([])
                }
            }
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setTestResult({ success: false, message: err?.response?.data?.detail ?? err?.message ?? 'Connection failed' })
        } finally {
            setFetchingModels(false)
        }
    }

    const toggleModel = (id: string) => setSelectedModels(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
    })

    const handleSave = async () => {
        const modelsToAdd = models ? [...selectedModels] : manualModel.trim() ? [manualModel.trim()] : []
        if (!modelsToAdd.length) { setSaveError('Select at least one model or enter a model ID.'); return }
        setSaving(true); setSaveError(null)
        try {
            for (const modelId of modelsToAdd) {
                const label = models?.find(m => m.id === modelId)?.name ?? modelId
                const saved = await createProvider({
                    provider_name: selected!,
                    display_name: displayName ? `${displayName} — ${label}` : `${provider?.name ?? selected} — ${label}`,
                    api_key: apiKey || undefined,
                    base_url: baseUrl || undefined,
                    default_model: modelId,
                })
                setConfigured(c => [...c, { id: saved.id, name: saved.display_name }])
            }
            resetForm()
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setSaveError(err?.response?.data?.detail ?? err?.message ?? 'Save failed')
        } finally {
            setSaving(false)
        }
    }

    const totalSelected = models ? selectedModels.size : (manualModel.trim() ? 1 : 0)

    return (
        <div className="glass-card p-6 space-y-5 animate-slide-up">
            <div>
                <h2 className="text-xl font-bold mb-1">Connect AI Providers</h2>
                <p className="text-muted-foreground text-sm">
                    Configure one or more providers. You can add more in Settings later.
                </p>
            </div>

            {/* Configured providers list */}
            {configured.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Configured</p>
                    {configured.map(c => (
                        <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            <span className="text-emerald-300 truncate">{c.name}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Add-provider form */}
            <div className="space-y-4 rounded-xl border border-border/60 p-4 bg-muted/10">
                {/* Step 1: Provider selection */}
                <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">1. Select provider</p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                        {PROVIDERS.map(p => (
                            <button key={p.id} onClick={() => handleSelectProvider(p.id)}
                                className={`p-2.5 rounded-xl border text-center transition-all ${selected === p.id
                                    ? `border-accent ring-1 ring-accent/30 bg-gradient-to-br ${p.color} to-transparent`
                                    : 'border-border hover:bg-muted/30'
                                    }`}
                            >
                                <div className="flex justify-center mb-1.5">
                                    <ProviderIcon providerId={p.id} className="w-4 h-4" />
                                </div>
                                <div className="text-[10px] leading-tight font-medium truncate">{p.name}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {selected && (
                    <>
                        {/* Step 2: Credentials */}
                        <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">2. Enter credentials</p>
                            {provider?.needsUrl ? (
                                <>
                                    <input className="input text-sm" placeholder={selected === 'ollama' ? 'http://localhost:11434' : 'https://your-endpoint.com'} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                                    <div className="relative">
                                        <input type={showKey ? 'text' : 'password'} className="input text-sm pr-10" placeholder="Bearer token (optional)" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowKey(v => !v)}>
                                            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="relative">
                                    <input type={showKey ? 'text' : 'password'} className="input text-sm pr-10" placeholder={`${provider?.name} API Key`} value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowKey(v => !v)}>
                                        {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Step 3: Test + fetch models */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-muted-foreground">3. Test &amp; load models</p>
                                <button className="btn-primary text-xs py-1.5 px-3" onClick={handleFetchModels} disabled={fetchingModels || !canFetch}>
                                    {fetchingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe2 className="w-3 h-3" />}
                                    {models !== null ? 'Refresh' : 'Test & Fetch'}
                                </button>
                            </div>

                            {testResult && (
                                <div className={`flex items-center gap-2 text-xs p-2.5 rounded-lg ${testResult.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-destructive/10 text-red-300 border border-destructive/20'}`}>
                                    {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <span className="text-red-400">✗</span>}
                                    {testResult.message}
                                </div>
                            )}

                            {modelError && (
                                <div className="text-xs p-2.5 rounded-lg bg-muted/30 border border-border/50 space-y-1.5">
                                    <p className="text-muted-foreground">{modelError}</p>
                                    <input className="input text-xs" placeholder="Enter model ID manually (e.g. gpt-4o)" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                </div>
                            )}

                            {models !== null && models.length > 0 && (
                                <div className="space-y-1.5">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                        <input className="input text-xs pl-7" placeholder={`Filter ${models.length} models…`} value={modelSearch} onChange={e => setModelSearch(e.target.value)} />
                                    </div>
                                    <div className="flex items-center justify-between px-0.5">
                                        <span className="text-[10px] text-muted-foreground">{selectedModels.size} selected</span>
                                        <button className="text-[10px] text-accent" onClick={() => selectedModels.size === filteredModels.length ? setSelectedModels(new Set()) : setSelectedModels(new Set(filteredModels.map(m => m.id)))}>
                                            {selectedModels.size === filteredModels.length ? 'Deselect all' : 'Select all'}
                                        </button>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20">
                                        {filteredModels.map(m => {
                                            const checked = selectedModels.has(m.id)
                                            return (
                                                <button key={m.id} onClick={() => toggleModel(m.id)} className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted/30 transition-colors ${checked ? 'bg-accent/5' : ''}`}>
                                                    <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${checked ? 'bg-accent border-accent' : 'border-border'}`}>
                                                        {checked && <CheckCircle2 className="w-2.5 h-2.5 text-accent-foreground" />}
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

                        {saveError && <p className="text-xs text-red-400">{saveError}</p>}

                        <button className="btn-primary w-full justify-center py-2.5 text-sm" onClick={handleSave} disabled={saving || totalSelected === 0}>
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            {saving ? 'Saving…' : totalSelected > 0 ? `Add ${totalSelected} model${totalSelected > 1 ? 's' : ''}` : 'Select models above'}
                        </button>
                    </>
                )}
            </div>

            <button
                className="btn-primary w-full justify-center py-3"
                onClick={onNext}
                disabled={loading || configured.length === 0}
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {configured.length === 0 ? 'Configure at least one provider' : `Continue with ${configured.length} provider${configured.length > 1 ? 's' : ''}`}
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    )
}

function WorkspaceCreateStep({ onNext }: { onNext: () => void }) {
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const [creating, setCreating] = useState(false)

    const ICONS = ['🧠', '📁', '💼', '🔬', '📚', '🎯', '🌐', '💡', '🔧', '🎨', '📊', '🚀', '🔒', '⚗️', '🌿', '🔑', '⚙️', '📝', '🗄️', '🌱']

    type WsDraft = { id: number; name: string; icon: string; providerId: string; modelOverride: string }

    const [workspaces, setWorkspaces] = useState<WsDraft[]>([
        { id: Date.now(), name: '', icon: '🧠', providerId: '', modelOverride: '' }
    ])

    const updateWs = (id: number, patch: Partial<WsDraft>) =>
        setWorkspaces(ws => ws.map(w => w.id === id ? { ...w, ...patch } : w))

    const addWorkspace = () =>
        setWorkspaces(ws => [...ws, { id: Date.now(), name: '', icon: '📁', providerId: '', modelOverride: '' }])

    const removeWorkspace = (id: number) =>
        setWorkspaces(ws => ws.length > 1 ? ws.filter(w => w.id !== id) : ws)

    const canLaunch = workspaces.some(w => w.name.trim())

    const handleCreate = async () => {
        const valid = workspaces.filter(w => w.name.trim())
        if (!valid.length) return
        setCreating(true)
        await Promise.all(valid.map(w => createWorkspace({
            name: w.name.trim(),
            icon: w.icon,
            llm_provider_id: w.providerId || undefined,
            llm_model: w.modelOverride || undefined,
        })))
        onNext()
    }

    return (
        <div className="glass-card p-8 space-y-5 animate-slide-up">
            <div>
                <h2 className="text-xl font-bold mb-1">Create Your Workspaces</h2>
                <p className="text-muted-foreground text-sm">
                    At least one is required. Each workspace can have its own AI provider and model override.
                </p>
            </div>

            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                {workspaces.map((ws, idx) => (
                    <WorkspaceDraftCard
                        key={ws.id}
                        ws={ws}
                        idx={idx}
                        icons={ICONS}
                        providers={providers as ProviderOption[]}
                        onChange={patch => updateWs(ws.id, patch)}
                        onRemove={workspaces.length > 1 ? () => removeWorkspace(ws.id) : undefined}
                    />
                ))}
            </div>

            <button
                className="btn-ghost w-full justify-center border border-dashed border-border py-2.5 text-sm"
                onClick={addWorkspace}
            >
                <Plus className="w-4 h-4" /> Add another workspace
            </button>

            <button
                className="btn-primary w-full justify-center py-3"
                onClick={handleCreate}
                disabled={!canLaunch || creating}
            >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {creating
                    ? `Creating ${workspaces.filter(w => w.name.trim()).length} workspace(s)…`
                    : `Launch OpenForge`}
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    )
}

type ProviderOption = { id: string; display_name: string; provider_name: string; default_model: string | null }

function WorkspaceDraftCard({ ws, idx, icons, providers, onChange, onRemove }: {
    ws: { name: string; icon: string; providerId: string; modelOverride: string }
    idx: number
    icons: string[]
    providers: ProviderOption[]
    onChange: (patch: Partial<{ name: string; icon: string; providerId: string; modelOverride: string }>) => void
    onRemove?: () => void
}) {
    const [showIcons, setShowIcons] = useState(false)

    return (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Workspace {idx + 1}</span>
                {onRemove && (
                    <button onClick={onRemove} className="ml-auto text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Icon + name row */}
            <div className="flex gap-2 items-start">
                <div>
                    <button
                        onClick={() => setShowIcons(v => !v)}
                        className="w-11 h-11 rounded-xl border border-border bg-background/50 text-2xl flex items-center justify-center hover:border-accent transition-colors"
                    >
                        {ws.icon}
                    </button>
                    {showIcons && (
                        <div className="absolute z-10 mt-1 p-2 rounded-xl border border-border bg-popover shadow-xl grid grid-cols-5 gap-1">
                            {icons.map(ic => (
                                <button
                                    key={ic}
                                    onClick={() => { onChange({ icon: ic }); setShowIcons(false) }}
                                    className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center hover:bg-muted transition-colors ${ws.icon === ic ? 'bg-accent/20 ring-1 ring-accent' : ''}`}
                                >
                                    {ic}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <input
                    className="input flex-1"
                    placeholder={`Workspace ${idx + 1} name…`}
                    value={ws.name}
                    onChange={e => onChange({ name: e.target.value })}
                    autoFocus={idx === 0}
                />
            </div>

            {/* Provider override */}
            {providers.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">Provider override</label>
                        <select
                            className="input text-xs"
                            value={ws.providerId}
                            onChange={e => onChange({ providerId: e.target.value, modelOverride: '' })}
                        >
                            <option value="">Use global default</option>
                            {providers.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.display_name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">Model override</label>
                        <input
                            className="input text-xs"
                            placeholder={ws.providerId
                                ? providers.find(p => p.id === ws.providerId)?.default_model ?? 'e.g. gpt-4o'
                                : 'e.g. gpt-4o'}
                            value={ws.modelOverride}
                            onChange={e => onChange({ modelOverride: e.target.value })}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
