import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
    listProviders, createProvider, updateProvider, deleteProvider,
    testConnection, listModels, setDefaultProvider,
    listWorkspaces, updateWorkspace, createWorkspace, deleteWorkspace,
    listPrompts, updatePrompt,
    listSchedules, updateSchedule, runTaskNow, getTaskHistory, listSettings, updateSetting
} from '@/lib/api'
import {
    Globe2, Loader2, Trash2, CheckCircle2, XCircle, Star, Plus,
    ChevronDown, ChevronUp, Eye, EyeOff, RefreshCw, Zap, Server, Search, Check,
    Layers, Bot, FolderOpen, Pencil, Save, X, Sliders, RotateCcw, MessageSquare,
    FileText, Timer, History, Play, Clock, CheckCircle, AlertCircle, Circle, Terminal,
    Brain, Folder, Briefcase, Microscope, BookOpen, Target, Globe, Lightbulb, Wrench,
    Palette, BarChart3, Rocket, Shield, FlaskConical, Leaf, Key, Settings2, PenLine,
    Database, Sprout
} from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'
import { ModelOverrideSelect } from '@/components/shared/ModelOverrideSelect'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'

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

// ── Workspace Icon Registry ─────────────────────────────────────────────────────
export const WORKSPACE_ICONS = {
    'brain': Brain, 'folder': Folder, 'briefcase': Briefcase, 'microscope': Microscope,
    'book-open': BookOpen, 'target': Target, 'globe': Globe, 'lightbulb': Lightbulb,
    'wrench': Wrench, 'palette': Palette, 'bar-chart-3': BarChart3, 'rocket': Rocket,
    'shield': Shield, 'flask-conical': FlaskConical, 'leaf': Leaf, 'key': Key,
    'settings-2': Settings2, 'pen-line': PenLine, 'database': Database, 'sprout': Sprout,
} as const
export type WorkspaceIconName = keyof typeof WORKSPACE_ICONS
export const WORKSPACE_ICON_NAMES = Object.keys(WORKSPACE_ICONS) as WorkspaceIconName[]

export function getWorkspaceIcon(iconName: string | null): React.ReactNode {
    if (!iconName) return <FolderOpen className="w-4 h-4 text-accent" />
    const IconComponent = WORKSPACE_ICONS[iconName as WorkspaceIconName]
    if (!IconComponent) return <FolderOpen className="w-4 h-4 text-accent" />
    return <IconComponent className="w-4 h-4" />
}

type SettingsTab = 'workspaces' | 'llm' | 'prompts' | 'schedules' | 'audit'
const SETTINGS_TABS: SettingsTab[] = ['workspaces', 'llm', 'prompts', 'schedules', 'audit']
const toSettingsTab = (value: string | null): SettingsTab =>
    SETTINGS_TABS.includes(value as SettingsTab) ? (value as SettingsTab) : 'workspaces'

// ── Root component ────────────────────────────────────────────────────────────
export default function SettingsPage() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const [searchParams, setSearchParams] = useSearchParams()
    const queryTab = searchParams.get('tab')
    const newWorkspaceRequested = searchParams.get('newWorkspace') === '1'
    const [activeTab, setActiveTab] = useState<SettingsTab>(() => toSettingsTab(queryTab))

    useEffect(() => {
        const nextTab = toSettingsTab(queryTab)
        setActiveTab(prev => (prev === nextTab ? prev : nextTab))
    }, [queryTab])

    useEffect(() => {
        if (!newWorkspaceRequested) return
        setActiveTab('workspaces')
    }, [newWorkspaceRequested])

    const TABS = [
        { id: 'workspaces' as const, label: 'Workspaces', Icon: FolderOpen },
        { id: 'llm' as const, label: 'AI Providers', Icon: Bot },
        { id: 'prompts' as const, label: 'Prompts', Icon: Sliders },
        { id: 'schedules' as const, label: 'Schedules', Icon: Timer },
        { id: 'audit' as const, label: 'Audit', Icon: History },
    ]

    return (
        <div className="w-full h-full min-h-0 p-6 lg:p-8 flex flex-col">
            {/* Tabs */}
            <div className="flex shrink-0 gap-2 mb-8 p-1.5 glass-card w-full sm:w-fit rounded-2xl overflow-x-auto min-h-[52px]">
                {TABS.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        onClick={() => {
                            setActiveTab(id)
                            const next = new URLSearchParams(searchParams)
                            next.set('tab', id)
                            if (id !== 'workspaces') {
                                next.delete('newWorkspace')
                            }
                            setSearchParams(next, { replace: true })
                        }}
                        className={`flex min-h-9 items-center justify-center gap-2 px-5 py-2 text-sm font-medium rounded-xl transition-all duration-300 whitespace-nowrap ${activeTab === id
                            ? 'bg-accent/20 text-accent shadow-glass-inset ring-1 ring-accent/30'
                            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                            }`}
                    >
                        <Icon className="w-4 h-4" />
                        {label}
                    </button>
                ))}
            </div>

            {activeTab === 'workspaces' && (
                <WorkspacesSettings
                    activeWorkspaceId={workspaceId}
                    openCreateRequested={newWorkspaceRequested}
                    onCreateRequestConsumed={() => {
                        if (!newWorkspaceRequested) return
                        const next = new URLSearchParams(searchParams)
                        next.delete('newWorkspace')
                        setSearchParams(next, { replace: true })
                    }}
                />
            )}
            {activeTab === 'llm' && <LLMSettings />}
            {activeTab === 'prompts' && <PromptsTab />}
            {activeTab === 'schedules' && <SchedulesTab />}
            {activeTab === 'audit' && (
                <div className="min-h-0 flex-1">
                    <AuditTab workspaceId={workspaceId} />
                </div>
            )}
        </div>
    )
}

