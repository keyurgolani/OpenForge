import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
    getOnboarding, advanceOnboarding, listProviders, createProvider,
    testConnection, listModels, createWorkspace
} from '@/lib/api'
import { Sparkles, Server, Database, ArrowRight, CheckCircle2, Loader2, Globe2 } from 'lucide-react'

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', icon: '🌐', needsKey: true },
    { id: 'anthropic', name: 'Anthropic', icon: '🔮', needsKey: true },
    { id: 'gemini', name: 'Google Gemini', icon: '♊', needsKey: true },
    { id: 'groq', name: 'Groq', icon: '⚡', needsKey: true },
    { id: 'deepseek', name: 'DeepSeek', icon: '🧠', needsKey: true },
    { id: 'mistral', name: 'Mistral AI', icon: '🌀', needsKey: true },
    { id: 'openrouter', name: 'OpenRouter', icon: '🔀', needsKey: true },
    { id: 'ollama', name: 'Ollama (Local)', icon: '🦙', needsKey: false },
]

export default function OnboardingPage() {
    const navigate = useNavigate()
    const qc = useQueryClient()
    const { data: onboarding } = useQuery({ queryKey: ['onboarding'], queryFn: getOnboarding, staleTime: 0 })
    const advance = useMutation({ mutationFn: (step: string) => advanceOnboarding(step) })

    const step = onboarding?.current_step ?? 'welcome'

    if (onboarding?.is_complete) {
        // Find first workspace and redirect
        qc.fetchQuery({ queryKey: ['workspaces'], queryFn: () => import('@/lib/api').then(a => a.listWorkspaces()) })
            .then((ws: { id: string }[]) => {
                if (ws.length > 0) navigate(`/w/${ws[0].id}`)
            })
            .catch(() => { })
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-lg">
                {/* Logo */}
                <div className="flex items-center gap-3 mb-10 justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">OpenForge</h1>
                        <p className="text-xs text-muted-foreground">Self-hosted AI workspace</p>
                    </div>
                </div>

                {/* Progress steps */}
                <div className="flex items-center gap-2 justify-center mb-10">
                    {['welcome', 'llm_setup', 'workspace_create'].map((s, i) => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step === s ? 'bg-accent text-accent-foreground scale-110' :
                                    ['welcome', 'llm_setup', 'workspace_create'].indexOf(step) > i ? 'bg-accent/30 text-accent' :
                                        'bg-muted text-muted-foreground'
                                }`}>
                                {['welcome', 'llm_setup', 'workspace_create'].indexOf(step) > i ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                            </div>
                            {i < 2 && <div className={`w-12 h-0.5 ${['welcome', 'llm_setup', 'workspace_create'].indexOf(step) > i ? 'bg-accent/50' : 'bg-border'}`} />}
                        </div>
                    ))}
                </div>

                {step === 'welcome' && <WelcomeStep onNext={() => advance.mutate('llm_setup')} />}
                {step === 'llm_setup' && <LLMSetupStep onNext={() => advance.mutate('workspace_create')} />}
                {step === 'workspace_create' && <WorkspaceCreateStep onNext={() => {
                    advance.mutateAsync('complete').then(() => {
                        qc.fetchQuery({ queryKey: ['workspaces'], queryFn: () => import('@/lib/api').then(a => a.listWorkspaces()) })
                            .then((ws: { id: string }[]) => {
                                if (ws.length > 0) navigate(`/w/${ws[0].id}`)
                            })
                    })
                }} />}
            </div>
        </div>
    )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
    return (
        <div className="glass-card p-8 text-center space-y-6 animate-fade-in">
            <div className="text-5xl">🔨</div>
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
                    <div key={text} className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
                        <span>{icon}</span>
                        <span className="text-muted-foreground">{text}</span>
                    </div>
                ))}
            </div>
            <button className="btn-primary w-full justify-center" onClick={onNext}>
                Get Started <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    )
}

function LLMSetupStep({ onNext }: { onNext: () => void }) {
    const [selected, setSelected] = useState<string | null>(null)
    const [apiKey, setApiKey] = useState('')
    const [baseUrl, setBaseUrl] = useState('http://localhost:11434')
    const [model, setModel] = useState('')
    const [models, setModels] = useState<{ id: string; name: string }[]>([])
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    const provider = PROVIDERS.find(p => p.id === selected)

    const handleTest = async () => {
        if (!selected) return
        setTesting(true)
        setTestResult(null)
        try {
            const p = await createProvider({
                provider_name: selected,
                display_name: provider?.name ?? selected,
                api_key: provider?.needsKey ? apiKey : undefined,
                base_url: selected === 'ollama' ? baseUrl : undefined,
            })
            const result = await testConnection(p.id)
            setTestResult(result)
            const modelList = await listModels(p.id)
            setModels(modelList)
            setSaved(true)
        } catch (e: unknown) {
            setTestResult({ success: false, message: String((e as { message?: string })?.message ?? 'Connection failed') })
        } finally {
            setTesting(false)
        }
    }

    return (
        <div className="glass-card p-8 space-y-5 animate-slide-up">
            <div>
                <h2 className="text-xl font-bold mb-1">Configure AI Provider</h2>
                <p className="text-muted-foreground text-sm">Connect an LLM to enable AI features. You can add more in Settings.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map(p => (
                    <button
                        key={p.id}
                        onClick={() => { setSelected(p.id); setTestResult(null); setSaved(false) }}
                        className={`p-3 rounded-lg border text-left text-sm transition-all ${selected === p.id ? 'border-accent bg-accent/10' : 'border-border hover:border-border/80 hover:bg-muted/30'
                            }`}
                    >
                        <span className="mr-2">{p.icon}</span>
                        <span className="font-medium">{p.name}</span>
                    </button>
                ))}
            </div>

            {selected && (
                <div className="space-y-3">
                    {provider?.needsKey && (
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">API Key</label>
                            <input
                                type="password"
                                className="input"
                                placeholder={`${provider.name} API Key`}
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                            />
                        </div>
                    )}
                    {selected === 'ollama' && (
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Ollama Base URL</label>
                            <input
                                className="input"
                                value={baseUrl}
                                onChange={e => setBaseUrl(e.target.value)}
                            />
                        </div>
                    )}
                    {models.length > 0 && (
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Default Model</label>
                            <select className="input" value={model} onChange={e => setModel(e.target.value)}>
                                <option value="">Select a model…</option>
                                {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                        </div>
                    )}
                    <button className="btn-ghost w-full justify-center border border-border" onClick={handleTest} disabled={testing}>
                        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe2 className="w-4 h-4" />}
                        {testing ? 'Testing connection…' : 'Test Connection'}
                    </button>
                    {testResult && (
                        <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-destructive/10 text-red-300 border border-destructive/20'}`}>
                            {testResult.success ? '✓' : '✗'} {testResult.message}
                        </div>
                    )}
                </div>
            )}

            <button
                className="btn-primary w-full justify-center"
                onClick={onNext}
                disabled={!saved && selected !== null}
            >
                {saved ? 'Continue' : 'Skip for now'} <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    )
}

function WorkspaceCreateStep({ onNext }: { onNext: () => void }) {
    const [name, setName] = useState('')
    const [icon, setIcon] = useState('📁')
    const [creating, setCreating] = useState(false)

    const ICONS = ['📁', '🧠', '💼', '🔬', '📚', '🎯', '🌐', '💡', '🔧', '🎨', '📊', '🚀']

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
                <p className="text-muted-foreground text-sm">Workspaces help you organize your notes by project or topic.</p>
            </div>

            <div>
                <label className="text-xs text-muted-foreground mb-2 block">Choose an icon</label>
                <div className="flex flex-wrap gap-2">
                    {ICONS.map(ic => (
                        <button
                            key={ic}
                            onClick={() => setIcon(ic)}
                            className={`w-10 h-10 rounded-lg text-xl transition-all ${icon === ic ? 'border-2 border-accent bg-accent/20' : 'border border-border hover:bg-muted/50'}`}
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
                />
            </div>

            <button
                className="btn-primary w-full justify-center"
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
