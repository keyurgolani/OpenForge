import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
    getOnboarding, advanceOnboarding, createProvider,
    testConnection, listModels, createWorkspace, listProviders,
    listSettings, updateSetting, listSchedules, updateSchedule,
} from '@/lib/api'
import { Play, FileText, Eye, EyeOff, Loader2, Link, Star, X, Search, CheckCircle2, XCircle, Sliders, Sparkles, ArrowLeft, ArrowRight, Plus, Trash2, MessageSquare, Lock, Brain, Folder, Briefcase, Microscope, BookOpen, Target, Globe, Lightbulb, Wrench, Palette, BarChart3, Rocket, Shield, FlaskConical, Leaf, Key, Settings2, PenLine, Database, Sprout } from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'
import { ModelOverrideSelect } from '@/components/shared/ModelOverrideSelect'
import { isLocalProvider, sanitizeProviderDisplayName } from '@/lib/provider-display'

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
    { id: 'ollama', name: 'Ollama', color: 'from-lime-500/20 border-lime-500/30', needsKey: false, needsUrl: true },
    { id: 'custom-openai', name: 'Custom OpenAI-compatible', color: 'from-violet-500/20 border-violet-500/30', needsKey: false, needsUrl: true },
    { id: 'custom-anthropic', name: 'Custom Anthropic-compat.', color: 'from-rose-500/20 border-rose-500/30', needsKey: false, needsUrl: true },
]

const STEPS = ['welcome', 'providers_setup', 'models_setup', 'workspace_create', 'automation_preferences']

