import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
    getOnboarding, advanceOnboarding, createProvider, updateProvider,
    testConnection, listModels, createWorkspace, listProviders,
    listSettings, updateSetting, listSchedules, updateSchedule,
} from '@/lib/api'
import { Play, FileText, Bookmark, Code2, Globe2, Eye, EyeOff, Loader2, Link, Bot, Star, X, Check, Search, CheckCircle2, XCircle, Sliders, Sparkles, ArrowRight, Plus, Trash2, MessageSquare, Lock, Brain, Folder, Briefcase, Microscope, BookOpen, Target, Globe, Lightbulb, Wrench, Palette, BarChart3, Rocket, Shield, FlaskConical, Leaf, Key, Settings2, PenLine, Database, Sprout } from 'lucide-react'
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

const STEPS = ['welcome', 'llm_setup', 'workspace_create', 'automation_preferences']
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
                        return (
                            <div key={s} className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${isDone ? 'bg-accent/20 text-accent outline outline-2 outline-accent/30 shadow-glass-sm' :
                                    isActive ? 'bg-accent text-accent-foreground scale-110 outline outline-2 outline-accent/50 shadow-glass-md' :
                                        'glass-sm text-muted-foreground border border-border/50'
                                    }`}>
                                    {isDone ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : i + 1}
                                </div>
                                {i < STEPS.length - 1 && (
                                    <div className={`w-16 h-0.5 transition-all duration-500 rounded-full ${isDone ? 'bg-accent/50 shadow-[0_0_8px_rgba(var(--accent),0.5)]' : 'bg-border/50'}`} />
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
                    <WorkspaceCreateStep onNext={async () => {
                        await advance.mutateAsync('automation_preferences')
                        qc.invalidateQueries({ queryKey: ['onboarding'] })
                    }} />
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
                    }} loading={advance.isPending} />
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

function LLMSetupStep({ onNext, loading }: { onNext: () => void; loading: boolean }) {
    // Configured providers (accumulated during this step)
    const [configured, setConfigured] = useState<{ id: string; name: string }[]>([])

    // Add-provider form state
    const [selected, setSelected] = useState<string | null>(null)
    const [apiKey, setApiKey] = useState('')
    const [showKey, setShowKey] = useState(false)
    const [baseUrl, setBaseUrl] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [createdProviderId, setCreatedProviderId] = useState<string | null>(null)

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
        setCreatedProviderId(null); setShowAdvanced(false)
    }

    const handleSelectProvider = (id: string) => {
        setSelected(id); setApiKey(''); setShowKey(false)
        setBaseUrl(id === 'ollama' ? 'http://localhost:11434' : '')
        setDisplayName(''); setModels(null); setModelError(null)
        setSelectedModels(new Set()); setManualModel(''); setSaveError(null); setTestResult(null)
        setCreatedProviderId(null); setShowAdvanced(false)
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
            let pid = createdProviderId
            if (!pid) {
                const temp = await createProvider({
                    provider_name: selected,
                    display_name: displayName || provider?.name || selected,
                    api_key: apiKey || undefined,
                    base_url: baseUrl || undefined,
                })
                pid = temp.id
                setCreatedProviderId(pid)
            } else {
                await updateProvider(pid, {
                    display_name: displayName || provider?.name || selected,
                    api_key: apiKey || undefined,
                    base_url: baseUrl || undefined,
                })
            }
            const result = await testConnection(pid)
            setTestResult(result)
            if (result.success) {
                try {
                    const list = await listModels(pid)
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

    const [showAdvanced, setShowAdvanced] = useState(false)

    const handleSave = async () => {
        const modelsToAdd = models ? [...selectedModels] : manualModel.trim() ? [manualModel.trim()] : []
        if (!modelsToAdd.length) { setSaveError('Select at least one model or enter a model ID.'); return }
        setSaving(true); setSaveError(null)
        try {
            const enabledList = modelsToAdd.map(modelId => {
                const label = models?.find(m => m.id === modelId)?.name ?? modelId
                return { id: modelId, name: label }
            })

            if (createdProviderId) {
                await updateProvider(createdProviderId, {
                    display_name: displayName || provider?.name || selected,
                    api_key: apiKey || undefined,
                    base_url: baseUrl || undefined,
                    default_model: modelsToAdd[0],
                    enabled_models: enabledList,
                })
                setConfigured(c => [...c, { id: createdProviderId, name: sanitizeProviderDisplayName(displayName || provider?.name || selected!) }])
            } else {
                const saved = await createProvider({
                    provider_name: selected!,
                    display_name: displayName || provider?.name || selected,
                    api_key: apiKey || undefined,
                    base_url: baseUrl || undefined,
                    default_model: modelsToAdd[0],
                    enabled_models: enabledList,
                })
                setConfigured(c => [...c, { id: saved.id, name: sanitizeProviderDisplayName(saved.display_name) }])
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
        <div className="glass-card shadow-glass-lg p-6 flex flex-col space-y-6 animate-slide-up border border-accent/20">
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
                <div className="relative">
                    <p className="text-xs font-medium text-muted-foreground mb-2">1. Select provider</p>
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
                        {/* Step 2 — Credentials */}
                        <div className="space-y-2">
                            <label className="text-xs text-muted-foreground font-medium block">2. Enter credentials</label>
                            {isLocalProvider(selected) && (
                                <p className="text-[10px] text-lime-300/90">Local provider (runs on this machine)</p>
                            )}
                            <input className="input text-sm" placeholder={`Display name (default: ${provider?.name})`} value={displayName} onChange={e => setDisplayName(e.target.value)} />

                            {provider?.needsUrl ? (
                                <>
                                    <input className="input text-sm" placeholder={(provider as any)?.urlPlaceholder ?? 'https://your-api.com'} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                                    <div className="relative">
                                        <input type={showKey ? 'text' : 'password'} className="input text-sm pr-10" placeholder={(provider as any)?.placeholder ?? 'API Key or Token'} value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(v => !v)}>
                                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="relative">
                                        <input type={showKey ? 'text' : 'password'} className="input text-sm pr-10" placeholder={(provider as any)?.placeholder ?? 'API Key'} value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(v => !v)}>
                                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 transition-colors"
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                    >
                                        <Sliders className="w-3 h-3" /> {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings (Custom Base URL)'}
                                    </button>
                                    {showAdvanced && (
                                        <div className="animate-fade-in pt-1">
                                            <label className="text-[10px] text-muted-foreground mb-1 block">Base URL Override (e.g. for API gateways)</label>
                                            <input className="input text-sm" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                                        </div>
                                    )}
                                </>
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
                                    {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
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
                            {saving ? 'Saving…' : totalSelected > 0 ? `Save Provider with ${totalSelected} model${totalSelected > 1 ? 's' : ''}` : 'Select models above'}
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

function AutomationPreferencesStep({ onNext, loading }: { onNext: () => void | Promise<void>; loading: boolean }) {
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

            <button className="btn-primary w-full justify-center py-3" onClick={apply} disabled={saving || loading}>
                {(saving || loading) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save Preferences & Launch
                <ArrowRight className="w-4 h-4" />
            </button>
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

function WorkspaceCreateStep({ onNext }: { onNext: () => void }) {
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
