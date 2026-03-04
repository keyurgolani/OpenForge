import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
    getOnboarding, advanceOnboarding, createProvider,
    testConnection, listModels, createWorkspace
} from '@/lib/api'
import { Sparkles, ArrowRight, CheckCircle2, Loader2, Globe2, Eye, EyeOff } from 'lucide-react'

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', icon: '🌐', color: 'from-emerald-500/20', needsKey: true },
    { id: 'anthropic', name: 'Anthropic', icon: '🔮', color: 'from-orange-500/20', needsKey: true },
    { id: 'gemini', name: 'Google Gemini', icon: '♊', color: 'from-blue-500/20', needsKey: true },
    { id: 'groq', name: 'Groq', icon: '⚡', color: 'from-yellow-500/20', needsKey: true },
    { id: 'deepseek', name: 'DeepSeek', icon: '🧠', color: 'from-cyan-500/20', needsKey: true },
    { id: 'mistral', name: 'Mistral AI', icon: '🌀', color: 'from-purple-500/20', needsKey: true },
    { id: 'openrouter', name: 'OpenRouter', icon: '🔀', color: 'from-pink-500/20', needsKey: true },
    { id: 'xai', name: 'xAI (Grok)', icon: '𝕏', color: 'from-gray-500/20', needsKey: true },
    { id: 'cohere', name: 'Cohere', icon: '🌊', color: 'from-teal-500/20', needsKey: true },
    { id: 'ollama', name: 'Ollama (Local)', icon: '🦙', color: 'from-lime-500/20', needsKey: false },
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
    return (
        <div className="glass-card p-8 text-center space-y-6 animate-fade-in">
            <div className="text-6xl">🔨</div>
            <div>
                <h2 className="text-2xl font-bold mb-2">Welcome to OpenForge</h2>
                <p className="text-muted-foreground leading-relaxed">
                    Your self-hosted AI workspace. Capture ideas, write beautifully, and chat with your knowledge — privately on your own server.
                </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-left text-sm">
                {[
                    ['📝', 'Rich markdown notes with AI insights'],
                    ['🔍', 'Semantic search across all your content'],
                    ['💬', 'Chat with your notes using any LLM'],
                    ['🔒', '100% private — runs on your hardware'],
                ].map(([icon, text]) => (
                    <div key={text} className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
                        <span className="text-lg">{icon}</span>
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
                api_key: provider?.needsKey ? (apiKey || undefined) : undefined,
                base_url: selected === 'ollama' ? baseUrl : undefined,
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
                        <div className="text-xl mb-1">{p.icon}</div>
                        <div className="font-medium text-xs leading-tight">{p.name}</div>
                        {!p.needsKey && <div className="text-[10px] text-emerald-400 mt-0.5">No key needed</div>}
                    </button>
                ))}
            </div>

            {selected && (
                <div className="space-y-3 pt-1">
                    {provider?.needsKey ? (
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">{provider.name} API Key</label>
                            <div className="relative">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    className="input pr-10"
                                    placeholder="sk-…"
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    autoComplete="off"
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    onClick={() => setShowKey(v => !v)}
                                >
                                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Ollama Base URL</label>
                            <input className="input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
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
    const [name, setName] = useState('')
    const [icon, setIcon] = useState('🧠')
    const [creating, setCreating] = useState(false)

    const ICONS = ['🧠', '📁', '💼', '🔬', '📚', '🎯', '🌐', '💡', '🔧', '🎨', '📊', '🚀', '🔒', '⚗️', '🌿']

    const handleCreate = async () => {
        if (!name.trim()) return
        setCreating(true)
        await createWorkspace({ name: name.trim(), icon })
        onNext()
    }

    return (
        <div className="glass-card p-8 space-y-5 animate-slide-up">
            <div>
                <h2 className="text-xl font-bold mb-1">Create Your First Workspace</h2>
                <p className="text-muted-foreground text-sm">Workspaces help you organize notes by project or topic.</p>
            </div>

            <div>
                <label className="text-xs text-muted-foreground mb-2 block">Choose an icon</label>
                <div className="flex flex-wrap gap-2">
                    {ICONS.map(ic => (
                        <button
                            key={ic}
                            onClick={() => setIcon(ic)}
                            className={`w-10 h-10 rounded-lg text-xl transition-all ${icon === ic ? 'border-2 border-accent bg-accent/20 scale-110' : 'border border-border hover:bg-muted/50'}`}
                        >
                            {ic}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="text-xs text-muted-foreground mb-1 block">Workspace name</label>
                <input
                    className="input"
                    placeholder="My Knowledge Base"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    autoFocus
                />
            </div>

            <button
                className="btn-primary w-full justify-center py-3"
                onClick={handleCreate}
                disabled={!name.trim() || creating}
            >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {creating ? 'Creating…' : 'Create Workspace & Launch'}
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    )
}