interface TypedModel {
    provider_id: string
    model_id: string
    model_name: string
    is_default?: boolean
}
const AUTO_KNOWLEDGE_INTELLIGENCE_KEY = 'automation.auto_knowledge_intelligence_enabled'
const AUTO_BOOKMARK_EXTRACTION_KEY = 'automation.auto_bookmark_content_extraction_enabled'

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
            <div className="w-full max-w-2xl">
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
                        const canClick = isDone && !advance.isPending
                        return (
                            <div key={s} className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={!canClick}
                                    onClick={() => canClick && advance.mutate(s)}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${isDone ? 'bg-accent/20 text-accent outline outline-2 outline-accent/30 shadow-glass-sm cursor-pointer hover:scale-110' :
                                        isActive ? 'bg-accent text-accent-foreground scale-110 outline outline-2 outline-accent/50 shadow-glass-md' :
                                            'glass-sm text-muted-foreground border border-border/50'
                                    } ${!canClick ? 'cursor-default' : ''}`}>
                                    {isDone ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : i + 1}
                                </button>
                                {i < STEPS.length - 1 && (
                                    <div className={`w-16 h-0.5 transition-all duration-500 rounded-full ${isDone ? 'bg-accent/50 shadow-[0_0_8px_rgba(var(--accent),0.5)]' : 'bg-border/50'}`} />
                                )}
                            </div>
                        )
                    })}
                </div>

                {step === 'welcome' && (
                    <WelcomeStep onNext={() => advance.mutate('providers_setup')} loading={advance.isPending} />
                )}
                {step === 'providers_setup' && (
                    <ProvidersSetupStep onNext={() => advance.mutate('models_setup')} onBack={() => advance.mutate('welcome')} loading={advance.isPending} />
                )}
                {step === 'models_setup' && (
                    <ModelsSetupStep onNext={() => advance.mutate('workspace_create')} onBack={() => advance.mutate('providers_setup')} loading={advance.isPending} />
                )}
                {step === 'workspace_create' && (
                    <WorkspaceCreateStep onNext={async () => {
                        await advance.mutateAsync('automation_preferences')
                        qc.invalidateQueries({ queryKey: ['onboarding'] })
                    }} onBack={() => advance.mutate('models_setup')} loading={advance.isPending} />
                )}
                {step === 'automation_preferences' && (
                    <AutomationPreferencesStep onNext={async () => {
                        await advance.mutateAsync('complete')
                        qc.fetchQuery({
                            queryKey: ['workspaces'],
                            queryFn: () => import('@/lib/api').then(a => a.listWorkspaces()),
                        }).then((ws: { id: string }[]) => {
                            if (ws.length > 0) navigate(`/w/${ws[0].id}`)
                        })
                    }} onBack={() => advance.mutate('workspace_create')} loading={advance.isPending} />
                )}
            </div>
        </div>
    )
}

function WelcomeStep({ onNext, loading }: { onNext: () => void; loading: boolean }) {
    const FEATURES = [
        { Icon: FileText, text: 'Rich markdown knowledge with AI insights' },
        { Icon: Search, text: 'Semantic search across all your content' },
        { Icon: MessageSquare, text: 'Chat with your knowledge using any LLM' },
        { Icon: Lock, text: '100% private — runs on your hardware' },
    ]
    return (
        <div className="glass-card shadow-glass-lg p-8 text-center space-y-6 animate-fade-in border border-accent/20">
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

function ProvidersSetupStep({ onNext, onBack, loading }: { onNext: () => void; onBack: () => void; loading: boolean }) {
    const [configured, setConfigured] = useState<{ id: string; name: string }[]>([])
    const [selected, setSelected] = useState<string | null>(null)
    const [apiKey, setApiKey] = useState('')
    const [showKey, setShowKey] = useState(false)
    const [baseUrl, setBaseUrl] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [adding, setAdding] = useState(false)
    const [addError, setAddError] = useState<string | null>(null)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

    const provider = PROVIDERS.find(p => p.id === selected)
    const canAdd = provider?.needsUrl ? !!baseUrl : !!apiKey

    const resetForm = () => {
        setSelected(null); setApiKey(''); setShowKey(false); setBaseUrl('')
        setDisplayName(''); setShowAdvanced(false); setAddError(null); setTestResult(null)
    }

    const handleSelectProvider = (id: string) => {
        setSelected(id); setApiKey(''); setShowKey(false)
        setBaseUrl(id === 'ollama' ? 'http://localhost:11434' : '')
        setDisplayName(''); setShowAdvanced(false); setAddError(null); setTestResult(null)
    }

    const handleAdd = async () => {
        if (!selected || !canAdd) return
        setAdding(true); setAddError(null); setTestResult(null)
        try {
            const saved = await createProvider({
                provider_name: selected,
                display_name: displayName || provider?.name || selected,
                api_key: apiKey || undefined,
                base_url: baseUrl || undefined,
            })
            const result = await testConnection(saved.id)
            setTestResult(result)
            setConfigured(c => [...c, { id: saved.id, name: sanitizeProviderDisplayName(saved.display_name) }])
            if (result.success) resetForm()
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setAddError(err?.response?.data?.detail ?? err?.message ?? 'Failed to add provider')
        } finally {
            setAdding(false)
        }
    }

    return (
        <div className="glass-card shadow-glass-lg p-6 flex flex-col space-y-6 animate-slide-up border border-accent/20">
            <div>
                <h2 className="text-xl font-bold mb-1">Configure AI Providers</h2>
                <p className="text-muted-foreground text-sm">
                    Add one or more providers with your API credentials. You can add more in Settings later.
                </p>
            </div>

            {configured.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Added providers</p>
                    {configured.map(c => (
                        <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            <span className="text-emerald-300 truncate">{c.name}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="space-y-4 rounded-xl border border-border/60 p-4 bg-muted/10">
                <div className="relative">
                    <p className="text-xs font-medium text-muted-foreground mb-2">1. Select provider type</p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                        {PROVIDERS.map(p => (
                            <button key={p.id} onClick={() => handleSelectProvider(p.id)}
                                className={`p-2.5 rounded-xl border text-center transition-all duration-300 ${selected === p.id
                                    ? `border-accent outline outline-2 outline-accent/30 shadow-glass-md bg-gradient-to-br ${p.color} to-transparent scale-105`
                                    : 'border-border/50 hover:bg-muted/40 hover:shadow-glass-sm'
                                    }`}
                            >
                                <div className="flex justify-center mb-1.5">
                                    <ProviderIcon providerId={p.id} className="w-4 h-4" />
                                </div>
                                <div className="text-[10px] leading-tight font-medium truncate">{p.name}</div>
                                {isLocalProvider(p.id) && (
                                    <div className="mt-1 text-[9px] text-lime-300/90 font-medium">Local</div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {selected && (
                    <>
                        <div className="space-y-2">
                            <label className="text-xs text-muted-foreground font-medium block">2. Enter credentials</label>
                            {isLocalProvider(selected) && (
                                <p className="text-[10px] text-lime-300/90">Local provider — runs on this machine</p>
                            )}
                            <input className="input text-sm" placeholder={`Display name (default: ${provider?.name})`} value={displayName} onChange={e => setDisplayName(e.target.value)} />

                            {provider?.needsUrl ? (
                                <>
                                    <input className="input text-sm" placeholder="https://your-api.com" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                                    <div className="relative">
                                        <input type={showKey ? 'text' : 'password'} className="input text-sm pr-10" placeholder="API Key (optional)" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(v => !v)}>
                                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="relative">
                                        <input type={showKey ? 'text' : 'password'} className="input text-sm pr-10" placeholder="API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(v => !v)}>
                                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 transition-colors"
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                    >
                                        <Sliders className="w-3 h-3" /> {showAdvanced ? 'Hide advanced settings' : 'Custom Base URL (API gateways)'}
                                    </button>
                                    {showAdvanced && (
                                        <div className="animate-fade-in pt-1">
                                            <input className="input text-sm" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {testResult && (
                            <div className={`flex items-center gap-2 text-xs p-2.5 rounded-lg ${testResult.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-destructive/10 text-red-300 border border-destructive/20'}`}>
                                {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                                {testResult.message}
                            </div>
                        )}
                        {addError && <p className="text-xs text-red-400">{addError}</p>}

                        <button className="btn-primary w-full justify-center py-2.5 text-sm" onClick={handleAdd} disabled={adding || !canAdd}>
                            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            {adding ? 'Adding…' : 'Add Provider'}
                        </button>
                    </>
                )}
            </div>

            <div className="flex gap-3">
                <button className="btn-ghost justify-center py-3 px-4" onClick={onBack} disabled={loading}>
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                    className="btn-primary flex-1 justify-center py-3"
                    onClick={onNext}
                    disabled={loading || configured.length === 0}
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {configured.length === 0 ? 'Add at least one provider to continue' : `Continue with ${configured.length} provider${configured.length > 1 ? 's' : ''}`}
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

