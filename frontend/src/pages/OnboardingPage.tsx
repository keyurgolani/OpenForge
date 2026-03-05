import { useState, useEffect } from 'react'
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
    const [selected, setSelected] = useState<string | null>(null)
    const [apiKey, setApiKey] = useState('')
    const [showKey, setShowKey] = useState(false)
    const [baseUrl, setBaseUrl] = useState('http://localhost:11434')
    const [model, setModel] = useState('')
    const [models, setModels] = useState<{ id: string; name: string }[]>([])
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
    const [saved, setSaved] = useState(false)

    const provider = PROVIDERS.find(p => p.id === selected)

    // Reset API key when provider changes — prevents stale key from previous selection
    const handleSelectProvider = (id: string) => {
        setSelected(id)
        setApiKey('')
        setShowKey(false)
        setTestResult(null)
        setSaved(false)
        setModels([])
        setModel('')
    }

    const handleTest = async () => {
        if (!selected) return
        setTesting(true)
        setTestResult(null)
        try {
            const p = await createProvider({
                provider_name: selected,
                display_name: provider?.name ?? selected,
                api_key: apiKey || undefined,
                base_url: provider?.needsUrl ? baseUrl : undefined,
                default_model: model || undefined,
            })
            const result = await testConnection(p.id)
            setTestResult(result)
            if (result.success) {
                const modelList = await listModels(p.id)
                setModels(modelList)
            }
            setSaved(result.success)
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { detail?: string } }; message?: string })
            setTestResult({ success: false, message: msg?.response?.data?.detail ?? msg?.message ?? 'Connection failed' })
        } finally {
            setTesting(false)
        }
    }

    return (
        <div className="glass-card p-8 space-y-5 animate-slide-up">
            <div>
                <h2 className="text-xl font-bold mb-1">Connect an AI Provider</h2>
                <p className="text-muted-foreground text-sm">Choose a provider to enable AI features. You can add more in Settings later.</p>
            </div>

            {/* Provider grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PROVIDERS.map(p => (
                    <button
                        key={p.id}
                        onClick={() => handleSelectProvider(p.id)}
                        className={`p-3 rounded-xl border text-left transition-all duration-200 group ${selected === p.id
                            ? `border-accent bg-gradient-to-br ${p.color} to-transparent ring-1 ring-accent/30`
                            : 'border-border hover:border-border/80 hover:bg-muted/30'
                            }`}
                    >
                        <div className="text-xl mb-1 flex justify-center">
                            <ProviderIcon providerId={p.id} className="w-5 h-5" />
                        </div>
                        <div className="font-medium text-xs leading-tight">{p.name}</div>
                        {p.needsUrl && !p.needsKey && <div className="text-[10px] text-emerald-400 mt-0.5">Custom URL</div>}
                    </button>
                ))}
            </div>

            {selected && (
                <div className="space-y-3 pt-1">
                    {provider?.needsUrl ? (
                        <div className="space-y-2">
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Base URL</label>
                                <input
                                    className="input"
                                    placeholder={selected === 'ollama' ? 'http://localhost:11434' : 'https://your-endpoint.com'}
                                    value={baseUrl}
                                    onChange={e => setBaseUrl(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">
                                    Bearer Token <span className="text-muted-foreground/60">(optional)</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showKey ? 'text' : 'password'}
                                        className="input pr-10"
                                        placeholder="Token (leave blank if not required)"
                                        value={apiKey}
                                        onChange={e => setApiKey(e.target.value)}
                                        autoComplete="off"
                                    />
                                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(v => !v)}>
                                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">{provider?.name} API Key</label>
                            <div className="relative">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    className="input pr-10"
                                    placeholder="sk-…"
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    autoComplete="off"
                                />
                                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(v => !v)}>
                                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    )}


                    {models.length > 0 && (
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                                Default Model <span className="text-accent">({models.length} available)</span>
                            </label>
                            <select className="input" value={model} onChange={e => setModel(e.target.value)}>
                                <option value="">Select a model…</option>
                                {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                        </div>
                    )}

                    <button
                        className="btn-ghost w-full justify-center border border-border py-2.5"
                        onClick={handleTest}
                        disabled={testing || (provider?.needsKey && !apiKey)}
                    >
                        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe2 className="w-4 h-4" />}
                        {testing ? 'Testing connection…' : 'Test & Save Provider'}
                    </button>

                    {testResult && (
                        <div className={`p-3 rounded-xl text-sm flex items-start gap-2 ${testResult.success
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            : 'bg-destructive/10 text-red-300 border border-destructive/20'
                            }`}>
                            <span>{testResult.success ? '✓' : '✗'}</span>
                            <span>{testResult.message}</span>
                        </div>
                    )}
                </div>
            )}

            <button
                className="btn-primary w-full justify-center py-3"
                onClick={onNext}
                disabled={loading}
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saved ? 'Continue' : 'Skip for now'} <ArrowRight className="w-4 h-4" />
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