// ── Workspaces Tab ────────────────────────────────────────────────────────────
type WorkspaceRow = {
    id: string; name: string; description: string | null
    icon: string | null; color: string | null
    llm_provider_id: string | null; llm_model: string | null
    note_count: number; knowledge_count?: number; conversation_count: number
}

function WorkspacesSettings({
    activeWorkspaceId,
    openCreateRequested,
    onCreateRequestConsumed,
}: {
    activeWorkspaceId: string
    openCreateRequested?: boolean
    onCreateRequestConsumed?: () => void
}) {
    const qc = useQueryClient()
    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })

    const [showAdd, setShowAdd] = useState(false)
    const [newName, setNewName] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [adding, setAdding] = useState(false)

    useEffect(() => {
        if (!openCreateRequested) return
        setShowAdd(true)
        onCreateRequestConsumed?.()
    }, [openCreateRequested, onCreateRequestConsumed])

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

type ProviderRow = { id: string; display_name: string; provider_name: string; default_model: string | null; is_system_default: boolean; has_api_key: boolean; base_url: string | null; enabled_models: { id: string; name: string }[] }

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
    const [icon, setIcon] = useState(ws.icon ?? 'folder')
    const [showIcons, setShowIcons] = useState(false)
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
        <div className={`glass-card-hover transition-all duration-300 ${isActive ? 'border-accent/50 shadow-glass-lg' : ''}`}>
            <div
                className="flex cursor-pointer items-center gap-3 px-4 py-3"
                role="button"
                tabIndex={0}
                onClick={() => setExpanded(p => !p)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setExpanded(p => !p)
                    }
                }}
            >
                <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                    {getWorkspaceIcon(ws.icon)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{ws.name}</span>
                        {isActive && <span className="chip-accent text-[10px]">Current</span>}
                        <span className="text-xs text-muted-foreground">{ws.knowledge_count ?? ws.note_count} knowledge · {ws.conversation_count} chats</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {ws.description || (ws.llm_provider_id ? `Provider override set` : 'Using global default provider')}
                    </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                    <button
                        className="btn-ghost p-1.5"
                        onClick={(e) => {
                            e.stopPropagation()
                            setExpanded(p => !p)
                        }}
                    >
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        className="btn-ghost p-1.5 text-red-400 hover:bg-destructive/10"
                        onClick={(e) => {
                            e.stopPropagation()
                            void handleDelete()
                        }}
                        disabled={deleting}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-border/50 px-4 py-4 space-y-3 animate-fade-in">
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                        <div className="flex items-center gap-2">
                            <div className="relative flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowIcons(v => !v)}
                                    className="input h-10 w-11 px-0 flex items-center justify-center"
                                    aria-label="Select workspace icon"
                                >
                                    {getWorkspaceIcon(icon)}
                                </button>
                                {showIcons && (
                                    <div className="absolute left-0 z-[140] mt-1 p-2 rounded-lg border border-border bg-popover shadow-xl grid grid-cols-5 gap-1 w-max min-w-44">
                                        {WORKSPACE_ICON_NAMES.map(ic => {
                                            const IconComp = WORKSPACE_ICONS[ic]
                                            return (
                                                <button
                                                    key={ic}
                                                    type="button"
                                                    onClick={() => { setIcon(ic); setShowIcons(false) }}
                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors ${icon === ic ? 'bg-accent/20 ring-1 ring-accent' : ''}`}
                                                >
                                                    <IconComp className="w-4 h-4" />
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                            <input
                                className="input h-10 flex-1 text-sm"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                        <textarea className="input text-sm resize-none" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
                    </div>

                    <div className="border-t border-border/40 pt-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">AI Override <span className="text-xs font-normal opacity-60">(overrides global default for this workspace)</span></p>
                        <div className="grid gap-3 md:grid-cols-2">
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
                                <ModelOverrideSelect
                                    models={selectedProvider?.enabled_models ?? []}
                                    value={model}
                                    onChange={setModel}
                                    disabled={!providerId}
                                    placeholder={providerId
                                        ? (selectedProvider?.default_model
                                            ? `Default: ${selectedProvider.default_model}`
                                            : 'Select model override')
                                        : 'Select provider first'}
                                    inheritLabel="Inherit provider default"
                                />
                            </div>
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
    const [saved, setSaved] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [createdProviderId, setCreatedProviderId] = useState<string | null>(null)

    const meta = PROVIDER_META[providerName]

    const handleProviderChange = (id: string) => {
        setProviderName(id); setDisplayName(''); setApiKey(''); setBaseUrl('')
        setShowKey(false); setModels(null); setModelError(null)
        setModelSearch(''); setSelectedModels(new Set()); setManualModel('')
        setSaved(false); setSaveError(null)
        setCreatedProviderId(null)
        setShowAdvanced(false)
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
            let pid = createdProviderId
            if (!pid) {
                const temp = await createProvider({
                    provider_name: providerName,
                    display_name: displayName || meta?.name || providerName,
                    api_key: apiKey || undefined,
                    base_url: baseUrl || undefined,
                })
                pid = temp.id
                setCreatedProviderId(pid)
            } else {
                await updateProvider(pid, {
                    display_name: displayName || meta?.name || providerName,
                    api_key: apiKey || undefined,
                    base_url: baseUrl || undefined,
                })
            }
            const list = await listModels(pid!)
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
        setSaving(true); setSaveError(null)
        try {
            const enabledList = modelsToSave.map(modelId => {
                const label = models?.find(m => m.id === modelId)?.name ?? modelId
                return { id: modelId, name: label }
            })
            if (createdProviderId) {
                await updateProvider(createdProviderId, {
                    display_name: displayName || meta?.name || providerName,
                    api_key: apiKey || undefined,
                    base_url: baseUrl || undefined,
                    default_model: modelsToSave[0],
                    enabled_models: enabledList,
                })
            } else {
                await createProvider({
                    provider_name: providerName,
                    display_name: displayName || meta?.name || providerName,
                    api_key: apiKey || undefined,
                    base_url: baseUrl || undefined,
                    default_model: modelsToSave[0],
                    enabled_models: enabledList,
                })
            }
            setSaved(true); onAdded()
            setModels(null); setSelectedModels(new Set()); setManualModel(''); setSaveError(null)
            setCreatedProviderId(null)
            setTimeout(() => setSaved(false), 3000)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setSaveError(err?.response?.data?.detail ?? err?.message ?? 'Save failed')
        } finally { setSaving(false) }
    }

    const canFetch = meta?.needsUrl ? !!baseUrl : !!apiKey
    const totalSelected = models ? selectedModels.size : (manualModel.trim() ? 1 : 0)

    const [showAdvanced, setShowAdvanced] = useState(false)

    return (
        <div className="glass-card shadow-glass-lg p-5 space-y-4 border border-accent/30 animate-fade-in">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-accent">Add Provider</h4>
                {saved && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Saved
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
                                className={`p-2 rounded-xl border text-center text-xs transition-all duration-300 ${providerName === id ? `${m.color} border-accent ring-2 ring-accent/30 scale-105 shadow-glass-md` : 'border-border/50 hover:bg-muted/30 hover:shadow-glass-sm'
                                    }`}
                            >
                                <div className="flex justify-center mb-1.5">
                                    <ProviderIcon providerId={id} className="w-4 h-4" />
                                </div>
                                <div className="text-[10px] leading-tight font-medium truncate">{m.name}</div>
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
                    <>
                        <div className="relative">
                            <input type={showKey ? 'text' : 'password'} className="input text-sm pr-10" placeholder={meta?.placeholder ?? 'API Key'} value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
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
                {saving ? `Saving…` : totalSelected > 0 ? `Save Provider with ${totalSelected} model${totalSelected > 1 ? 's' : ''}` : 'Select models above'}
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
    const [selectedModel, setSelectedModel] = useState(provider.default_model ?? '')
    const [savingModel, setSavingModel] = useState(false)
    const [modelSaved, setModelSaved] = useState(false)
    const [modelSearch, setModelSearch] = useState('')

    const meta = PROVIDER_META[provider.provider_name]
    const filteredModels = useMemo(() => {
        const list = provider.enabled_models || []
        const q = modelSearch.toLowerCase()
        return q ? list.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : list
    }, [provider.enabled_models, modelSearch])

    const handleTest = async () => {
        setTesting(true); setTestResult(null)
        try { setTestResult(await testConnection(provider.id)) }
        catch { setTestResult({ success: false, message: 'Request failed' }) }
        finally { setTesting(false) }
    }

    const handleSaveModel = async () => {
        setSavingModel(true)
        await updateProvider(provider.id, { default_model: selectedModel })
        qc.invalidateQueries({ queryKey: ['providers'] })
        setSavingModel(false); setModelSaved(true)
        setTimeout(() => setModelSaved(false), 2000)
    }

    return (
        <div className="glass-card-hover transition-all duration-300">
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
                            <label className="text-xs font-medium text-muted-foreground">Default Model</label>
                            {modelSaved && <span className="text-[10px] text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Saved</span>}
                        </div>
                        {provider.enabled_models && provider.enabled_models.length > 0 ? (
                            <>
                                <div className="max-h-36 overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20">
                                    {filteredModels.map(m => (
                                        <button key={m.id} onClick={() => setSelectedModel(m.id)}
                                            className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-muted/30 transition-colors ${selectedModel === m.id ? 'bg-accent/10 text-accent' : 'text-muted-foreground'}`}>
                                            {selectedModel === m.id ? <Zap className="w-3 h-3 flex-shrink-0" /> : <span className="w-3" />}
                                            <span className="truncate">{m.name}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input className="input text-xs flex-1 py-1.5" placeholder="Model ID…" value={selectedModel} onChange={e => setSelectedModel(e.target.value)} />
                                    <button className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap" onClick={handleSaveModel} disabled={savingModel || !selectedModel}>
                                        {savingModel ? 'Saving…' : 'Save Default Model'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex gap-2 items-center">
                                <input className="input text-xs flex-1 py-1.5" placeholder="Model ID…" value={selectedModel} onChange={e => setSelectedModel(e.target.value)} />
                                <button className="btn-primary text-xs py-1.5 px-3" onClick={handleSaveModel} disabled={savingModel || !selectedModel}>
                                    {modelSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : savingModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                    {modelSaved ? 'Saved' : 'Set default'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Prompts Tab ───────────────────────────────────────────────────────────────
interface PromptEntry {
    id: string
    label: string
    description: string
    category: string
    role: string
    variables: string[]
    default: string
    override: string | null
    updated_at: string | null
}

function PromptsTab() {
    const qc = useQueryClient()
    const { data: prompts = [], isLoading } = useQuery<PromptEntry[]>({
        queryKey: ['prompts'],
        queryFn: listPrompts,
    })

    const [drafts, setDrafts] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState<Record<string, boolean>>({})
    const [saved, setSaved] = useState<Record<string, boolean>>({})

    useEffect(() => {
        const d: Record<string, string> = {}
        for (const p of (prompts as PromptEntry[])) {
            if (!(p.id in drafts)) d[p.id] = p.override ?? ''
        }
        if (Object.keys(d).length > 0) setDrafts(prev => ({ ...d, ...prev }))
    }, [prompts]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = async (p: PromptEntry) => {
        setSaving(s => ({ ...s, [p.id]: true }))
        const val = drafts[p.id]?.trim() || null
        await updatePrompt(p.id, { override: val })
        qc.invalidateQueries({ queryKey: ['prompts'] })
        setSaving(s => ({ ...s, [p.id]: false }))
        setSaved(s => ({ ...s, [p.id]: true }))
        setTimeout(() => setSaved(s => ({ ...s, [p.id]: false })), 2000)
    }

    const handleReset = async (p: PromptEntry) => {
        setSaving(s => ({ ...s, [p.id]: true }))
        await updatePrompt(p.id, { override: null })
        qc.invalidateQueries({ queryKey: ['prompts'] })
        setDrafts(d => ({ ...d, [p.id]: '' }))
        setSaving(s => ({ ...s, [p.id]: false }))
    }

    const insertVariable = (promptId: string, variable: string) => {
        setDrafts(d => ({ ...d, [promptId]: (d[promptId] ?? '') + variable }))
    }

    const categories = ['notes', 'chat']
    const categoryLabels: Record<string, string> = {
        notes: 'Knowledge Intelligence',
        chat: 'Chat & Retrieval',
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="glass-card p-4 border-accent/20 bg-accent/5">
                <div className="flex items-start gap-3">
                    <Sliders className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                        <p className="font-medium text-foreground mb-1">Customise AI Prompts</p>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                            Override the system prompts used for each AI task. Leave a prompt blank to use the default.
                            Click variable chips to insert them into your custom prompt.
                        </p>
                    </div>
                </div>
            </div>

            {categories.map(cat => {
                const catPrompts = (prompts as PromptEntry[]).filter(p => p.category === cat)
                if (!catPrompts.length) return null
                const CatIcon = cat === 'notes' ? FileText : MessageSquare
                return (
                    <div key={cat}>
                        <div className="flex items-center gap-2 mb-4">
                            <CatIcon className="w-4 h-4 text-accent" />
                            <h3 className="font-semibold text-sm">{categoryLabels[cat]}</h3>
                            <div className="flex-1 h-px bg-border/50" />
                        </div>
                        <div className="space-y-5">
                            {catPrompts.map(p => {
                                const draft = drafts[p.id] ?? ''
                                const isModified = draft !== (p.override ?? '')
                                const hasOverride = !!p.override
                                return (
                                    <div key={p.id} className="glass-card p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="font-medium text-sm">{p.label}</span>
                                                    {hasOverride && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium">Custom</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground">{p.description}</p>
                                            </div>
                                        </div>

                                        {p.variables.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                <span className="text-[10px] text-muted-foreground">Insert variable:</span>
                                                {p.variables.map(v => (
                                                    <button
                                                        key={v}
                                                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted/50 border border-border/50 hover:bg-accent/20 hover:text-accent hover:border-accent/30 transition-colors"
                                                        onClick={() => insertVariable(p.id, v)}
                                                    >
                                                        {v}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Default system prompt</p>
                                            <div className="bg-muted/20 border border-border/40 rounded-lg p-3 text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                                                {p.default}
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
                                                Custom override {!hasOverride && '(leave blank to use default)'}
                                            </p>
                                            <textarea
                                                className="input w-full text-xs font-mono resize-none leading-relaxed"
                                                rows={5}
                                                placeholder={p.default}
                                                value={draft}
                                                onChange={e => setDrafts(d => ({ ...d, [p.id]: e.target.value }))}
                                            />
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                className="btn-primary text-xs py-1.5 px-3"
                                                disabled={saving[p.id] || !isModified}
                                                onClick={() => handleSave(p)}
                                            >
                                                {saving[p.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved[p.id] ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                                                {saved[p.id] ? 'Saved!' : 'Save override'}
                                            </button>
                                            {hasOverride && (
                                                <button
                                                    className="btn-ghost text-xs py-1.5 px-3 text-muted-foreground"
                                                    disabled={saving[p.id]}
                                                    onClick={() => handleReset(p)}
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" /> Reset to default
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ── Schedules Tab ─────────────────────────────────────────────────────────────
interface ScheduleEntry {
    id: string
    label: string
    description: string
    category: string
    default_enabled: boolean
    default_interval_hours: number
    enabled: boolean
    interval_hours: number
    supports_target_scope?: boolean
    target_scope?: 'one' | 'remaining' | 'all' | null
    knowledge_id?: string | null
    last_run: string | null
}

const INTERVAL_OPTS = [
    { value: 1, label: 'Every hour' },
    { value: 6, label: 'Every 6 hours' },
    { value: 12, label: 'Every 12 hours' },
    { value: 24, label: 'Daily' },
    { value: 48, label: 'Every 2 days' },
    { value: 168, label: 'Weekly' },
]

const TARGET_SCOPE_OPTS = [
    { value: 'remaining', label: 'Remaining targets' },
    { value: 'all', label: 'All targets' },
    { value: 'one', label: 'One target' },
]

const CATEGORY_LABELS: Record<string, string> = {
    indexing: 'Indexing',
    intelligence: 'AI Intelligence',
    maintenance: 'Maintenance',
}

const CHAT_TRASH_RETENTION_KEY = 'chat.trash_retention_days'
const DEFAULT_CHAT_TRASH_RETENTION_DAYS = 30
const MIN_CHAT_TRASH_RETENTION_DAYS = 1
const MAX_CHAT_TRASH_RETENTION_DAYS = 365

function SchedulesTab() {
    const qc = useQueryClient()
    const { data: schedules = [], isLoading } = useQuery<ScheduleEntry[]>({
        queryKey: ['task-schedules'],
        queryFn: listSchedules,
    })
    const { data: settings = [] } = useQuery<Array<{ key: string; value: unknown; category: string }>>({
        queryKey: ['app-settings'],
        queryFn: listSettings,
    })
    const [running, setRunning] = useState<Record<string, boolean>>({})
    const [retentionDaysDraft, setRetentionDaysDraft] = useState(String(DEFAULT_CHAT_TRASH_RETENTION_DAYS))
    const [savingRetention, setSavingRetention] = useState(false)

    const retentionDays = useMemo(() => {
        const raw = settings.find(item => item.key === CHAT_TRASH_RETENTION_KEY)?.value
        const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
        if (!Number.isFinite(parsed)) return DEFAULT_CHAT_TRASH_RETENTION_DAYS
        return Math.max(MIN_CHAT_TRASH_RETENTION_DAYS, Math.min(MAX_CHAT_TRASH_RETENTION_DAYS, parsed))
    }, [settings])

    useEffect(() => {
        setRetentionDaysDraft(String(retentionDays))
    }, [retentionDays])

    const handleToggle = async (s: ScheduleEntry) => {
        await updateSchedule(s.id, { enabled: !s.enabled })
        qc.invalidateQueries({ queryKey: ['task-schedules'] })
    }

    const handleInterval = async (s: ScheduleEntry, hours: number) => {
        await updateSchedule(s.id, { interval_hours: hours })
        qc.invalidateQueries({ queryKey: ['task-schedules'] })
    }

    const handleRunNow = async (s: ScheduleEntry) => {
        setRunning(r => ({ ...r, [s.id]: true }))
        const payload = s.supports_target_scope
            ? {
                target_scope: (s.target_scope || 'remaining') as 'one' | 'remaining' | 'all',
                knowledge_id: s.target_scope === 'one' ? (s.knowledge_id || undefined) : undefined,
            }
            : undefined
        await runTaskNow(s.id, payload)
        qc.invalidateQueries({ queryKey: ['task-schedules'] })
        qc.invalidateQueries({ queryKey: ['task-history'] })
        setTimeout(() => setRunning(r => ({ ...r, [s.id]: false })), 2000)
    }

    const handleTargetScope = async (s: ScheduleEntry, targetScope: 'one' | 'remaining' | 'all') => {
        await updateSchedule(s.id, { target_scope: targetScope })
        qc.invalidateQueries({ queryKey: ['task-schedules'] })
    }

    const handleKnowledgeTarget = async (s: ScheduleEntry, knowledgeId: string) => {
        const trimmed = knowledgeId.trim()
        if (!trimmed) return
        await updateSchedule(s.id, { knowledge_id: trimmed })
        qc.invalidateQueries({ queryKey: ['task-schedules'] })
    }

    const handleSaveRetention = async () => {
        const parsed = parseInt(retentionDaysDraft, 10)
        const normalized = Number.isFinite(parsed)
            ? Math.max(MIN_CHAT_TRASH_RETENTION_DAYS, Math.min(MAX_CHAT_TRASH_RETENTION_DAYS, parsed))
            : DEFAULT_CHAT_TRASH_RETENTION_DAYS

        setSavingRetention(true)
        await updateSetting(CHAT_TRASH_RETENTION_KEY, {
            value: normalized,
            category: 'chat',
            sensitive: false,
        })
        setRetentionDaysDraft(String(normalized))
        qc.invalidateQueries({ queryKey: ['app-settings'] })
        setSavingRetention(false)
    }

    if (isLoading) return (
        <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
    )

    const categories = ['indexing', 'intelligence', 'maintenance']

    return (
        <div className="space-y-8">
            <div className="glass-card p-4 border-accent/20 bg-accent/5">
                <div className="flex items-start gap-3">
                    <Timer className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <div className="text-sm flex-1 min-w-0">
                        <p className="font-medium mb-1">Background Task Schedules</p>
                        <p className="text-muted-foreground text-xs leading-relaxed mb-3">
                            Configure which background tasks run automatically and how often.
                            Use "Run Now" to trigger a task immediately.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="text-xs text-muted-foreground" htmlFor="chat-trash-retention-days">
                                Chat trash retention
                            </label>
                            <input
                                id="chat-trash-retention-days"
                                type="number"
                                min={MIN_CHAT_TRASH_RETENTION_DAYS}
                                max={MAX_CHAT_TRASH_RETENTION_DAYS}
                                className="input h-8 w-24 text-xs"
                                value={retentionDaysDraft}
                                onChange={e => setRetentionDaysDraft(e.target.value)}
                            />
                            <span className="text-xs text-muted-foreground">days</span>
                            <button
                                className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5"
                                disabled={savingRetention || parseInt(retentionDaysDraft, 10) === retentionDays}
                                onClick={() => { void handleSaveRetention() }}
                            >
                                {savingRetention ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {categories.map(cat => {
                const catSchedules = (schedules as ScheduleEntry[]).filter(s => s.category === cat)
                if (!catSchedules.length) return null
                return (
                    <div key={cat}>
                        <div className="flex items-center gap-2 mb-4">
                            <h3 className="font-semibold text-sm">{CATEGORY_LABELS[cat]}</h3>
                            <div className="flex-1 h-px bg-border/50" />
                        </div>
                        <div className="space-y-3">
                            {catSchedules.map(s => (
                                <div key={s.id} className="glass-card p-4">
                                    <div className="flex items-start gap-4">
                                        {/* Enable/Disable toggle */}
                                        <button
                                            className={`mt-0.5 flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 relative ${s.enabled ? 'bg-accent' : 'bg-muted/60 hover:bg-muted'}`}
                                            onClick={() => handleToggle(s)}
                                            aria-label={s.enabled ? 'Disable' : 'Enable'}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${s.enabled ? 'translate-x-5' : ''}`} />
                                        </button>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-3 mb-1">
                                                <span className={`font-medium text-sm ${s.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                                                <button
                                                    className="btn-ghost text-xs py-1 px-2.5 gap-1 flex-shrink-0"
                                                    disabled={running[s.id] || (s.supports_target_scope && (s.target_scope ?? 'remaining') === 'one' && !s.knowledge_id)}
                                                    onClick={() => handleRunNow(s)}
                                                >
                                                    {running[s.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                                    Run now
                                                </button>
                                            </div>
                                            <p className="text-xs text-muted-foreground mb-2">{s.description}</p>

                                            <div className="flex items-center gap-3 flex-wrap">
                                                <select
                                                    className="input text-xs py-1 pr-7 w-auto"
                                                    value={s.interval_hours}
                                                    disabled={!s.enabled}
                                                    onChange={e => handleInterval(s, parseInt(e.target.value))}
                                                >
                                                    {INTERVAL_OPTS.map(o => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </select>

                                                {s.last_run && (
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        Last: {new Date(s.last_run).toLocaleString()}
                                                    </span>
                                                )}

                                                {s.supports_target_scope && (
                                                    <select
                                                        className="input text-xs py-1 pr-7 w-auto"
                                                        value={s.target_scope ?? 'remaining'}
                                                        disabled={!s.enabled}
                                                        onChange={e => handleTargetScope(s, e.target.value as 'one' | 'remaining' | 'all')}
                                                    >
                                                        {TARGET_SCOPE_OPTS.map(o => (
                                                            <option key={o.value} value={o.value}>{o.label}</option>
                                                        ))}
                                                    </select>
                                                )}

                                                {s.supports_target_scope && (s.target_scope ?? 'remaining') === 'one' && (
                                                    <input
                                                        className="input h-8 w-64 text-xs"
                                                        placeholder="Knowledge ID for one-target runs"
                                                        defaultValue={s.knowledge_id ?? ''}
                                                        onBlur={e => { void handleKnowledgeTarget(s, e.target.value) }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ── Audit Tab ─────────────────────────────────────────────────────────────────
interface TaskLogEntry {
    id: string
    task_type: string
    status: string
    workspace_id: string | null
    started_at: string
    finished_at: string | null
    duration_ms: number | null
    item_count: number | null
    error_message: string | null
    target_link: string | null
}

const TASK_LABELS: Record<string, string> = {
    embed_notes: 'Embed Knowledge',
    generate_knowledge_intelligence: 'Generate Knowledge Intelligence',
    extract_bookmark_content: 'Extract Bookmark Content',
    generate_titles: 'Generate Titles',
    extract_insights: 'Extract Insights',
    scrape_bookmarks: 'Scrape Bookmarks',
    cleanup_embeddings: 'Clean Up Embeddings',
    purge_chat_trash: 'Purge Chat Trash',
    summarize_note: 'Summarize Knowledge',
    extract_note_insights: 'Extract Knowledge Insights',
    generate_note_title: 'Generate Knowledge Title',
}

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'unknown'
type ContainerLogLine = { id: number; container: string; data: string; level: LogLevel }

const ANSI_ESCAPE_REGEX = /\x1B\[[0-9;]*[mK]/g
const stripAnsiCodes = (value: string) => value.replace(ANSI_ESCAPE_REGEX, '')

const getLogLevel = (value: string): LogLevel => {
    const text = stripAnsiCodes(value).toLowerCase()
    if (/(^|\b)(panic|fatal|error|err|exception|traceback)(\b|:)/.test(text)) return 'error'
    if (/(^|\b)(warn|warning)(\b|:)/.test(text)) return 'warn'
    if (/(^|\b)(debug)(\b|:)/.test(text)) return 'debug'
    if (/(^|\b)(trace)(\b|:)/.test(text)) return 'trace'
    if (/(^|\b)(info|notice)(\b|:)/.test(text)) return 'info'
    return 'unknown'
}

const LOG_LEVEL_OPTIONS: Array<{ value: 'all' | LogLevel; label: string }> = [
    { value: 'all', label: 'All levels' },
    { value: 'error', label: 'Error' },
    { value: 'warn', label: 'Warn' },
    { value: 'info', label: 'Info' },
    { value: 'debug', label: 'Debug' },
    { value: 'trace', label: 'Trace' },
    { value: 'unknown', label: 'Unknown' },
]

const LOG_LEVEL_CLASS: Record<LogLevel, string> = {
    error: 'bg-red-500/15 border-red-400/30 text-red-300',
    warn: 'bg-amber-500/15 border-amber-300/35 text-amber-200',
    info: 'bg-blue-500/15 border-blue-300/35 text-blue-200',
    debug: 'bg-cyan-500/15 border-cyan-300/35 text-cyan-200',
    trace: 'bg-purple-500/15 border-purple-300/35 text-purple-200',
    unknown: 'bg-muted/60 border-border/60 text-muted-foreground',
}

function StatusIcon({ status }: { status: string }) {
    if (status === 'running') return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
    if (status === 'done') return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
    if (status === 'failed') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
    return <Circle className="w-3.5 h-3.5 text-muted-foreground" />
}

function AuditTab({ workspaceId }: { workspaceId: string }) {
    const [subTab, setSubTab] = useState<'history' | 'logs'>('history')

    return (
        <div className={subTab === 'logs' ? 'h-full min-h-0 flex flex-col gap-6' : 'space-y-6'}>
            <div className="flex gap-2 p-1.5 glass-card w-full sm:w-fit rounded-xl overflow-x-auto">
                <button
                    onClick={() => setSubTab('history')}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 whitespace-nowrap ${subTab === 'history'
                        ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                >
                    <History className="w-4 h-4" /> Job History
                </button>
                <button
                    onClick={() => setSubTab('logs')}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 whitespace-nowrap ${subTab === 'logs'
                        ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                >
                    <Terminal className="w-4 h-4" /> Container Logs
                </button>
            </div>

            {subTab === 'history' ? (
                <JobHistorySubTab />
            ) : (
                <div className="min-h-0 flex-1">
                    <ContainerLogsSubTab workspaceId={workspaceId} />
                </div>
            )}
        </div>
    )
}

function JobHistorySubTab() {
    const [filterType, setFilterType] = useState('')
    const { data: history = [], isLoading, refetch } = useQuery<TaskLogEntry[]>({
        queryKey: ['task-history', filterType],
        queryFn: () => getTaskHistory({ task_type: filterType || undefined, limit: 100 }),
        refetchInterval: (query) => {
            const d = query.state.data as TaskLogEntry[] | undefined
            const active = d?.some(l => l.status === 'running')
            return active ? 5000 : false
        },
    })

    const formatDuration = (ms: number | null) => {
        if (!ms) return '—'
        if (ms < 1000) return `${ms}ms`
        return `${(ms / 1000).toFixed(1)}s`
    }
    const isExternalTarget = (value: string) => /^https?:\/\//i.test(value)

    return (
        <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">Background Task Executions</h3>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        className="input text-xs py-1.5 pr-7 w-auto"
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                    >
                        <option value="">All tasks</option>
                        {Object.entries(TASK_LABELS).map(([id, label]) => (
                            <option key={id} value={id}>{label}</option>
                        ))}
                    </select>
                    <button
                        className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5"
                        onClick={() => refetch()}
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                </div>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {!isLoading && (history as TaskLogEntry[]).length === 0 && (
                <div className="text-center py-14 text-muted-foreground glass-card rounded-xl">
                    <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No task history yet. Run a task to see it here.</p>
                </div>
            )}

            {!isLoading && (history as TaskLogEntry[]).length > 0 && (
                <div className="space-y-2">
                    {(history as TaskLogEntry[]).map(log => (
                        <div key={log.id} className="glass-card px-4 py-3 flex items-start gap-3 rounded-xl border-border/50">
                            <StatusIcon status={log.status} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium">{TASK_LABELS[log.task_type] ?? log.task_type}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${log.status === 'done' ? 'bg-emerald-500/10 text-emerald-400' :
                                        log.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                                            log.status === 'running' ? 'bg-blue-500/10 text-blue-400' :
                                                'bg-muted text-muted-foreground'
                                        }`}>
                                        {log.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                                    <span>{new Date(log.started_at).toLocaleString()}</span>
                                    {log.duration_ms !== null && <span>Duration: {formatDuration(log.duration_ms)}</span>}
                                    {log.item_count !== null && <span>{log.item_count} items</span>}
                                </div>
                                {log.target_link && (
                                    <div className="mt-1 text-[10px] text-muted-foreground">
                                        <span className="mr-1">Target:</span>
                                        <a
                                            href={log.target_link}
                                            target={isExternalTarget(log.target_link) ? '_blank' : undefined}
                                            rel={isExternalTarget(log.target_link) ? 'noreferrer' : undefined}
                                            className="text-accent hover:underline break-all"
                                            title={log.target_link}
                                        >
                                            {log.target_link}
                                        </a>
                                    </div>
                                )}
                                {log.error_message && (
                                    <p className="text-[10px] text-red-400 mt-1 font-mono truncate" title={log.error_message}>
                                        {log.error_message}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function ContainerLogsSubTab({ workspaceId }: { workspaceId: string }) {
    const { send, on, isConnected } = useWorkspaceWebSocket(workspaceId)
    // Use a ref to keep track of logs without triggering deep rerenders constantly if possible,
    // though state is fine for this UI size.
    const [logs, setLogs] = useState<ContainerLogLine[]>([])
    const [filter, setFilter] = useState('')
    const [levelFilter, setLevelFilter] = useState<'all' | LogLevel>('all')
    const [containerFilter, setContainerFilter] = useState<string>('all')
    const [paused, setPaused] = useState(false)
    const logsEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!isConnected) return
        send({ type: 'stream_logs' })

        const offLog = on('container_log', (msg: any) => {
            setLogs(prev => {
                if (paused) return prev
                const normalizedData = String(msg.data ?? '')
                const newLogs = [...prev, {
                    id: Date.now() + Math.random(),
                    container: String(msg.container ?? 'Unknown'),
                    data: normalizedData,
                    level: getLogLevel(normalizedData),
                }]
                return newLogs.slice(-1000) // Keep last 1000 lines
            })
        })

        const offErr = on('container_log_error', (msg: any) => {
            setLogs(prev => [...prev, {
                id: Date.now(),
                container: 'System',
                data: String(msg.detail ?? 'Unknown log stream error'),
                level: 'error',
            }])
        })

        return () => {
            offLog()
            offErr()
            send({ type: 'stop_logs' })
        }
    }, [isConnected, send, on, paused])

    useEffect(() => {
        if (!paused) {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [logs, paused])

    const containerOptions = useMemo(() => {
        return Array.from(new Set(logs.map(log => log.container))).sort((a, b) => a.localeCompare(b))
    }, [logs])

    useEffect(() => {
        if (containerFilter === 'all') return
        if (!containerOptions.includes(containerFilter)) {
            setContainerFilter('all')
        }
    }, [containerFilter, containerOptions])

    const filteredLogs = useMemo(() => {
        const normalizedFilter = filter.trim().toLowerCase()
        return logs.filter(log => {
            const matchesLevel = levelFilter === 'all' || log.level === levelFilter
            if (!matchesLevel) return false
            const matchesContainer = containerFilter === 'all' || log.container === containerFilter
            if (!matchesContainer) return false
            if (!normalizedFilter) return true
            return (
                log.container.toLowerCase().includes(normalizedFilter) ||
                stripAnsiCodes(log.data).toLowerCase().includes(normalizedFilter)
            )
        })
    }, [logs, filter, levelFilter, containerFilter])

    return (
        <div className="animate-fade-in flex h-full min-h-0 flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">Real-time Stack Logs</h3>
                    {!isConnected && <span className="text-xs text-amber-400 animate-pulse">(Connecting...)</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    <select
                        className="input text-xs py-1.5 pr-7 w-auto"
                        value={levelFilter}
                        onChange={e => setLevelFilter(e.target.value as 'all' | LogLevel)}
                        aria-label="Filter log level"
                    >
                        {LOG_LEVEL_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <select
                        className="input text-xs py-1.5 pr-7 min-w-[170px]"
                        value={containerFilter}
                        onChange={e => setContainerFilter(e.target.value)}
                        aria-label="Filter container name"
                    >
                        <option value="all">All containers</option>
                        {containerOptions.map(container => (
                            <option key={container} value={container}>
                                {container}
                            </option>
                        ))}
                    </select>
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search logs..."
                            className="input text-xs py-1.5 pl-8 pr-3 w-40"
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                        />
                    </div>
                    <button
                        className={`btn-ghost text-xs py-1.5 px-2.5 gap-1.5 ${paused ? 'text-accent bg-accent/10' : ''}`}
                        onClick={() => setPaused(p => !p)}
                    >
                        {paused ? <Play className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                        {paused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                        className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        onClick={() => setLogs([])}
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Clear
                    </button>
                </div>
            </div>

            <div className="min-h-0 flex-1 glass-card border border-border/50 rounded-xl overflow-y-auto p-4 font-mono text-xs bg-black/40 text-gray-300 flex flex-col gap-1 relative">
                {filteredLogs.length === 0 ? (
                    <div className="m-auto text-muted-foreground opacity-50 flex items-center gap-2">
                        {isConnected ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Waiting for logs...</span>
                            </>
                        ) : (
                            <span>WebSocket not connected.</span>
                        )}
                    </div>
                ) : (
                    filteredLogs.map(log => {
                        const rawText = stripAnsiCodes(log.data)
                        // Determine container color somewhat deterministically
                        const hash = Array.from(log.container).reduce((acc, char) => acc + char.charCodeAt(0), 0)
                        const colors = ['text-emerald-400', 'text-blue-400', 'text-orange-400', 'text-purple-400', 'text-pink-400', 'text-cyan-400']
                        const colorClass = colors[hash % colors.length]

                        return (
                            <div key={log.id} className="flex items-start gap-2 hover:bg-white/5 px-1 py-0.5 rounded">
                                <span className={`w-16 flex-shrink-0 text-[10px] leading-5 uppercase tracking-wide px-2 py-0.5 rounded-full border text-center ${LOG_LEVEL_CLASS[log.level]}`}>
                                    {log.level}
                                </span>
                                <span className={`w-32 flex-shrink-0 truncate font-semibold opacity-90 leading-5 ${colorClass}`}>
                                    [{log.container}]
                                </span>
                                <span className="flex-1 break-all whitespace-pre-wrap leading-5">{rawText}</span>
                            </div>
                        )
                    })
                )}
                <div ref={logsEndRef} />
            </div>
        </div>
    )
}