type ModelTypeKey = 'chat' | 'vision' | 'embedding'

function ModelsSetupStep({ onNext, onBack, loading }: { onNext: () => void; onBack: () => void; loading: boolean }) {
    const qc = useQueryClient()
    const [activeType, setActiveType] = useState<ModelTypeKey>('chat')
    const [chatModels, setChatModels] = useState<TypedModel[]>([])
    const [visionModels, setVisionModels] = useState<TypedModel[]>([])
    const [embeddingModels, setEmbeddingModels] = useState<TypedModel[]>([])
    const [initialized, setInitialized] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    // Add-model form
    const [addProviderId, setAddProviderId] = useState('')
    const [providerModels, setProviderModels] = useState<{ id: string; name: string }[]>([])
    const [fetchingModels, setFetchingModels] = useState(false)
    const [fetchAttempted, setFetchAttempted] = useState(false)
    const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set())
    const [modelSearch, setModelSearch] = useState('')
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [manualModelId, setManualModelId] = useState('')

    const { data: providers = [] } = useQuery<ProviderOption[]>({ queryKey: ['providers'], queryFn: listProviders })
    const { data: settings = [] } = useQuery<Array<{ key: string; value: unknown }>>({ queryKey: ['app-settings'], queryFn: listSettings })

    useEffect(() => {
        if (initialized || !settings.length) return
        const parse = (key: string): TypedModel[] => {
            const s = settings.find(x => x.key === key)
            if (!s?.value) return []
            try { return s.value as TypedModel[] } catch { return [] }
        }
        setChatModels(parse('system_chat_models'))
        setVisionModels(parse('system_vision_models'))
        setEmbeddingModels(parse('system_embedding_models'))
        setInitialized(true)
    }, [settings, initialized])

    const currentModels = activeType === 'chat' ? chatModels : activeType === 'vision' ? visionModels : embeddingModels
    const setCurrentModels = (m: TypedModel[]) => {
        if (activeType === 'chat') setChatModels(m)
        else if (activeType === 'vision') setVisionModels(m)
        else setEmbeddingModels(m)
    }

    const handleFetchModels = async (pid: string) => {
        if (!pid) { setProviderModels([]); setSelectedModelIds(new Set()); setFetchAttempted(false); return }
        setFetchingModels(true); setFetchError(null); setProviderModels([]); setSelectedModelIds(new Set()); setFetchAttempted(false)
        try {
            const list = await listModels(pid)
            setProviderModels(list)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setFetchError(err?.response?.data?.detail ?? err?.message ?? 'Could not fetch models')
        } finally {
            setFetchingModels(false)
            setFetchAttempted(true)
        }
    }

    const handleProviderChange = (pid: string) => {
        setAddProviderId(pid); setModelSearch(''); setManualModelId(''); setFetchAttempted(false); handleFetchModels(pid)
    }

    const toggleModelSelection = (modelId: string) => {
        setSelectedModelIds(prev => {
            const next = new Set(prev)
            if (next.has(modelId)) next.delete(modelId)
            else next.add(modelId)
            return next
        })
    }

    const handleAddModels = () => {
        if (!addProviderId) return
        const idsToAdd = manualModelId ? [manualModelId] : Array.from(selectedModelIds)
        if (idsToAdd.length === 0) return

        const existing = currentModels
        const newModels: TypedModel[] = []
        for (const modelId of idsToAdd) {
            if (existing.some(m => m.provider_id === addProviderId && m.model_id === modelId)) continue
            const modelName = providerModels.find(m => m.id === modelId)?.name ?? modelId
            newModels.push({
                provider_id: addProviderId,
                model_id: modelId,
                model_name: modelName,
                is_default: existing.length === 0 && newModels.length === 0,
            })
        }
        if (newModels.length > 0) {
            setCurrentModels([...existing, ...newModels])
        }
        setSelectedModelIds(new Set()); setModelSearch(''); setManualModelId('')
    }

    const handleRemoveModel = (providerId: string, modelId: string) => {
        const updated = currentModels.filter(m => !(m.provider_id === providerId && m.model_id === modelId))
        if (updated.length > 0 && !updated.some(m => m.is_default)) {
            updated[0] = { ...updated[0], is_default: true }
        }
        setCurrentModels(updated)
    }

    const handleSetDefault = (providerId: string, modelId: string) => {
        setCurrentModels(currentModels.map(m => ({ ...m, is_default: m.provider_id === providerId && m.model_id === modelId })))
    }

    const filteredProviderModels = useMemo(() => {
        const q = modelSearch.toLowerCase()
        return q ? providerModels.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : providerModels
    }, [providerModels, modelSearch])

    const handleSaveAndContinue = async () => {
        setSaving(true); setSaveError(null)
        try {
            const saves = [
                updateSetting('system_chat_models', { value: chatModels, category: 'llm' }),
                updateSetting('system_vision_models', { value: visionModels, category: 'llm' }),
                updateSetting('system_embedding_models', { value: embeddingModels, category: 'llm' }),
            ]
            // Sync system_vision_provider_id / system_vision_model for backend fallback
            const defaultVision = visionModels.find(m => m.is_default) ?? visionModels[0]
            if (defaultVision) {
                saves.push(updateSetting('system_vision_provider_id', { value: defaultVision.provider_id, category: 'llm' }))
                saves.push(updateSetting('system_vision_model', { value: defaultVision.model_id, category: 'llm' }))
            }
            await Promise.all(saves)
            qc.invalidateQueries({ queryKey: ['app-settings'] })
            onNext()
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setSaveError(err?.response?.data?.detail ?? err?.message ?? 'Save failed')
        } finally {
            setSaving(false)
        }
    }

    const TYPE_TABS: { key: ModelTypeKey; label: string; desc: string }[] = [
        { key: 'chat', label: 'Chat', desc: 'Models for conversation and agent tasks' },
        { key: 'vision', label: 'Vision', desc: 'Models for image analysis and description' },
        { key: 'embedding', label: 'Embedding', desc: 'Models for semantic search and similarity' },
    ]

    const totalConfigured = chatModels.length + visionModels.length + embeddingModels.length

    return (
        <div className="glass-card shadow-glass-lg p-6 flex flex-col space-y-5 animate-slide-up border border-accent/20">
            <div>
                <h2 className="text-xl font-bold mb-1">Configure Models</h2>
                <p className="text-muted-foreground text-sm">
                    Pick system-wide default models for each type. Workspaces can override these later.
                </p>
            </div>

            {/* Type tabs */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted/30 border border-border/50">
                {TYPE_TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => { setActiveType(t.key); setAddProviderId(''); setProviderModels([]); setSelectedModelIds(new Set()); setManualModelId(''); setModelSearch(''); setFetchError(null) }}
                        className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${activeType === t.key ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {t.label}
                        {(activeType !== t.key) && (
                            <span className="ml-1 text-[9px] opacity-60">
                                {t.key === 'chat' ? chatModels.length : t.key === 'vision' ? visionModels.length : embeddingModels.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            <p className="text-[11px] text-muted-foreground -mt-2">{TYPE_TABS.find(t => t.key === activeType)?.desc}</p>

            {/* Current models list */}
            {currentModels.length > 0 && (
                <div className="space-y-1.5">
                    {currentModels.map(m => {
                        const prov = providers.find(p => p.id === m.provider_id)
                        return (
                            <div key={`${m.provider_id}:${m.model_id}`} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/10 text-xs">
                                <ProviderIcon providerId={prov?.provider_name ?? ''} className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="text-muted-foreground truncate">{sanitizeProviderDisplayName(prov?.display_name ?? m.provider_id)}</span>
                                <span className="text-foreground font-medium truncate flex-1">{m.model_name}</span>
                                <button onClick={() => handleSetDefault(m.provider_id, m.model_id)} className={`p-1 rounded transition-colors ${m.is_default ? 'text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`} title="Set as default">
                                    <Star className="w-3 h-3" fill={m.is_default ? 'currentColor' : 'none'} />
                                </button>
                                <button onClick={() => handleRemoveModel(m.provider_id, m.model_id)} className="p-1 rounded text-muted-foreground hover:text-red-400 transition-colors">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Add model */}
            <div className="space-y-2 rounded-xl border border-border/60 p-3 bg-muted/10">
                <p className="text-xs font-medium text-muted-foreground">Add a model</p>
                <select
                    className="input text-xs"
                    value={addProviderId}
                    onChange={e => handleProviderChange(e.target.value)}
                >
                    <option value="">Select provider…</option>
                    {providers.map((p: ProviderOption) => (
                        <option key={p.id} value={p.id}>{sanitizeProviderDisplayName(p.display_name)}</option>
                    ))}
                </select>

                {fetchingModels && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Fetching models…
                    </div>
                )}

                {fetchError && (
                    <div className="space-y-1">
                        <p className="text-xs text-red-400">{fetchError}</p>
                        <input className="input text-xs" placeholder="Enter model ID manually (e.g. gpt-4o)" value={manualModelId} onChange={e => setManualModelId(e.target.value)} />
                    </div>
                )}

                {!fetchError && fetchAttempted && !fetchingModels && providerModels.length === 0 && (
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">This provider doesn't support model listing. Enter the model ID manually.</p>
                        <input className="input text-xs" placeholder="Enter model ID (e.g. meta-llama/Meta-Llama-3-8B-Instruct)" value={manualModelId} onChange={e => setManualModelId(e.target.value)} />
                    </div>
                )}

                {providerModels.length > 0 && (
                    <>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                            <input className="input text-xs pl-7" placeholder={`Filter ${providerModels.length} models…`} value={modelSearch} onChange={e => setModelSearch(e.target.value)} />
                        </div>
                        <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20">
                            {filteredProviderModels.map(m => {
                                const isSelected = selectedModelIds.has(m.id)
                                const alreadyAdded = currentModels.some(cm => cm.provider_id === addProviderId && cm.model_id === m.id)
                                return (
                                    <button key={m.id} onClick={() => !alreadyAdded && toggleModelSelection(m.id)}
                                        disabled={alreadyAdded}
                                        className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/30'} ${isSelected ? 'bg-accent/10 text-foreground' : 'text-muted-foreground'}`}>
                                        <div className={`w-3 h-3 rounded flex-shrink-0 border transition-colors flex items-center justify-center ${isSelected ? 'bg-accent border-accent' : 'border-border'}`}>
                                            {isSelected && <CheckCircle2 className="w-2.5 h-2.5 text-accent-foreground" />}
                                        </div>
                                        {m.name}
                                        {alreadyAdded && <span className="ml-auto text-[10px] text-muted-foreground">added</span>}
                                    </button>
                                )
                            })}
                        </div>
                        {selectedModelIds.size > 0 && (
                            <p className="text-[11px] text-muted-foreground">{selectedModelIds.size} model{selectedModelIds.size > 1 ? 's' : ''} selected</p>
                        )}
                    </>
                )}

                <button
                    className="btn-primary w-full justify-center py-2 text-xs"
                    onClick={handleAddModels}
                    disabled={!addProviderId || (selectedModelIds.size === 0 && !manualModelId)}
                >
                    <Plus className="w-3 h-3" /> Add {selectedModelIds.size > 1 ? `${selectedModelIds.size} Models` : 'Model'}
                </button>
            </div>

            {saveError && <p className="text-xs text-red-400">{saveError}</p>}

            <div className="flex gap-3">
                <button className="btn-ghost justify-center py-3 px-4" onClick={onBack} disabled={saving || loading}>
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                    className="btn-primary flex-1 justify-center py-3"
                    onClick={handleSaveAndContinue}
                    disabled={saving || loading || totalConfigured === 0}
                >
                    {(saving || loading) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {totalConfigured === 0 ? 'Add at least one model to continue' : 'Save & Continue'}
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

const parseBooleanSetting = (value: unknown, fallback: boolean) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true
        if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false
    }
    return fallback
}

function AutomationPreferencesStep({ onNext, onBack, loading }: { onNext: () => void | Promise<void>; onBack: () => void; loading: boolean }) {
    const qc = useQueryClient()
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [autoIntelligenceEnabled, setAutoIntelligenceEnabled] = useState(true)
    const [autoBookmarkExtractionEnabled, setAutoBookmarkExtractionEnabled] = useState(true)
    const [scheduledJobsEnabled, setScheduledJobsEnabled] = useState(true)
    const [initialized, setInitialized] = useState(false)

    const { data: settings = [] } = useQuery<Array<{ key: string; value: unknown }>>({
        queryKey: ['app-settings'],
        queryFn: listSettings,
    })
    const { data: schedules = [] } = useQuery<Array<{ id: string; enabled: boolean; default_enabled: boolean }>>({
        queryKey: ['task-schedules'],
        queryFn: listSchedules,
    })

    useEffect(() => {
        if (initialized) return
        const autoIntelligenceSetting = settings.find(item => item.key === AUTO_KNOWLEDGE_INTELLIGENCE_KEY)
        const autoBookmarkSetting = settings.find(item => item.key === AUTO_BOOKMARK_EXTRACTION_KEY)
        const hasEnabledSchedule = schedules.some(schedule => schedule.enabled)

        if (autoIntelligenceSetting) {
            setAutoIntelligenceEnabled(parseBooleanSetting(autoIntelligenceSetting.value, true))
        }
        if (autoBookmarkSetting) {
            setAutoBookmarkExtractionEnabled(parseBooleanSetting(autoBookmarkSetting.value, true))
        }
        if (schedules.length > 0) {
            setScheduledJobsEnabled(hasEnabledSchedule)
        }
        if (settings.length > 0 || schedules.length > 0) {
            setInitialized(true)
        }
    }, [initialized, schedules, settings])

    const apply = async () => {
        setSaving(true)
        setError(null)
        try {
            await Promise.all([
                updateSetting(AUTO_KNOWLEDGE_INTELLIGENCE_KEY, {
                    value: autoIntelligenceEnabled,
                    category: 'automation',
                    sensitive: false,
                }),
                updateSetting(AUTO_BOOKMARK_EXTRACTION_KEY, {
                    value: autoBookmarkExtractionEnabled,
                    category: 'automation',
                    sensitive: false,
                }),
            ])

            if (schedules.length > 0) {
                await Promise.all(
                    schedules.map(schedule =>
                        updateSchedule(schedule.id, {
                            enabled: scheduledJobsEnabled ? !!schedule.default_enabled : false,
                        }),
                    ),
                )
            }

            qc.invalidateQueries({ queryKey: ['app-settings'] })
            qc.invalidateQueries({ queryKey: ['task-schedules'] })
            await onNext()
        } catch (reason: unknown) {
            const err = reason as { response?: { data?: { detail?: string } }; message?: string }
            setError(err?.response?.data?.detail ?? err?.message ?? 'Failed to save automation preferences')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="glass-card shadow-glass-lg border border-accent/20 p-8 space-y-6 animate-slide-up">
            <div>
                <h2 className="text-xl font-bold mb-1">Automation Preferences</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                    Choose which background automations run by default. You can fine-tune schedule timing later in Settings.
                </p>
            </div>

            <div className="space-y-3">
                <button
                    type="button"
                    className="w-full rounded-xl border border-border/60 bg-muted/20 p-4 text-left"
                    onClick={() => setAutoIntelligenceEnabled(prev => !prev)}
                >
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                            <Star className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Automatic Intelligence Generation</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Auto-generate AI title, summary, tags, and insights when new knowledge is created.
                            </p>
                        </div>
                        <TogglePill checked={autoIntelligenceEnabled} />
                    </div>
                </button>

                <button
                    type="button"
                    className="w-full rounded-xl border border-border/60 bg-muted/20 p-4 text-left"
                    onClick={() => setAutoBookmarkExtractionEnabled(prev => !prev)}
                >
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-400/30 flex items-center justify-center text-blue-300">
                            <Link className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Automatic Bookmark Content Extraction</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Auto-extract readable content when bookmark knowledge is created or discovered in chat links.
                            </p>
                        </div>
                        <TogglePill checked={autoBookmarkExtractionEnabled} />
                    </div>
                </button>

                <button
                    type="button"
                    className="w-full rounded-xl border border-border/60 bg-muted/20 p-4 text-left"
                    onClick={() => setScheduledJobsEnabled(prev => !prev)}
                >
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                            <Play className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Scheduled Jobs</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Keep periodic jobs active. You can change intervals and per-job scheduling from Settings.
                            </p>
                        </div>
                        <TogglePill checked={scheduledJobsEnabled} />
                    </div>
                </button>
            </div>

            {error && (
                <p className="text-xs text-red-400">{error}</p>
            )}

            <div className="flex gap-3">
                <button className="btn-ghost justify-center py-3 px-4" onClick={onBack} disabled={saving || loading}>
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button className="btn-primary flex-1 justify-center py-3" onClick={apply} disabled={saving || loading}>
                    {(saving || loading) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Save Preferences & Launch
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

function TogglePill({ checked }: { checked: boolean }) {
    return (
        <span
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-muted/70'}`}
            aria-hidden
        >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </span>
    )
}

function WorkspaceCreateStep({ onNext, onBack, loading }: { onNext: () => void; onBack: () => void; loading: boolean }) {
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const [creating, setCreating] = useState(false)

    // Icon names for workspace icons (stored as strings, rendered as Lucide icons)
    const ICON_NAMES = ['brain', 'folder', 'briefcase', 'microscope', 'book-open', 'target', 'globe', 'lightbulb', 'wrench', 'palette', 'bar-chart-3', 'rocket', 'shield', 'flask-conical', 'leaf', 'key', 'settings-2', 'pen-line', 'database', 'sprout'] as const
    type IconName = typeof ICON_NAMES[number]

    const ICON_COMPONENTS: Record<IconName, React.ReactNode> = {
        'brain': <Brain className="w-4 h-4" />,
        'folder': <Folder className="w-4 h-4" />,
        'briefcase': <Briefcase className="w-4 h-4" />,
        'microscope': <Microscope className="w-4 h-4" />,
        'book-open': <BookOpen className="w-4 h-4" />,
        'target': <Target className="w-4 h-4" />,
        'globe': <Globe className="w-4 h-4" />,
        'lightbulb': <Lightbulb className="w-4 h-4" />,
        'wrench': <Wrench className="w-4 h-4" />,
        'palette': <Palette className="w-4 h-4" />,
        'bar-chart-3': <BarChart3 className="w-4 h-4" />,
        'rocket': <Rocket className="w-4 h-4" />,
        'shield': <Shield className="w-4 h-4" />,
        'flask-conical': <FlaskConical className="w-4 h-4" />,
        'leaf': <Leaf className="w-4 h-4" />,
        'key': <Key className="w-4 h-4" />,
        'settings-2': <Settings2 className="w-4 h-4" />,
        'pen-line': <PenLine className="w-4 h-4" />,
        'database': <Database className="w-4 h-4" />,
        'sprout': <Sprout className="w-4 h-4" />,
    }

    type WsDraft = { id: number; name: string; icon: IconName; providerId: string; modelOverride: string }

    const [workspaces, setWorkspaces] = useState<WsDraft[]>([
        { id: Date.now(), name: '', icon: 'brain', providerId: '', modelOverride: '' }
    ])

    const updateWs = (id: number, patch: Partial<WsDraft>) =>
        setWorkspaces(ws => ws.map(w => w.id === id ? { ...w, ...patch } : w))

    const addWorkspace = () =>
        setWorkspaces(ws => [...ws, { id: Date.now(), name: '', icon: 'folder', providerId: '', modelOverride: '' }])

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
        <div className="glass-card shadow-glass-lg border border-accent/20 p-8 space-y-5 animate-slide-up">
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
                        iconNames={ICON_NAMES}
                        iconComponents={ICON_COMPONENTS}
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

            <div className="flex gap-3">
                <button className="btn-ghost justify-center py-3 px-4" onClick={onBack} disabled={creating || loading}>
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                    className="btn-primary flex-1 justify-center py-3"
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
        </div>
    )
}

type ProviderOption = {
    id: string
    display_name: string
    provider_name: string
    default_model: string | null
    enabled_models?: { id: string; name: string }[]
}
type IconName = 'brain' | 'folder' | 'briefcase' | 'microscope' | 'book-open' | 'target' | 'globe' | 'lightbulb' | 'wrench' | 'palette' | 'bar-chart-3' | 'rocket' | 'shield' | 'flask-conical' | 'leaf' | 'key' | 'settings-2' | 'pen-line' | 'database' | 'sprout'

function WorkspaceDraftCard({ ws, idx, iconNames, iconComponents, providers, onChange, onRemove }: {
    ws: { name: string; icon: IconName; providerId: string; modelOverride: string }
    idx: number
    iconNames: readonly IconName[]
    iconComponents: Record<IconName, React.ReactNode>
    providers: ProviderOption[]
    onChange: (patch: Partial<{ name: string; icon: IconName; providerId: string; modelOverride: string }>) => void
    onRemove?: () => void
}) {
    const [showIcons, setShowIcons] = useState(false)
    const selectedProvider = providers.find(p => p.id === ws.providerId)

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
                        className="w-11 h-11 rounded-xl border border-border bg-background/50 flex items-center justify-center hover:border-accent transition-colors"
                    >
                        {iconComponents[ws.icon]}
                    </button>
                    {showIcons && (
                        <div className="absolute z-[140] mt-1 p-2 rounded-xl border border-border bg-popover shadow-xl grid grid-cols-5 gap-1">
                            {iconNames.map(ic => (
                                <button
                                    key={ic}
                                    onClick={() => { onChange({ icon: ic }); setShowIcons(false) }}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors ${ws.icon === ic ? 'bg-accent/20 ring-1 ring-accent' : ''}`}
                                >
                                    {iconComponents[ic]}
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
                                    {sanitizeProviderDisplayName(p.display_name)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">Model override</label>
                        <ModelOverrideSelect
                            models={selectedProvider?.enabled_models ?? []}
                            value={ws.modelOverride}
                            onChange={value => onChange({ modelOverride: value })}
                            disabled={!ws.providerId}
                            placeholder={ws.providerId
                                ? (selectedProvider?.default_model
                                    ? `Default: ${selectedProvider.default_model}`
                                    : 'Select model override')
                                : 'Select provider first'}
                            inheritLabel="Inherit provider default"
                            compact
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
