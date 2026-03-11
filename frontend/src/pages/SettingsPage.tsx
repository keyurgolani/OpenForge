import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
    listProviders, createProvider, updateProvider, deleteProvider,
    testConnection, listModels, setDefaultProvider,
    listWorkspaces, updateWorkspace, createWorkspace, deleteWorkspace,
    listPrompts, updatePrompt,
    listSchedules, updateSchedule, runTaskNow, getTaskHistory, getToolCallLogs, listSettings, updateSetting,
    listInstalledSkills, installSkill, searchSkills, removeSkill, getToolRegistry,
    listMCPServers, createMCPServer, updateMCPServer, deleteMCPServer, discoverMCPServer,
    updateMCPToolOverride, exportAllData, exportWorkspaceData,
    checkAuth, logoutAuth,
    listToolPermissions, setToolPermission,
    listPendingHITL, getHITLHistory, approveHITL, denyHITL,
    listWhisperModels, downloadWhisperModel, deleteWhisperModel,
    listEmbeddingModelStatus, downloadEmbeddingModel, deleteEmbeddingModel,
    listCLIPModels, downloadCLIPModel, deleteCLIPModel, getCLIPDefault, setCLIPDefault,
    listMarkerModels, downloadMarkerModel, deleteMarkerModel,
} from '@/lib/api'
import {
    Globe2, Loader2, Trash2, CheckCircle2, XCircle, Star, Plus,
    ChevronDown, ChevronUp, ChevronRight, Eye, EyeOff, RefreshCw, Zap, Server, Search, Check,
    GitBranch,
    Layers, Bot, FolderOpen, Pencil, Save, X, Sliders, RotateCcw, MessageSquare,
    FileText, Timer, History, Play, Clock, CheckCircle, AlertCircle, Circle, Terminal,
    Brain, Folder, Briefcase, Microscope, BookOpen, Target, Globe, Lightbulb, Wrench,
    Palette, BarChart3, Rocket, Shield, FlaskConical, Leaf, Key, Settings2, PenLine,
    Database, Sprout, Download, Archive, FileArchive, Mic, ShieldAlert, LogOut, ScanEye
} from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'
import { ModelOverrideSelect } from '@/components/shared/ModelOverrideSelect'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { isLocalProvider, sanitizeProviderDisplayName } from '@/lib/provider-display'

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
    ollama: { name: 'Ollama', color: 'bg-lime-500/10 border-lime-500/20 text-lime-300', needsKey: false, needsUrl: true, placeholder: 'Token (optional)', urlPlaceholder: 'http://localhost:11434' },
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

type SettingsTab = 'workspaces' | 'llm' | 'prompts' | 'jobs' | 'skills' | 'tools' | 'mcp' | 'hitl' | 'audit' | 'export'
const SETTINGS_TABS: SettingsTab[] = ['workspaces', 'llm', 'prompts', 'jobs', 'skills', 'tools', 'mcp', 'hitl', 'audit', 'export']
const toSettingsTab = (value: string | null): SettingsTab => {
    const normalized = value === 'schedules' ? 'jobs' : value
    return SETTINGS_TABS.includes(normalized as SettingsTab) ? (normalized as SettingsTab) : 'workspaces'
}

// ── Root component ────────────────────────────────────────────────────────────
export default function SettingsPage() {
    const [searchParams, setSearchParams] = useSearchParams()
    const queryTab = searchParams.get('tab')
    const newWorkspaceRequested = searchParams.get('newWorkspace') === '1'
    const [activeTab, setActiveTab] = useState<SettingsTab>(() => toSettingsTab(queryTab))
    const [authEnabled, setAuthEnabled] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)

    useEffect(() => {
        const nextTab = toSettingsTab(queryTab)
        setActiveTab(prev => (prev === nextTab ? prev : nextTab))
    }, [queryTab])

    useEffect(() => {
        if (!newWorkspaceRequested) return
        setActiveTab('workspaces')
    }, [newWorkspaceRequested])

    useEffect(() => {
        checkAuth().then(d => setAuthEnabled(d.auth_enabled)).catch(() => {})
    }, [])

    const handleLogout = useCallback(async () => {
        setLoggingOut(true)
        try {
            await logoutAuth()
            window.dispatchEvent(new Event('openforge:unauthorized'))
        } finally {
            setLoggingOut(false)
        }
    }, [])

    const TABS = [
        { id: 'workspaces' as const, label: 'Workspaces', Icon: FolderOpen },
        { id: 'llm' as const, label: 'AI Models', Icon: Bot },
        { id: 'prompts' as const, label: 'Prompts', Icon: Sliders },
        { id: 'jobs' as const, label: 'Jobs', Icon: Timer },
        { id: 'skills' as const, label: 'Skills', Icon: Wrench },
        { id: 'tools' as const, label: 'Native Tools', Icon: Settings2 },
        { id: 'mcp' as const, label: 'MCP', Icon: Layers },
        { id: 'hitl' as const, label: 'HITL', Icon: ShieldAlert },
        { id: 'audit' as const, label: 'Audit', Icon: History },
        { id: 'export' as const, label: 'Export', Icon: Download },
    ]

    return (
        <div className="w-full h-full min-h-0 p-6 lg:p-8 flex flex-col">
            {/* Tabs + logout */}
            <div className="flex shrink-0 items-start gap-3 mb-8">
            <div className="flex shrink-0 gap-2 p-1.5 glass-card w-full sm:w-fit rounded-2xl overflow-x-auto min-h-[52px]">
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
            {authEnabled && (
                <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    title="Sign out"
                    className="flex shrink-0 items-center gap-2 h-[52px] px-4 rounded-2xl glass-card text-sm text-muted-foreground hover:text-red-400 hover:border-red-500/20 transition-all disabled:opacity-50"
                >
                    {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                    <span className="hidden sm:inline">Sign out</span>
                </button>
            )}
            </div>

            {activeTab === 'workspaces' && (
                <WorkspacesSettings
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
            {activeTab === 'jobs' && <JobsTab />}
            {activeTab === 'skills' && <SkillsTab />}
            {activeTab === 'tools' && <ToolsTab />}
            {activeTab === 'mcp' && <MCPTab />}
            {activeTab === 'hitl' && <HITLDashboardTab />}
            {activeTab === 'audit' && (
                <div className="min-h-0 flex-1">
                    <AuditTab />
                </div>
            )}
            {activeTab === 'export' && <ExportTab />}
        </div>
    )
}

// ── Workspaces Tab ────────────────────────────────────────────────────────────
type WorkspaceRow = {
    id: string; name: string; description: string | null
    icon: string | null; color: string | null
    llm_provider_id: string | null; llm_model: string | null
    knowledge_intelligence_provider_id: string | null; knowledge_intelligence_model: string | null
    vision_provider_id: string | null; vision_model: string | null
    knowledge_count: number
    conversation_count: number
    agent_enabled: boolean
    agent_tool_categories: string[]
    agent_max_tool_loops: number
}

function WorkspacesSettings({
    openCreateRequested,
    onCreateRequestConsumed,
}: {
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
                    onDeleted={() => qc.invalidateQueries({ queryKey: ['workspaces'] })}
                    onSaved={() => qc.invalidateQueries({ queryKey: ['workspaces'] })}
                />
            ))}
        </div>
    )
}

type ProviderRow = { id: string; display_name: string; provider_name: string; default_model: string | null; is_system_default: boolean; has_api_key: boolean; base_url: string | null; enabled_models: { id: string; name: string }[] }

function WorkspaceCard({ workspace: ws, providers, onDeleted, onSaved }: {
    workspace: WorkspaceRow
    providers: ProviderRow[]
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
    const [kiProviderId, setKiProviderId] = useState(ws.knowledge_intelligence_provider_id ?? '')
    const [kiModel, setKiModel] = useState(ws.knowledge_intelligence_model ?? '')
    const [visionProviderId, setVisionProviderId] = useState(ws.vision_provider_id ?? '')
    const [visionModel, setVisionModel] = useState(ws.vision_model ?? '')
    const [agentEnabled, setAgentEnabled] = useState(ws.agent_enabled ?? false)
    const [agentToolCategories, setAgentToolCategories] = useState<string[]>(ws.agent_tool_categories ?? [])
    const [agentMaxToolLoops, setAgentMaxToolLoops] = useState(ws.agent_max_tool_loops ?? 20)
    const [saving, setSaving] = useState(false)

    const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })

    // Build combined model lists from per-type system configs
    const chatModels = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === 'system_chat_models')?.value
        if (!Array.isArray(raw)) return []
        return (raw as { provider_id: string; model_id: string; model_name: string }[]).map(m => {
            const p = providers.find(pr => pr.id === m.provider_id)
            return { value: `${m.provider_id}:${m.model_id}`, label: `${p ? sanitizeProviderDisplayName(p.display_name) : 'Unknown'} / ${m.model_name}`, provider_id: m.provider_id, model_id: m.model_id }
        })
    }, [settings, providers])

    const visionModels = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === 'system_vision_models')?.value
        if (!Array.isArray(raw)) return []
        return (raw as { provider_id: string; model_id: string; model_name: string }[]).map(m => {
            const p = providers.find(pr => pr.id === m.provider_id)
            return { value: `${m.provider_id}:${m.model_id}`, label: `${p ? sanitizeProviderDisplayName(p.display_name) : 'Unknown'} / ${m.model_name}`, provider_id: m.provider_id, model_id: m.model_id }
        })
    }, [settings, providers])

    // Combined chat value for select
    const chatSelectValue = providerId && model ? `${providerId}:${model}` : ''
    const kiSelectValue = kiProviderId && kiModel ? `${kiProviderId}:${kiModel}` : ''
    const visionSelectValue = visionProviderId && visionModel ? `${visionProviderId}:${visionModel}` : ''

    const handleChatModelSelect = (val: string) => {
        if (!val) { setProviderId(''); setModel(''); return }
        const [pid, ...rest] = val.split(':')
        setProviderId(pid); setModel(rest.join(':'))
    }
    const handleKiModelSelect = (val: string) => {
        if (!val) { setKiProviderId(''); setKiModel(''); return }
        const [pid, ...rest] = val.split(':')
        setKiProviderId(pid); setKiModel(rest.join(':'))
    }
    const handleVisionModelSelect = (val: string) => {
        if (!val) { setVisionProviderId(''); setVisionModel(''); return }
        const [pid, ...rest] = val.split(':')
        setVisionProviderId(pid); setVisionModel(rest.join(':'))
    }

    const { data: toolRegistryData } = useQuery({
        queryKey: ['tool-registry'],
        queryFn: getToolRegistry,
        enabled: agentEnabled,
        staleTime: 60_000,
    })
    const availableToolCategories = useMemo(() => {
        const tools: any[] = toolRegistryData?.tools ?? []
        if (!Array.isArray(tools)) return []
        const cats = Array.from(new Set(
            tools
                .map((t: any) => t.category as string)
                .filter((c: string) => c && c !== 'agent')
        )).sort() as string[]
        return cats
    }, [toolRegistryData])
    const DANGEROUS_CATEGORIES = new Set(['shell', 'git'])
    const [saved, setSaved] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

    // (provider lookups now happen via per-type model config in chatModels/visionModels)

    const handleSave = async () => {
        setSaving(true)
        await updateWorkspace(ws.id, {
            name: name.trim(),
            description: description || null,
            icon: icon || null,
            llm_provider_id: providerId || null,
            llm_model: model || null,
            knowledge_intelligence_provider_id: kiProviderId || null,
            knowledge_intelligence_model: kiModel || null,
            vision_provider_id: visionProviderId || null,
            vision_model: visionModel || null,
            agent_enabled: agentEnabled,
            agent_tool_categories: agentToolCategories,
            agent_max_tool_loops: agentMaxToolLoops,
        })
        setSaving(false); setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        onSaved()
    }

    const handleDelete = () => setDeleteConfirmOpen(true)

    const confirmDelete = async () => {
        setDeleteConfirmOpen(false)
        setDeleting(true)
        await deleteWorkspace(ws.id)
        onDeleted()
    }

    return (
        <div className="glass-card-hover transition-all duration-300">
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
                        <span className="text-xs text-muted-foreground">{ws.knowledge_count} knowledge · {ws.conversation_count} chats</span>
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

                    <div className="border-t border-border/40 pt-3 space-y-3">
                        <p className="text-xs font-medium text-muted-foreground">AI Models <span className="text-xs font-normal opacity-60">(override global defaults per category for this workspace)</span></p>

                        {chatModels.length === 0 && visionModels.length === 0 && (
                            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                <span>No models configured yet. Go to <strong>AI Models</strong> → <strong>Chat</strong> / <strong>Vision</strong> tabs to add models first.</span>
                            </div>
                        )}

                        {/* Workspace Agent */}
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                                <Bot className="w-3 h-3 text-accent" />
                                <p className="text-xs font-medium">Chat Model</p>
                                <span className="text-[10px] text-muted-foreground opacity-70">Used for chat and agent tool calls</span>
                            </div>
                            <select className="input text-sm" value={chatSelectValue} onChange={e => handleChatModelSelect(e.target.value)}>
                                <option value="">Use system default</option>
                                {chatModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        {/* Knowledge Intelligence */}
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                                <Brain className="w-3 h-3 text-violet-400" />
                                <p className="text-xs font-medium">Knowledge Intelligence</p>
                                <span className="text-[10px] text-muted-foreground opacity-70">Used for knowledge extraction and processing</span>
                            </div>
                            <select className="input text-sm" value={kiSelectValue} onChange={e => handleKiModelSelect(e.target.value)}>
                                <option value="">Use system default</option>
                                {chatModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        {/* Visual Model */}
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                                <Eye className="w-3 h-3 text-sky-400" />
                                <p className="text-xs font-medium">Vision Model</p>
                                <span className="text-[10px] text-muted-foreground opacity-70">Used for image and visual content extraction</span>
                            </div>
                            <select className="input text-sm" value={visionSelectValue} onChange={e => handleVisionModelSelect(e.target.value)}>
                                <option value="">Use system default</option>
                                {visionModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="border-t border-border/40 pt-3 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium">Agent Mode</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Enable tool use for this workspace's chat.</p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={agentEnabled}
                                onClick={() => setAgentEnabled(v => !v)}
                                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${agentEnabled ? 'bg-accent' : 'bg-muted'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${agentEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {agentEnabled && (
                            <>
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">
                                        Enabled tool categories:
                                        {!toolRegistryData && <span className="ml-2 text-muted-foreground/50 italic">loading…</span>}
                                    </p>
                                    {availableToolCategories.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                            {availableToolCategories.map(cat => {
                                                const checked = agentToolCategories.includes(cat)
                                                const isDangerous = DANGEROUS_CATEGORIES.has(cat)
                                                return (
                                                    <label
                                                        key={cat}
                                                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${checked ? 'border-accent/40 bg-accent/10 text-foreground' : 'border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40'}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="sr-only"
                                                            checked={checked}
                                                            onChange={() => setAgentToolCategories(prev =>
                                                                checked ? prev.filter(c => c !== cat) : [...prev, cat]
                                                            )}
                                                        />
                                                        <span className={`h-3.5 w-3.5 flex-shrink-0 rounded border ${checked ? 'border-accent bg-accent' : 'border-border'} flex items-center justify-center`}>
                                                            {checked && <Check className="h-2.5 w-2.5 text-accent-foreground" />}
                                                        </span>
                                                        <span className="capitalize">{cat}</span>
                                                        {isDangerous && <Shield className="h-3 w-3 text-amber-400 flex-shrink-0" aria-label="Elevated risk" />}
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    ) : toolRegistryData ? (
                                        <p className="text-xs text-muted-foreground/60 italic">No tool categories available.</p>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                            {[...Array(6)].map((_, i) => (
                                                <div key={i} className="h-9 rounded-lg border border-border/40 bg-muted/20 skeleton" />
                                            ))}
                                        </div>
                                    )}
                                    {agentToolCategories.some(c => DANGEROUS_CATEGORIES.has(c)) && (
                                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                                            <Shield className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                            <span>Shell and Git tools can execute arbitrary commands in the workspace. Only enable if you trust the workspace content.</span>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-1.5 pt-1">
                                    <p className="text-xs text-muted-foreground">Max tool loop iterations:</p>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="number"
                                            min={1}
                                            max={100}
                                            value={agentMaxToolLoops}
                                            onChange={e => setAgentMaxToolLoops(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                                            className="input w-20 text-sm"
                                        />
                                        <span className="text-xs text-muted-foreground">Maximum number of tool calls the agent can make per response before being forced to summarize.</span>
                                    </div>
                                </div>
                            </>
                        )}
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
            <ConfirmModal
                open={deleteConfirmOpen}
                title={`Delete "${ws.name}"?`}
                message="This will permanently delete the workspace, all its knowledge, and all chat history. This action cannot be undone."
                confirmLabel="Delete Workspace"
                variant="danger"
                loading={deleting}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteConfirmOpen(false)}
            />
        </div>
    )
}

// ── LLM Settings Tab ──────────────────────────────────────────────────────────
type LLMSubTab = 'providers' | 'chat' | 'vision' | 'embedding' | 'audio' | 'clip' | 'pdf'

function LLMSettings() {
    const [subTab, setSubTab] = useState<LLMSubTab>('providers')

    const LLM_SUB_TABS: { id: LLMSubTab; label: string; Icon: React.ElementType }[] = [
        { id: 'providers', label: 'Providers', Icon: Server },
        { id: 'chat', label: 'Reasoning', Icon: MessageSquare },
        { id: 'vision', label: 'Vision', Icon: Eye },
        { id: 'embedding', label: 'Embedding', Icon: Database },
        { id: 'audio', label: 'Audio', Icon: Zap },
        { id: 'clip', label: 'CLIP', Icon: ScanEye },
        { id: 'pdf', label: 'PDF', Icon: FileText },
    ]

    return (
        <div className="space-y-4">
            <div className="flex gap-1.5 p-1 glass-card w-fit rounded-xl">
                {LLM_SUB_TABS.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        onClick={() => setSubTab(id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${subTab === id
                            ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
            </div>

            {subTab === 'providers' && <ProvidersTab />}
            {subTab === 'chat' && <ModelTypeTab configType="chat" title="Reasoning Models" description="Models used for reasoning and chat conversations. Configure the models available and set the system default." Icon={MessageSquare} />}
            {subTab === 'vision' && <ModelTypeTab configType="vision" title="Vision Models" description="Models used for image analysis and visual content extraction. Must support multimodal input." Icon={Eye} />}
            {subTab === 'embedding' && <EmbeddingTab />}
            {subTab === 'audio' && <AudioTab />}
            {subTab === 'clip' && <CLIPTab />}
            {subTab === 'pdf' && <PDFProcessingTab />}
        </div>
    )
}

// ── Providers Tab ─────────────────────────────────────────────────────────────
function ProvidersTab() {
    const qc = useQueryClient()
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const [expanded, setExpanded] = useState<string | null>(null)
    const [showAdd, setShowAdd] = useState(false)

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-sm">AI Models</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Configure provider credentials and endpoints. After adding a provider, assign models to Reasoning, Vision, Embedding, or Audio tabs.
                    </p>
                </div>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                    <Plus className="w-3.5 h-3.5" /> {showAdd ? 'Close' : 'Add Provider'}
                </button>
            </div>

            {showAdd && (
                <AddProviderPanel onAdded={() => { qc.invalidateQueries({ queryKey: ['providers'] }); setShowAdd(false) }} />
            )}

            {(providers as ProviderRow[]).map(p => (
                <ProviderCard
                    key={p.id}
                    provider={p}
                    expanded={expanded === p.id}
                    onToggle={() => setExpanded(prev => prev === p.id ? null : p.id)}
                    onDelete={() => deleteProvider(p.id).then(() => qc.invalidateQueries({ queryKey: ['providers'] }))}
                />
            ))}

            {(providers as unknown[]).length === 0 && !showAdd && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                    <Server className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>No AI providers configured yet.</p>
                    <p className="text-xs mt-1 opacity-70">Add your first provider to start configuring models.</p>
                </div>
            )}
        </div>
    )
}

// ── Shared type for model items in per-type configs ────────────────────────────
interface TypedModel { provider_id: string; model_id: string; model_name: string; is_default?: boolean }

// ── Model Type Tab (Chat / Vision) ─────────────────────────────────────────────
function ModelTypeTab({
    configType,
    title,
    description,
    Icon,
}: {
    configType: 'chat' | 'vision'
    title: string
    description: string
    Icon: React.ElementType
}) {
    const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const qc = useQueryClient()

    const configKey = `system_${configType}_models`
    const configuredModels: TypedModel[] = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === configKey)?.value
        return Array.isArray(raw) ? (raw as TypedModel[]) : []
    }, [settings, configKey])

    // Form state for adding a model
    const [showAdd, setShowAdd] = useState(false)
    const [addProviderId, setAddProviderId] = useState('')
    const [fetchedModels, setFetchedModels] = useState<{ id: string; name: string }[] | null>(null)
    const [fetchingModels, setFetchingModels] = useState(false)
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [modelSearch, setModelSearch] = useState('')
    const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
    const [manualModel, setManualModel] = useState('')
    const [saving, setSaving] = useState(false)
    const [removing, setRemoving] = useState<string | null>(null)

    const filteredFetchedModels = useMemo(() => {
        if (!fetchedModels) return []
        const q = modelSearch.toLowerCase()
        return q ? fetchedModels.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : fetchedModels
    }, [fetchedModels, modelSearch])

    const handleFetchModels = async () => {
        if (!addProviderId) return
        setFetchingModels(true); setFetchError(null); setFetchedModels(null)
        setSelectedModels(new Set()); setModelSearch('')
        try {
            const models = await listModels(addProviderId)
            setFetchedModels(models)
            if (models.length <= 10) setSelectedModels(new Set(models.map((m: { id: string }) => m.id)))
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setFetchError(err?.response?.data?.detail ?? err?.message ?? 'Failed to fetch models')
        } finally { setFetchingModels(false) }
    }

    const handleAddModels = async () => {
        const modelsToAdd = fetchedModels
            ? [...selectedModels].map(id => {
                const label = fetchedModels.find(m => m.id === id)?.name ?? id
                return { provider_id: addProviderId, model_id: id, model_name: label }
            })
            : manualModel.trim()
                ? [{ provider_id: addProviderId, model_id: manualModel.trim(), model_name: manualModel.trim() }]
                : []
        if (!modelsToAdd.length) return
        setSaving(true)
        try {
            // Merge with existing, dedup by model_id+provider_id
            const existing = configuredModels.filter(
                m => !modelsToAdd.some(n => n.provider_id === m.provider_id && n.model_id === m.model_id)
            )
            const updated = [...existing, ...modelsToAdd]
            await updateSetting(configKey, { value: updated, category: 'llm' })
            qc.invalidateQueries({ queryKey: ['settings'] })
            setShowAdd(false)
            setAddProviderId(''); setFetchedModels(null); setSelectedModels(new Set()); setManualModel('')
        } finally { setSaving(false) }
    }

    const handleRemove = async (m: TypedModel) => {
        const key = `${m.provider_id}:${m.model_id}`
        setRemoving(key)
        try {
            const updated = configuredModels.filter(x => !(x.provider_id === m.provider_id && x.model_id === m.model_id))
            await updateSetting(configKey, { value: updated, category: 'llm' })
            qc.invalidateQueries({ queryKey: ['settings'] })
        } finally { setRemoving(null) }
    }

    const handleSetDefault = async (m: TypedModel) => {
        const updated = configuredModels.map(x => ({
            ...x,
            is_default: x.provider_id === m.provider_id && x.model_id === m.model_id,
        }))
        await updateSetting(configKey, { value: updated, category: 'llm' })
        qc.invalidateQueries({ queryKey: ['settings'] })
    }

    const getProviderDisplay = (pid: string) => {
        const p = (providers as ProviderRow[]).find(x => x.id === pid)
        return p ? sanitizeProviderDisplayName(p.display_name) : pid.slice(0, 8)
    }

    const totalSelected = fetchedModels ? selectedModels.size : (manualModel.trim() ? 1 : 0)

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-sm">{title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                    <Plus className="w-3.5 h-3.5" /> {showAdd ? 'Close' : 'Add Model'}
                </button>
            </div>

            {/* Add model form */}
            {showAdd && (
                <div className="glass-card p-4 space-y-4 border border-accent/20 animate-fade-in">
                    <h4 className="text-xs font-medium text-accent uppercase tracking-wide">Add Models</h4>

                    {(providers as unknown[]).length === 0 ? (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>No providers configured. Go to the <strong>Providers</strong> tab to add one first.</span>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground font-medium">1. Select provider</label>
                                <select
                                    className="input text-sm"
                                    value={addProviderId}
                                    onChange={e => { setAddProviderId(e.target.value); setFetchedModels(null); setSelectedModels(new Set()); setFetchError(null); setModelSearch('') }}
                                >
                                    <option value="">Choose a provider…</option>
                                    {(providers as ProviderRow[]).map(p => (
                                        <option key={p.id} value={p.id}>{sanitizeProviderDisplayName(p.display_name)} ({p.provider_name})</option>
                                    ))}
                                </select>
                            </div>

                            {addProviderId && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs text-muted-foreground font-medium">2. Fetch and select models</label>
                                        <button className="btn-ghost text-xs py-1 px-2.5 gap-1" onClick={handleFetchModels} disabled={fetchingModels}>
                                            {fetchingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                            {fetchedModels ? 'Refresh' : 'Fetch Models'}
                                        </button>
                                    </div>

                                    {fetchError && (
                                        <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-300 border border-destructive/20 space-y-1">
                                            <p>{fetchError}</p>
                                            <input className="input text-xs mt-1" placeholder="Or enter model ID manually (e.g. gpt-4o)" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                        </div>
                                    )}

                                    {!fetchError && fetchedModels !== null && fetchedModels.length === 0 && (
                                        <div className="text-xs p-2.5 rounded-lg bg-muted/20 text-muted-foreground border border-border/30 space-y-1">
                                            <p>This provider doesn't support model listing. Enter the model ID manually.</p>
                                            <input className="input text-xs mt-1" placeholder="Enter model ID (e.g. meta-llama/Meta-Llama-3-8B-Instruct)" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                        </div>
                                    )}

                                    {fetchedModels !== null && fetchedModels.length > 0 && (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between px-1">
                                                <div className="relative flex-1 mr-2">
                                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                                    <input className="input text-xs pl-8" placeholder={`Filter ${fetchedModels.length} models…`} value={modelSearch} onChange={e => setModelSearch(e.target.value)} />
                                                </div>
                                                <button className="text-[10px] text-accent hover:underline whitespace-nowrap" onClick={() => {
                                                    selectedModels.size === filteredFetchedModels.length
                                                        ? setSelectedModels(new Set())
                                                        : setSelectedModels(new Set(filteredFetchedModels.map(m => m.id)))
                                                }}>{selectedModels.size === filteredFetchedModels.length ? 'Deselect all' : 'Select all'}</button>
                                            </div>
                                            <div className="max-h-52 overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20">
                                                {filteredFetchedModels.map(m => {
                                                    const checked = selectedModels.has(m.id)
                                                    return (
                                                        <button key={m.id} onClick={() => setSelectedModels(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n })}
                                                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-muted/30 transition-colors ${checked ? 'bg-accent/5' : ''}`}>
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

                                    {fetchedModels === null && !fetchError && (
                                        <input className="input text-xs" placeholder="Or enter model ID manually (e.g. gpt-4o)" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                    )}
                                </div>
                            )}

                            <button
                                className="btn-primary text-xs py-1.5 px-3 w-full justify-center"
                                onClick={handleAddModels}
                                disabled={saving || !addProviderId || totalSelected === 0}
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                {saving ? 'Saving…' : totalSelected > 0 ? `Add ${totalSelected} model${totalSelected > 1 ? 's' : ''}` : 'Select models above'}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Configured models list */}
            {configuredModels.length > 0 ? (
                <div className="space-y-2">
                    {configuredModels.map(m => {
                        const removeKey = `${m.provider_id}:${m.model_id}`
                        const provider = (providers as ProviderRow[]).find(p => p.id === m.provider_id)
                        const meta = provider ? PROVIDER_META[provider.provider_name] : undefined
                        return (
                            <div key={removeKey} className="glass-card px-4 py-3 flex items-center gap-3">
                                {provider && (
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center border flex-shrink-0 ${meta?.color ?? 'bg-muted border-border'}`}>
                                        <ProviderIcon providerId={provider.provider_name} className="w-3.5 h-3.5" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{m.model_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{getProviderDisplay(m.provider_id)}</p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {m.is_default ? (
                                        <span className="chip-accent text-[10px]"><Star className="w-2.5 h-2.5 mr-0.5 inline" />Default</span>
                                    ) : (
                                        <button className="btn-ghost p-1.5" title="Set as default" onClick={() => handleSetDefault(m)}>
                                            <Star className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <button
                                        className="btn-ghost p-1.5 text-red-400"
                                        onClick={() => handleRemove(m)}
                                        disabled={removing === removeKey}
                                    >
                                        {removing === removeKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : !showAdd && (
                <div className="text-center py-10 text-muted-foreground text-sm">
                    <Icon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No {title.toLowerCase()} configured yet.</p>
                    <p className="text-xs mt-1 opacity-70">Click &quot;Add Model&quot; to fetch models from a configured provider.</p>
                </div>
            )}
        </div>
    )
}

// ── Curated local model lists ──────────────────────────────────────────────────
type ModelQuality = 'Fast' | 'Balanced' | 'Best'
type VramTier = '≤2GB' | '≤4GB' | '≤8GB' | '≤16GB' | '32GB+'

interface LocalModel {
    id: string
    name: string
    /** Download/on-disk size */
    diskSize: string
    /** RAM/VRAM needed at inference */
    vramReq: string
    dims?: number
    quality: ModelQuality
    desc: string
    /** VRAM tiers for which this model is recommended */
    recommendedFor?: VramTier[]
}

const RECOMMENDED_EMBEDDING_MODELS: LocalModel[] = [
    {
        id: 'all-MiniLM-L6-v2', name: 'all-MiniLM-L6-v2',
        diskSize: '80 MB', vramReq: '<1 GB', dims: 384, quality: 'Fast',
        desc: 'Lightweight and fast. Great for real-time search with minimal resource usage.',
        recommendedFor: ['≤2GB', '≤4GB'],
    },
    {
        id: 'all-MiniLM-L12-v2', name: 'all-MiniLM-L12-v2',
        diskSize: '120 MB', vramReq: '<1 GB', dims: 384, quality: 'Fast',
        desc: 'Slightly deeper variant of L6. Better semantic accuracy at similar speed.',
        recommendedFor: ['≤2GB', '≤4GB'],
    },
    {
        id: 'BAAI/bge-small-en-v1.5', name: 'BGE Small EN v1.5',
        diskSize: '130 MB', vramReq: '<1 GB', dims: 384, quality: 'Fast',
        desc: 'State-of-the-art compact model by BAAI. Excellent accuracy for its size.',
        recommendedFor: ['≤2GB', '≤4GB'],
    },
    {
        id: 'intfloat/e5-small-v2', name: 'E5 Small v2',
        diskSize: '130 MB', vramReq: '<1 GB', dims: 384, quality: 'Fast',
        desc: 'Compact E5 model. Good quality-to-size ratio for resource-constrained systems.',
        recommendedFor: ['≤2GB', '≤4GB'],
    },
    {
        id: 'BAAI/bge-base-en-v1.5', name: 'BGE Base EN v1.5',
        diskSize: '440 MB', vramReq: '~1 GB', dims: 768, quality: 'Balanced',
        desc: 'Excellent retrieval performance. Recommended for most production deployments.',
        recommendedFor: ['≤4GB', '≤8GB'],
    },
    {
        id: 'all-mpnet-base-v2', name: 'all-mpnet-base-v2',
        diskSize: '420 MB', vramReq: '~1 GB', dims: 768, quality: 'Balanced',
        desc: 'Top-quality SBERT model. Best semantic search accuracy among base models.',
        recommendedFor: ['≤4GB', '≤8GB'],
    },
    {
        id: 'nomic-ai/nomic-embed-text-v1', name: 'Nomic Embed Text v1',
        diskSize: '540 MB', vramReq: '~2 GB', dims: 768, quality: 'Balanced',
        desc: 'Optimized for long documents. Excels at knowledge retrieval tasks.',
        recommendedFor: ['≤8GB'],
    },
    {
        id: 'intfloat/e5-base-v2', name: 'E5 Base v2',
        diskSize: '440 MB', vramReq: '~1 GB', dims: 768, quality: 'Balanced',
        desc: 'Strong retrieval performance in the E5 model family.',
        recommendedFor: ['≤4GB', '≤8GB'],
    },
    {
        id: 'thenlper/gte-base', name: 'GTE Base',
        diskSize: '440 MB', vramReq: '~1 GB', dims: 768, quality: 'Balanced',
        desc: 'General Text Embeddings from Alibaba DAMO. Competitive accuracy.',
        recommendedFor: ['≤8GB'],
    },
    {
        id: 'BAAI/bge-large-en-v1.5', name: 'BGE Large EN v1.5',
        diskSize: '1.3 GB', vramReq: '~3 GB', dims: 1024, quality: 'Best',
        desc: 'Highest quality BGE model. Best for accuracy-critical scenarios.',
        recommendedFor: ['≤8GB', '≤16GB'],
    },
    {
        id: 'intfloat/e5-large-v2', name: 'E5 Large v2',
        diskSize: '1.3 GB', vramReq: '~3 GB', dims: 1024, quality: 'Best',
        desc: 'Best quality in the E5 family. Top performance on retrieval benchmarks.',
        recommendedFor: ['≤16GB', '32GB+'],
    },
]

const RECOMMENDED_WHISPER_MODELS: LocalModel[] = [
    {
        id: 'openai/whisper-tiny', name: 'Whisper Tiny',
        diskSize: '75 MB', vramReq: '<1 GB', quality: 'Fast',
        desc: 'Fastest transcription. Suitable for low-resource machines or quick drafts.',
        recommendedFor: ['≤2GB'],
    },
    {
        id: 'openai/whisper-base', name: 'Whisper Base',
        diskSize: '145 MB', vramReq: '<1 GB', quality: 'Fast',
        desc: 'Small and fast. Good accuracy for clear audio in quiet environments.',
        recommendedFor: ['≤2GB', '≤4GB'],
    },
    {
        id: 'openai/whisper-small', name: 'Whisper Small',
        diskSize: '460 MB', vramReq: '~2 GB', quality: 'Balanced',
        desc: 'Good balance of speed and accuracy. Best all-round choice for most use cases.',
        recommendedFor: ['≤4GB', '≤8GB'],
    },
    {
        id: 'openai/whisper-medium', name: 'Whisper Medium',
        diskSize: '1.5 GB', vramReq: '~5 GB', quality: 'Balanced',
        desc: 'High accuracy. Handles challenging audio, accents, and background noise well.',
        recommendedFor: ['≤8GB'],
    },
    {
        id: 'openai/whisper-large-v2', name: 'Whisper Large v2',
        diskSize: '3.1 GB', vramReq: '~10 GB', quality: 'Best',
        desc: 'Near human-level transcription accuracy. Proven production model.',
        recommendedFor: ['≤16GB'],
    },
    {
        id: 'openai/whisper-large-v3', name: 'Whisper Large v3',
        diskSize: '3.1 GB', vramReq: '~10 GB', quality: 'Best',
        desc: 'Latest Whisper model. Highest accuracy across languages and audio conditions.',
        recommendedFor: ['≤16GB', '32GB+'],
    },
]

const QUALITY_COLORS: Record<ModelQuality, string> = {
    Fast: 'bg-lime-500/15 text-lime-300 border-lime-500/30',
    Balanced: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    Best: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
}

const VRAM_TIER_COLORS: Record<VramTier, string> = {
    '≤2GB': 'bg-lime-500/10 text-lime-300 border-lime-500/25',
    '≤4GB': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    '≤8GB': 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
    '≤16GB': 'bg-blue-500/10 text-blue-300 border-blue-500/25',
    '32GB+': 'bg-violet-500/10 text-violet-300 border-violet-500/25',
}

function LocalModelPicker({ models, selected, onSelect }: {
    models: LocalModel[]
    selected: string
    onSelect: (id: string) => void
}) {
    return (
        <div className="grid grid-cols-1 gap-1.5 max-h-72 overflow-y-auto pr-1">
            {models.map(m => {
                const isSelected = selected === m.id
                return (
                    <button
                        key={m.id}
                        onClick={() => onSelect(m.id)}
                        className={`text-left p-3 rounded-xl border transition-all duration-200 ${isSelected
                            ? 'border-accent bg-accent/10 shadow-glass-sm'
                            : 'border-border/50 hover:border-border hover:bg-muted/20'
                        }`}
                    >
                        <div className="flex items-start gap-2">
                            <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex-shrink-0 transition-colors ${isSelected ? 'bg-accent border-accent' : 'border-border'}`} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                    <span className={`text-xs font-medium ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>{m.name}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${QUALITY_COLORS[m.quality]}`}>{m.quality}</span>
                                    <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.diskSize} disk</span>
                                    <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.vramReq} VRAM</span>
                                    {m.dims && <span className="text-[9px] text-muted-foreground">{m.dims}d</span>}
                                </div>
                                {m.recommendedFor && m.recommendedFor.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap mb-0.5">
                                        <span className="text-[9px] text-muted-foreground">Recommended for:</span>
                                        {m.recommendedFor.map(tier => (
                                            <span key={tier} className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${VRAM_TIER_COLORS[tier]}`}>{tier} VRAM</span>
                                        ))}
                                    </div>
                                )}
                                <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
                            </div>
                        </div>
                    </button>
                )
            })}
        </div>
    )
}

// ── Embedding Tab ─────────────────────────────────────────────────────────────
function EmbeddingTab() {
    const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const qc = useQueryClient()

    const embeddingModel = (settings as { key: string; value: string }[]).find(s => s.key === 'embedding_model')?.value ?? ''
    const [model, setModel] = useState('')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [localExpanded, setLocalExpanded] = useState(true)
    const [showEmbedConfirm, setShowEmbedConfirm] = useState(false)

    // Provider-based embedding models
    const configKey = 'system_embedding_models'
    const configuredModels: TypedModel[] = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === configKey)?.value
        return Array.isArray(raw) ? (raw as TypedModel[]) : []
    }, [settings])

    const [showAdd, setShowAdd] = useState(false)
    const [addProviderId, setAddProviderId] = useState('')
    const [fetchedModels, setFetchedModels] = useState<{ id: string; name: string }[] | null>(null)
    const [fetchingModels, setFetchingModels] = useState(false)
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [modelSearch, setModelSearch] = useState('')
    const [selectedEmbModels, setSelectedEmbModels] = useState<Set<string>>(new Set())
    const [manualModel, setManualModel] = useState('')
    const [addSaving, setAddSaving] = useState(false)
    const [removing, setRemoving] = useState<string | null>(null)
    const [downloadingEmb, setDownloadingEmb] = useState<string | null>(null)
    const [deletingEmb, setDeletingEmb] = useState<string | null>(null)

    // Query download status for all recommended embedding models
    const allEmbIds = useMemo(() => RECOMMENDED_EMBEDDING_MODELS.map(m => m.id).join(','), [])
    const { data: embStatuses = [], refetch: refetchEmb } = useQuery({
        queryKey: ['embedding-model-status', allEmbIds],
        queryFn: () => listEmbeddingModelStatus(allEmbIds),
    })
    const embDownloaded = useMemo(() => {
        const set = new Set<string>()
        for (const s of embStatuses as { id: string; downloaded: boolean }[]) {
            if (s.downloaded) set.add(s.id)
        }
        return set
    }, [embStatuses])

    useEffect(() => { setModel(embeddingModel) }, [embeddingModel])

    const handleDownloadEmb = async (modelId: string) => {
        setDownloadingEmb(modelId)
        try {
            await downloadEmbeddingModel(modelId)
            refetchEmb()
        } finally {
            setDownloadingEmb(null)
        }
    }

    const handleDeleteEmb = async (modelId: string) => {
        setDeletingEmb(modelId)
        try {
            await deleteEmbeddingModel(modelId)
            refetchEmb()
            if (model === modelId) {
                setModel('')
                setSaved(false)
            }
        } finally {
            setDeletingEmb(null)
        }
    }

    const handleSaveLocal = () => {
        // If changing an existing model, require confirmation
        if (embeddingModel && embeddingModel !== model) {
            setShowEmbedConfirm(true)
        } else {
            void doSaveLocal()
        }
    }

    const doSaveLocal = async () => {
        setSaving(true); setShowEmbedConfirm(false)
        await updateSetting('embedding_model', { value: model })
        qc.invalidateQueries({ queryKey: ['settings'] })
        setSaving(false); setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    const filteredFetchedModels = useMemo(() => {
        if (!fetchedModels) return []
        const q = modelSearch.toLowerCase()
        return q ? fetchedModels.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : fetchedModels
    }, [fetchedModels, modelSearch])

    const handleFetchModels = async () => {
        if (!addProviderId) return
        setFetchingModels(true); setFetchError(null); setFetchedModels(null); setSelectedEmbModels(new Set())
        try {
            const models = await listModels(addProviderId)
            setFetchedModels(models)
            if (models.length <= 10) setSelectedEmbModels(new Set(models.map((m: { id: string }) => m.id)))
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setFetchError(err?.response?.data?.detail ?? err?.message ?? 'Failed to fetch models')
        } finally { setFetchingModels(false) }
    }

    const handleAddEmbModels = async () => {
        const toAdd = fetchedModels
            ? [...selectedEmbModels].map(id => ({
                provider_id: addProviderId,
                model_id: id,
                model_name: fetchedModels.find(m => m.id === id)?.name ?? id,
            }))
            : manualModel.trim()
                ? [{ provider_id: addProviderId, model_id: manualModel.trim(), model_name: manualModel.trim() }]
                : []
        if (!toAdd.length) return
        setAddSaving(true)
        try {
            const existing = configuredModels.filter(m => !toAdd.some(n => n.provider_id === m.provider_id && n.model_id === m.model_id))
            await updateSetting(configKey, { value: [...existing, ...toAdd], category: 'llm' })
            qc.invalidateQueries({ queryKey: ['settings'] })
            setShowAdd(false); setAddProviderId(''); setFetchedModels(null); setSelectedEmbModels(new Set()); setManualModel('')
        } finally { setAddSaving(false) }
    }

    const handleRemove = async (m: TypedModel) => {
        const key = `${m.provider_id}:${m.model_id}`
        setRemoving(key)
        try {
            const updated = configuredModels.filter(x => !(x.provider_id === m.provider_id && x.model_id === m.model_id))
            await updateSetting(configKey, { value: updated, category: 'llm' })
            qc.invalidateQueries({ queryKey: ['settings'] })
        } finally { setRemoving(null) }
    }

    const getProviderDisplay = (pid: string) => {
        const p = (providers as ProviderRow[]).find(x => x.id === pid)
        return p ? sanitizeProviderDisplayName(p.display_name) : pid.slice(0, 8)
    }

    const totalSelected = fetchedModels ? selectedEmbModels.size : (manualModel.trim() ? 1 : 0)

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-sm">Embedding Models</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Models used for semantic indexing and vector search. Add provider-based models or configure the built-in local model.
                    </p>
                </div>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                    <Plus className="w-3.5 h-3.5" /> {showAdd ? 'Close' : 'Add Model'}
                </button>
            </div>

            {/* Add model form */}
            {showAdd && (
                <div className="glass-card p-4 space-y-4 border border-accent/20 animate-fade-in">
                    <h4 className="text-xs font-medium text-accent uppercase tracking-wide">Add Embedding Models from Provider</h4>

                    {(providers as unknown[]).length === 0 ? (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>No providers configured. Go to the <strong>Providers</strong> tab to add one first.</span>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground font-medium">1. Select provider</label>
                                <select className="input text-sm" value={addProviderId} onChange={e => { setAddProviderId(e.target.value); setFetchedModels(null); setSelectedEmbModels(new Set()); setFetchError(null); setModelSearch('') }}>
                                    <option value="">Choose a provider…</option>
                                    {(providers as ProviderRow[]).map(p => (
                                        <option key={p.id} value={p.id}>{sanitizeProviderDisplayName(p.display_name)} ({p.provider_name})</option>
                                    ))}
                                </select>
                            </div>

                            {addProviderId && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs text-muted-foreground font-medium">2. Fetch and select models</label>
                                        <button className="btn-ghost text-xs py-1 px-2.5 gap-1" onClick={handleFetchModels} disabled={fetchingModels}>
                                            {fetchingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                            {fetchedModels ? 'Refresh' : 'Fetch Models'}
                                        </button>
                                    </div>

                                    {fetchError && (
                                        <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-300 border border-destructive/20 space-y-1">
                                            <p>{fetchError}</p>
                                            <input className="input text-xs mt-1" placeholder="Or enter model ID manually" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                        </div>
                                    )}

                                    {fetchedModels !== null && fetchedModels.length > 0 && (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between px-1">
                                                <div className="relative flex-1 mr-2">
                                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                                    <input className="input text-xs pl-8" placeholder={`Filter ${fetchedModels.length} models…`} value={modelSearch} onChange={e => setModelSearch(e.target.value)} />
                                                </div>
                                                <button className="text-[10px] text-accent hover:underline whitespace-nowrap" onClick={() => {
                                                    selectedEmbModels.size === filteredFetchedModels.length
                                                        ? setSelectedEmbModels(new Set())
                                                        : setSelectedEmbModels(new Set(filteredFetchedModels.map(m => m.id)))
                                                }}>{selectedEmbModels.size === filteredFetchedModels.length ? 'Deselect all' : 'Select all'}</button>
                                            </div>
                                            <div className="max-h-52 overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20">
                                                {filteredFetchedModels.map(m => {
                                                    const checked = selectedEmbModels.has(m.id)
                                                    return (
                                                        <button key={m.id} onClick={() => setSelectedEmbModels(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n })}
                                                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-muted/30 transition-colors ${checked ? 'bg-accent/5' : ''}`}>
                                                            <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${checked ? 'bg-accent border-accent' : 'border-border'}`}>
                                                                {checked && <Check className="w-2.5 h-2.5 text-accent-foreground" />}
                                                            </div>
                                                            <span className={checked ? 'text-foreground' : 'text-muted-foreground'}>{m.name}</span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {fetchedModels === null && !fetchError && (
                                        <input className="input text-xs" placeholder="Or enter model ID manually (e.g. text-embedding-3-small)" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                    )}
                                </div>
                            )}

                            <button className="btn-primary text-xs py-1.5 px-3 w-full justify-center" onClick={handleAddEmbModels} disabled={addSaving || !addProviderId || totalSelected === 0}>
                                {addSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                {addSaving ? 'Saving…' : totalSelected > 0 ? `Add ${totalSelected} model${totalSelected > 1 ? 's' : ''}` : 'Select models above'}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Provider-based embedding models */}
            {configuredModels.length > 0 && (
                <div className="space-y-2">
                    {configuredModels.map(m => {
                        const removeKey = `${m.provider_id}:${m.model_id}`
                        const provider = (providers as ProviderRow[]).find(p => p.id === m.provider_id)
                        const meta = provider ? PROVIDER_META[provider.provider_name] : undefined
                        return (
                            <div key={removeKey} className="glass-card px-4 py-3 flex items-center gap-3">
                                {provider && (
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center border flex-shrink-0 ${meta?.color ?? 'bg-muted border-border'}`}>
                                        <ProviderIcon providerId={provider.provider_name} className="w-3.5 h-3.5" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{m.model_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{getProviderDisplay(m.provider_id)}</p>
                                </div>
                                <button className="btn-ghost p-1.5 text-red-400" onClick={() => handleRemove(m)} disabled={removing === removeKey}>
                                    {removing === removeKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Built-in local embedding model */}
            <div className="glass-card-hover transition-all duration-300">
                <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                    onClick={() => setLocalExpanded(p => !p)}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLocalExpanded(p => !p) } }}
                >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center border bg-lime-500/10 border-lime-500/20">
                        <Database className="w-4 h-4 text-lime-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">Built-in Local</span>
                            <span className="chip-muted text-[10px]">sentence-transformers</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {model || 'No model configured'}
                        </p>
                    </div>
                    <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); setLocalExpanded(p => !p) }}>
                        {localExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                </div>

                {localExpanded && (
                    <div className="border-t border-border/50 px-4 py-4 space-y-3 animate-fade-in">
                        <label className="text-xs text-muted-foreground mb-2 block font-medium">Download a model, then set it as default</label>
                        <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto pr-1">
                            {RECOMMENDED_EMBEDDING_MODELS.map(m => {
                                const isSelected = model === m.id
                                const isDownloaded = embDownloaded.has(m.id)
                                const isDownloading = downloadingEmb === m.id
                                const isDeleting = deletingEmb === m.id
                                return (
                                    <div
                                        key={m.id}
                                        className={`text-left p-3 rounded-xl border transition-all duration-200 ${isSelected
                                            ? 'border-accent bg-accent/10 shadow-glass-sm'
                                            : 'border-border/50 hover:border-border hover:bg-muted/20'
                                        }`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { if (isDownloaded) { setModel(m.id); setSaved(false) } }}
                                                disabled={!isDownloaded}
                                                className="mt-0.5 flex-shrink-0"
                                                title={isDownloaded ? 'Select as default' : 'Download first'}
                                            >
                                                <div className={`w-3.5 h-3.5 rounded-full border transition-colors ${isSelected ? 'bg-accent border-accent' : isDownloaded ? 'border-border hover:border-accent/50' : 'border-border/30 opacity-40'}`} />
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                                    <span className={`text-xs font-medium ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>{m.name}</span>
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${QUALITY_COLORS[m.quality]}`}>{m.quality}</span>
                                                    <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.diskSize} disk</span>
                                                    {m.dims && <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.dims}d</span>}
                                                    {isDownloaded && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Downloaded</span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {isDownloaded ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteEmb(m.id)}
                                                        disabled={isDeleting || isSelected}
                                                        className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                                                        title={isSelected ? 'Cannot delete active model' : 'Delete model'}
                                                    >
                                                        {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadEmb(m.id)}
                                                        disabled={isDownloading || downloadingEmb !== null}
                                                        className="p-1 rounded text-accent/70 hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
                                                        title="Download model"
                                                    >
                                                        {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>Changing the embedding model requires re-indexing all knowledge. Search results will be unavailable until re-indexing completes.</span>
                        </div>
                        <button
                            className="btn-primary text-xs py-1.5 px-3"
                            onClick={handleSaveLocal}
                            disabled={saving || !model.trim() || !embDownloaded.has(model)}
                            title={model && !embDownloaded.has(model) ? 'Download the model first' : ''}
                        >
                            {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5" /> Set as Default</>}
                        </button>
                    </div>
                )}
            </div>

            {/* Critical embedding model change confirmation */}
            {showEmbedConfirm && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setShowEmbedConfirm(false)} />
                    <div className="relative w-full max-w-lg animate-fade-in">
                        {/* Danger glow border */}
                        <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-red-600/60 via-red-500/40 to-orange-600/60 blur-sm" />
                        <div className="relative rounded-2xl bg-background border border-red-600/50 shadow-2xl overflow-hidden">
                            {/* Critical header stripe */}
                            <div className="bg-gradient-to-r from-red-900/80 via-red-800/70 to-red-900/80 border-b border-red-600/40 px-6 py-4 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center flex-shrink-0">
                                    <ShieldAlert className="w-5 h-5 text-red-400" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-widest text-red-400/80 mb-0.5">Destructive Operation</p>
                                    <h3 className="text-base font-bold text-foreground">Change Embedding Model</h3>
                                </div>
                            </div>

                            <div className="px-6 py-5 space-y-4">
                                {/* Model change summary */}
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/60 text-xs font-mono">
                                    <span className="text-muted-foreground truncate max-w-[180px]">{embeddingModel || '(none)'}</span>
                                    <span className="text-red-400 font-bold flex-shrink-0">→</span>
                                    <span className="text-foreground font-semibold truncate max-w-[180px]">{model}</span>
                                </div>

                                {/* Consequences */}
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">What will happen</p>
                                    {[
                                        'All existing knowledge vectors will be invalidated immediately.',
                                        'Semantic search will be unavailable until full re-indexing completes.',
                                        'Re-indexing every knowledge item may take hours on large datasets.',
                                        'The new model will be downloaded on first use (can be several GB).',
                                        'This action cannot be undone without manually re-indexing with the old model.',
                                    ].map(line => (
                                        <div key={line} className="flex items-start gap-2 text-xs text-muted-foreground">
                                            <span className="text-red-500 font-bold flex-shrink-0 mt-0.5">!</span>
                                            <span>{line}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="px-6 pb-5 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowEmbedConfirm(false)}
                                    className="btn-ghost px-4 py-2 text-sm font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void doSaveLocal()}
                                    className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 border border-red-500/50 shadow-lg shadow-red-900/30 transition-all focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                                >
                                    <ShieldAlert className="w-4 h-4" />
                                    Yes, Change Model &amp; Re-index
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Audio Tab ─────────────────────────────────────────────────────────────────
function AudioTab() {
    const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const qc = useQueryClient()

    const configKey = 'system_audio_models'
    const configuredModels: (TypedModel & { subtype: 'tts' | 'stt' })[] = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === configKey)?.value
        return Array.isArray(raw) ? (raw as (TypedModel & { subtype: 'tts' | 'stt' })[]) : []
    }, [settings])

    // Sub-tab: stt or tts
    const [audioSubTab, setAudioSubTab] = useState<'stt' | 'tts'>('stt')
    const [showAdd, setShowAdd] = useState(false)
    const [addProviderId, setAddProviderId] = useState('')
    const [fetchedModels, setFetchedModels] = useState<{ id: string; name: string }[] | null>(null)
    const [fetchingModels, setFetchingModels] = useState(false)
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [modelSearch, setModelSearch] = useState('')
    const [selectedAudioModels, setSelectedAudioModels] = useState<Set<string>>(new Set())
    const [manualModel, setManualModel] = useState('')
    const [saving, setSaving] = useState(false)
    const [removing, setRemoving] = useState<string | null>(null)
    // Built-in local Whisper state
    const [whisperModel, setWhisperModel] = useState('')
    const [whisperExpanded, setWhisperExpanded] = useState(true)
    const [savingWhisper, setSavingWhisper] = useState(false)
    const [savedWhisper, setSavedWhisper] = useState(false)
    const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
    const [deletingModel, setDeletingModel] = useState<string | null>(null)
    const { data: whisperModelStatuses = [], refetch: refetchWhisper } = useQuery({
        queryKey: ['whisper-models'],
        queryFn: listWhisperModels,
    })
    const whisperDownloaded = useMemo(() => {
        const set = new Set<string>()
        for (const m of whisperModelStatuses as { id: string; downloaded: boolean }[]) {
            if (m.downloaded) set.add(m.id)
        }
        return set
    }, [whisperModelStatuses])

    const filteredFetchedModels = useMemo(() => {
        if (!fetchedModels) return []
        const q = modelSearch.toLowerCase()
        return q ? fetchedModels.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) : fetchedModels
    }, [fetchedModels, modelSearch])

    const handleFetchModels = async () => {
        if (!addProviderId) return
        setFetchingModels(true); setFetchError(null); setFetchedModels(null); setSelectedAudioModels(new Set())
        try {
            const models = await listModels(addProviderId)
            setFetchedModels(models)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setFetchError(err?.response?.data?.detail ?? err?.message ?? 'Failed to fetch models')
        } finally { setFetchingModels(false) }
    }

    const handleAddModels = async () => {
        const toAdd: (TypedModel & { subtype: 'tts' | 'stt' })[] = fetchedModels
            ? [...selectedAudioModels].map(id => ({
                provider_id: addProviderId, model_id: id,
                model_name: fetchedModels.find(m => m.id === id)?.name ?? id, subtype: audioSubTab,
            }))
            : manualModel.trim()
                ? [{ provider_id: addProviderId, model_id: manualModel.trim(), model_name: manualModel.trim(), subtype: audioSubTab }]
                : []
        if (!toAdd.length) return
        setSaving(true)
        try {
            const existing = configuredModels.filter(m => !toAdd.some(n => n.provider_id === m.provider_id && n.model_id === m.model_id))
            await updateSetting(configKey, { value: [...existing, ...toAdd], category: 'llm' })
            qc.invalidateQueries({ queryKey: ['settings'] })
            setShowAdd(false); setAddProviderId(''); setFetchedModels(null); setSelectedAudioModels(new Set()); setManualModel('')
        } finally { setSaving(false) }
    }

    const handleRemove = async (m: TypedModel) => {
        const key = `${m.provider_id}:${m.model_id}`
        setRemoving(key)
        try {
            const updated = configuredModels.filter(x => !(x.provider_id === m.provider_id && x.model_id === m.model_id))
            await updateSetting(configKey, { value: updated, category: 'llm' })
            qc.invalidateQueries({ queryKey: ['settings'] })
        } finally { setRemoving(null) }
    }

    const getProviderDisplay = (pid: string) => {
        const p = (providers as ProviderRow[]).find(x => x.id === pid)
        return p ? sanitizeProviderDisplayName(p.display_name) : pid.slice(0, 8)
    }

    const ttsModels = configuredModels.filter(m => m.subtype === 'tts')
    const sttModels = configuredModels.filter(m => m.subtype === 'stt')
    const totalSelected = fetchedModels ? selectedAudioModels.size : (manualModel.trim() ? 1 : 0)
    const localWhisperModel = (settings as { key: string; value: string }[]).find(s => s.key === 'local_whisper_model')?.value ?? ''
    useEffect(() => { setWhisperModel(localWhisperModel) }, [localWhisperModel])

    const handleSaveWhisper = async () => {
        if (!whisperDownloaded.has(whisperModel)) return
        setSavingWhisper(true)
        await updateSetting('local_whisper_model', { value: whisperModel, category: 'llm' })
        qc.invalidateQueries({ queryKey: ['settings'] })
        setSavingWhisper(false); setSavedWhisper(true)
        setTimeout(() => setSavedWhisper(false), 2000)
    }

    const handleDownloadWhisper = async (modelId: string) => {
        setDownloadingModel(modelId)
        try {
            await downloadWhisperModel(modelId)
            refetchWhisper()
        } finally {
            setDownloadingModel(null)
        }
    }

    const handleDeleteWhisper = async (modelId: string) => {
        setDeletingModel(modelId)
        try {
            await deleteWhisperModel(modelId)
            refetchWhisper()
            // If the deleted model was the selected default, clear selection
            if (whisperModel === modelId) {
                setWhisperModel('')
                setSavedWhisper(false)
            }
        } finally {
            setDeletingModel(null)
        }
    }

    const resetAddForm = () => {
        setShowAdd(false); setAddProviderId(''); setFetchedModels(null)
        setSelectedAudioModels(new Set()); setManualModel(''); setFetchError(null); setModelSearch('')
    }

    return (
        <div className="space-y-4">
            <div>
                <h3 className="font-semibold text-sm">Audio Models</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Configure Speech-to-Text (STT) and Text-to-Speech (TTS) models from providers or use local Whisper.
                </p>
            </div>

            {/* STT / TTS sub-tabs */}
            <div className="flex gap-1 p-1 rounded-lg bg-muted/30 border border-border/50">
                {([['stt', 'Speech-to-Text (STT)', sttModels.length], ['tts', 'Text-to-Speech (TTS)', ttsModels.length]] as const).map(([key, label, count]) => (
                    <button
                        key={key}
                        onClick={() => { setAudioSubTab(key); resetAddForm() }}
                        className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${audioSubTab === key ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {label}
                        <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-medium ${audioSubTab === key ? 'bg-accent-foreground/20' : 'bg-muted text-muted-foreground'}`}>{count}</span>
                    </button>
                ))}
            </div>

            {/* Add model button + panel */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    {audioSubTab === 'stt' ? 'Provider-based STT models' : 'Provider-based TTS models'}
                </p>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                    <Plus className="w-3.5 h-3.5" /> {showAdd ? 'Close' : `Add ${audioSubTab.toUpperCase()} Model`}
                </button>
            </div>

            {showAdd && (
                <div className="glass-card p-4 space-y-4 border border-accent/20 animate-fade-in">
                    <h4 className="text-xs font-medium text-accent uppercase tracking-wide">
                        Add {audioSubTab === 'stt' ? 'Speech-to-Text' : 'Text-to-Speech'} Model
                    </h4>

                    {(providers as unknown[]).length === 0 ? (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span>No providers configured. Go to the <strong>Providers</strong> tab to add one first.</span>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-xs text-muted-foreground font-medium">1. Select provider</label>
                                <select className="input text-sm" value={addProviderId} onChange={e => { setAddProviderId(e.target.value); setFetchedModels(null); setSelectedAudioModels(new Set()); setFetchError(null); setModelSearch('') }}>
                                    <option value="">Choose a provider…</option>
                                    {(providers as ProviderRow[]).map(p => (
                                        <option key={p.id} value={p.id}>{sanitizeProviderDisplayName(p.display_name)} ({p.provider_name})</option>
                                    ))}
                                </select>
                            </div>

                            {addProviderId && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs text-muted-foreground font-medium">2. Fetch and select models</label>
                                        <button className="btn-ghost text-xs py-1 px-2.5 gap-1" onClick={handleFetchModels} disabled={fetchingModels}>
                                            {fetchingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                            {fetchedModels ? 'Refresh' : 'Fetch Models'}
                                        </button>
                                    </div>

                                    {fetchError && (
                                        <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-300 border border-destructive/20 space-y-1">
                                            <p>{fetchError}</p>
                                            <input className="input text-xs mt-1" placeholder="Or enter model ID manually" value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                        </div>
                                    )}

                                    {fetchedModels !== null && fetchedModels.length > 0 && (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between px-1">
                                                <div className="relative flex-1 mr-2">
                                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                                    <input className="input text-xs pl-8" placeholder={`Filter ${fetchedModels.length} models…`} value={modelSearch} onChange={e => setModelSearch(e.target.value)} />
                                                </div>
                                                <button className="text-[10px] text-accent hover:underline whitespace-nowrap" onClick={() => {
                                                    selectedAudioModels.size === filteredFetchedModels.length
                                                        ? setSelectedAudioModels(new Set())
                                                        : setSelectedAudioModels(new Set(filteredFetchedModels.map(m => m.id)))
                                                }}>{selectedAudioModels.size === filteredFetchedModels.length ? 'Deselect all' : 'Select all'}</button>
                                            </div>
                                            <div className="max-h-44 overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20">
                                                {filteredFetchedModels.map(m => {
                                                    const checked = selectedAudioModels.has(m.id)
                                                    return (
                                                        <button key={m.id} onClick={() => setSelectedAudioModels(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n })}
                                                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-muted/30 ${checked ? 'bg-accent/5' : ''}`}>
                                                            <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${checked ? 'bg-accent border-accent' : 'border-border'}`}>
                                                                {checked && <Check className="w-2.5 h-2.5 text-accent-foreground" />}
                                                            </div>
                                                            <span className={checked ? 'text-foreground' : 'text-muted-foreground'}>{m.name}</span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    {fetchedModels === null && !fetchError && (
                                        <input className="input text-xs" placeholder={`Or enter model ID manually (e.g. ${audioSubTab === 'stt' ? 'whisper-1' : 'tts-1'})`} value={manualModel} onChange={e => setManualModel(e.target.value)} />
                                    )}
                                </div>
                            )}

                            <button className="btn-primary text-xs py-1.5 px-3 w-full justify-center" onClick={handleAddModels} disabled={saving || !addProviderId || totalSelected === 0}>
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                {saving ? 'Saving…' : totalSelected > 0 ? `Add ${totalSelected} ${audioSubTab.toUpperCase()} model${totalSelected > 1 ? 's' : ''}` : 'Select models above'}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Model list for active sub-tab */}
            {audioSubTab === 'stt' ? (
                <div className="space-y-2">
                    {sttModels.length > 0 ? sttModels.map(m => {
                        const removeKey = `${m.provider_id}:${m.model_id}`
                        const provider = (providers as ProviderRow[]).find(p => p.id === m.provider_id)
                        const meta = provider ? PROVIDER_META[provider.provider_name] : undefined
                        return (
                            <div key={removeKey} className="glass-card px-4 py-3 flex items-center gap-3">
                                {provider && <div className={`w-7 h-7 rounded-lg flex items-center justify-center border flex-shrink-0 ${meta?.color ?? 'bg-muted border-border'}`}><ProviderIcon providerId={provider.provider_name} className="w-3.5 h-3.5" /></div>}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{m.model_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{getProviderDisplay(m.provider_id)}</p>
                                </div>
                                <button className="btn-ghost p-1.5 text-red-400" onClick={() => handleRemove(m)} disabled={removing === removeKey}>
                                    {removing === removeKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        )
                    }) : <p className="text-xs text-muted-foreground italic px-1">No provider-based STT models configured.</p>}

                    {/* Built-in local Whisper */}
                    <div className="glass-card-hover transition-all duration-300">
                        <div
                            className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                            onClick={() => setWhisperExpanded(p => !p)}
                            role="button" tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setWhisperExpanded(p => !p) } }}
                        >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center border bg-indigo-500/10 border-indigo-500/20">
                                <Mic className="w-4 h-4 text-indigo-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">Built-in Local STT</span>
                                    <span className="chip-muted text-[10px]">Whisper</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {whisperModel || 'No model configured'}
                                </p>
                            </div>
                            <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); setWhisperExpanded(p => !p) }}>
                                {whisperExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                        {whisperExpanded && (
                            <div className="border-t border-border/50 px-4 py-4 space-y-3 animate-fade-in">
                                <label className="text-xs text-muted-foreground mb-2 block font-medium">Download a Whisper model, then set it as default</label>
                                <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto pr-1">
                                    {RECOMMENDED_WHISPER_MODELS.map(m => {
                                        const isSelected = whisperModel === m.id
                                        const isDownloaded = whisperDownloaded.has(m.id)
                                        const isDownloading = downloadingModel === m.id
                                        const isDeleting = deletingModel === m.id
                                        return (
                                            <div
                                                key={m.id}
                                                className={`text-left p-3 rounded-xl border transition-all duration-200 ${isSelected
                                                    ? 'border-accent bg-accent/10 shadow-glass-sm'
                                                    : 'border-border/50 hover:border-border hover:bg-muted/20'
                                                }`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => { if (isDownloaded) { setWhisperModel(m.id); setSavedWhisper(false) } }}
                                                        disabled={!isDownloaded}
                                                        className="mt-0.5 flex-shrink-0"
                                                        title={isDownloaded ? 'Select as default' : 'Download first'}
                                                    >
                                                        <div className={`w-3.5 h-3.5 rounded-full border transition-colors ${isSelected ? 'bg-accent border-accent' : isDownloaded ? 'border-border hover:border-accent/50' : 'border-border/30 opacity-40'}`} />
                                                    </button>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                                            <span className={`text-xs font-medium ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>{m.name}</span>
                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${QUALITY_COLORS[m.quality]}`}>{m.quality}</span>
                                                            <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.diskSize} disk</span>
                                                            <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.vramReq} VRAM</span>
                                                            {isDownloaded && (
                                                                <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Downloaded</span>
                                                            )}
                                                        </div>
                                                        {m.recommendedFor && m.recommendedFor.length > 0 && (
                                                            <div className="flex items-center gap-1 flex-wrap mb-0.5">
                                                                <span className="text-[9px] text-muted-foreground">Recommended for:</span>
                                                                {m.recommendedFor.map(tier => (
                                                                    <span key={tier} className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${VRAM_TIER_COLORS[tier]}`}>{tier} VRAM</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        {isDownloaded ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteWhisper(m.id)}
                                                                disabled={isDeleting || isSelected}
                                                                className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                                                                title={isSelected ? 'Cannot delete active model' : 'Delete model'}
                                                            >
                                                                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDownloadWhisper(m.id)}
                                                                disabled={isDownloading || downloadingModel !== null}
                                                                className="p-1 rounded text-accent/70 hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
                                                                title="Download model"
                                                            >
                                                                {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                                <button
                                    className="btn-primary text-xs py-1.5 px-3"
                                    onClick={handleSaveWhisper}
                                    disabled={savingWhisper || !whisperModel.trim() || !whisperDownloaded.has(whisperModel)}
                                    title={whisperModel && !whisperDownloaded.has(whisperModel) ? 'Download the model first' : ''}
                                >
                                    {savedWhisper ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : savingWhisper ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5" /> Set as Default</>}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    {ttsModels.length > 0 ? ttsModels.map(m => {
                        const removeKey = `${m.provider_id}:${m.model_id}`
                        const provider = (providers as ProviderRow[]).find(p => p.id === m.provider_id)
                        const meta = provider ? PROVIDER_META[provider.provider_name] : undefined
                        return (
                            <div key={removeKey} className="glass-card px-4 py-3 flex items-center gap-3">
                                {provider && <div className={`w-7 h-7 rounded-lg flex items-center justify-center border flex-shrink-0 ${meta?.color ?? 'bg-muted border-border'}`}><ProviderIcon providerId={provider.provider_name} className="w-3.5 h-3.5" /></div>}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{m.model_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{getProviderDisplay(m.provider_id)}</p>
                                </div>
                                <button className="btn-ghost p-1.5 text-red-400" onClick={() => handleRemove(m)} disabled={removing === removeKey}>
                                    {removing === removeKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        )
                    }) : <p className="text-xs text-muted-foreground italic px-1">No TTS models configured.</p>}
                </div>
            )}
        </div>
    )
}

// ── CLIP Visual Model Tab ─────────────────────────────────────────────────────

interface CLIPModelInfo {
    id: string
    name: string
    diskSize: string
    vramReq: string
    dimension: number
    quality: ModelQuality
    desc: string
    recommendedFor?: VramTier[]
}

const RECOMMENDED_CLIP_MODELS: CLIPModelInfo[] = [
    {
        id: 'clip-ViT-B-16', name: 'CLIP ViT-B/16',
        diskSize: '600 MB', vramReq: '~1 GB', dimension: 512, quality: 'Balanced',
        desc: 'Higher resolution variant of the base model. Better at fine-grained visual details.',
        recommendedFor: ['≤4GB', '≤8GB'],
    },
    {
        id: 'clip-ViT-B-32', name: 'CLIP ViT-B/32',
        diskSize: '600 MB', vramReq: '<1 GB', dimension: 512, quality: 'Fast',
        desc: 'Default model. Fast and memory-efficient, good for most image search use cases.',
        recommendedFor: ['≤2GB', '≤4GB'],
    },
    {
        id: 'clip-ViT-L-14', name: 'CLIP ViT-L/14',
        diskSize: '1.7 GB', vramReq: '~3 GB', dimension: 768, quality: 'Best',
        desc: 'Largest CLIP model. Best visual understanding and search accuracy.',
        recommendedFor: ['≤8GB', '≤16GB'],
    },
]

function CLIPTab() {
    const qc = useQueryClient()

    const [clipModel, setClipModel] = useState('')
    const [savingClip, setSavingClip] = useState(false)
    const [savedClip, setSavedClip] = useState(false)
    const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
    const [deletingModel, setDeletingModel] = useState<string | null>(null)

    const { data: clipStatuses = [], refetch: refetchClip } = useQuery({
        queryKey: ['clip-models'],
        queryFn: listCLIPModels,
    })

    const { data: clipDefault } = useQuery({
        queryKey: ['clip-default'],
        queryFn: getCLIPDefault,
    })

    const clipDownloaded = useMemo(() => {
        const set = new Set<string>()
        for (const m of clipStatuses as { id: string; downloaded: boolean }[]) {
            if (m.downloaded) set.add(m.id)
        }
        return set
    }, [clipStatuses])

    const currentDefault = (clipDefault as { model_id?: string })?.model_id ?? ''
    useEffect(() => { if (currentDefault) setClipModel(currentDefault) }, [currentDefault])

    const handleDownloadClip = async (modelId: string) => {
        setDownloadingModel(modelId)
        try {
            await downloadCLIPModel(modelId)
            refetchClip()
        } finally {
            setDownloadingModel(null)
        }
    }

    const handleDeleteClip = async (modelId: string) => {
        setDeletingModel(modelId)
        try {
            await deleteCLIPModel(modelId)
            refetchClip()
            if (clipModel === modelId) {
                setClipModel('')
                setSavedClip(false)
            }
        } finally {
            setDeletingModel(null)
        }
    }

    const handleSaveClip = async () => {
        if (!clipDownloaded.has(clipModel)) return
        setSavingClip(true)
        try {
            await setCLIPDefault(clipModel)
            qc.invalidateQueries({ queryKey: ['clip-default'] })
            setSavedClip(true)
            setTimeout(() => setSavedClip(false), 2000)
        } finally {
            setSavingClip(false)
        }
    }

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-sm font-medium">CLIP Visual Search Models</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    CLIP models generate visual embeddings for image search. Select and download a model, then set it as default. Changing the default model requires re-processing existing images to update their embeddings.
                </p>
            </div>

            <div className="space-y-1.5">
                {RECOMMENDED_CLIP_MODELS.map(m => {
                    const isSelected = clipModel === m.id
                    const isDownloaded = clipDownloaded.has(m.id)
                    const isDownloading = downloadingModel === m.id
                    const isDeleting = deletingModel === m.id
                    const statusInfo = (clipStatuses as { id: string; disk_size?: string }[]).find(s => s.id === m.id)

                    return (
                        <div
                            key={m.id}
                            className={`glass-card-hover transition-all duration-300 ${isSelected ? 'ring-1 ring-accent/40' : ''}`}
                        >
                            <div className="px-4 py-3 flex items-start gap-3">
                                {/* Radio selector */}
                                <button
                                    type="button"
                                    onClick={() => isDownloaded && setClipModel(m.id)}
                                    disabled={!isDownloaded}
                                    className="mt-1 flex-shrink-0"
                                    title={isDownloaded ? 'Select this model' : 'Download first'}
                                >
                                    <div className={`w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center ${
                                        isSelected ? 'border-accent bg-accent/20' : isDownloaded ? 'border-muted-foreground/40 hover:border-accent/60' : 'border-muted-foreground/20 opacity-40'
                                    }`}>
                                        {isSelected && <div className="w-2 h-2 rounded-full bg-accent" />}
                                    </div>
                                </button>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                        <span className="font-medium text-sm">{m.name}</span>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${QUALITY_COLORS[m.quality]}`}>{m.quality}</span>
                                        <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.diskSize}</span>
                                        <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.vramReq} VRAM</span>
                                        <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.dimension}D</span>
                                        {isDownloaded && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                                                Downloaded{statusInfo?.disk_size ? ` (${statusInfo.disk_size})` : ''}
                                            </span>
                                        )}
                                        {m.recommendedFor?.map(tier => (
                                            <span key={tier} className={`text-[8px] px-1.5 py-0.5 rounded border font-medium ${VRAM_TIER_COLORS[tier]}`}>{tier}</span>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {isDownloaded ? (
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteClip(m.id)}
                                            disabled={isDeleting}
                                            className="p-1.5 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                                            title="Delete model"
                                        >
                                            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => handleDownloadClip(m.id)}
                                            disabled={isDownloading}
                                            className="btn-primary text-xs py-1.5 px-3"
                                            title="Download model"
                                        >
                                            {isDownloading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Downloading…</> : <><Download className="w-3.5 h-3.5" /> Download</>}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Save default button */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={handleSaveClip}
                    disabled={savingClip || !clipModel.trim() || !clipDownloaded.has(clipModel) || clipModel === currentDefault}
                    className="btn-primary text-xs py-1.5 px-4 gap-1.5"
                    title={clipModel && !clipDownloaded.has(clipModel) ? 'Download the model first' : ''}
                >
                    {savingClip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Set as Default
                </button>
                {savedClip && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Saved
                    </span>
                )}
                {currentDefault && (
                    <span className="text-[10px] text-muted-foreground">
                        Current: {RECOMMENDED_CLIP_MODELS.find(m => m.id === currentDefault)?.name || currentDefault}
                    </span>
                )}
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <p className="text-[11px] text-amber-300/90">
                    Changing the CLIP model changes the embedding dimensions. Existing image embeddings will need to be re-processed via the image knowledge cards' re-extract action to use the new model.
                </p>
            </div>
        </div>
    )
}

// ── PDF Processing Tab ────────────────────────────────────────────────────────
function PDFProcessingTab() {
    const [deleting, setDeleting] = useState(false)
    const { data: markerModels = [], refetch } = useQuery({
        queryKey: ['marker-models'],
        queryFn: listMarkerModels,
        refetchInterval: (query) => {
            const models = query.state.data as { downloading?: boolean }[] | undefined
            return models?.[0]?.downloading ? 3000 : false
        },
    })

    const model = (markerModels as { id: string; name: string; downloaded: boolean; downloading?: boolean; disk_size: string | null }[])[0]
    const isDownloaded = model?.downloaded ?? false
    const isDownloading = model?.downloading ?? false
    const diskSize = model?.disk_size ?? null
    const [localDownloading, setLocalDownloading] = useState(false)
    const downloading = isDownloading || localDownloading

    const handleDownload = async () => {
        setLocalDownloading(true)
        try {
            await downloadMarkerModel()
            refetch()
        } finally {
            setLocalDownloading(false)
        }
    }

    const handleDelete = async () => {
        setDeleting(true)
        try {
            await deleteMarkerModel()
            refetch()
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-sm font-medium">PDF Processing</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Marker PDF uses deep learning models for layout-aware text extraction from PDFs. Without it, basic PyMuPDF text extraction is used as a fallback.
                </p>
            </div>

            <div className="glass-card-hover transition-all duration-300">
                <div className="px-4 py-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center border bg-red-500/10 border-red-500/20 flex-shrink-0">
                            <FileText className="w-4.5 h-4.5 text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-medium text-sm">Marker PDF</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-purple-500/15 text-purple-300 border-purple-500/30">Best</span>
                                <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">~1.5 GB disk</span>
                                <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">~3 GB VRAM</span>
                                {isDownloaded && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                                        Downloaded{diskSize ? ` (${diskSize})` : ''}
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Layout-aware PDF extraction with table detection, OCR, and markdown output. Produces significantly better results than basic text extraction, especially for PDFs with complex layouts, tables, and multi-column text.
                            </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            {isDownloaded ? (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="p-1.5 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                                    title="Delete model"
                                >
                                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleDownload}
                                    disabled={downloading}
                                    className="btn-primary text-xs py-1.5 px-3"
                                    title="Download model"
                                >
                                    {downloading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Downloading…</> : <><Download className="w-3.5 h-3.5" /> Download</>}
                                </button>
                            )}
                        </div>
                    </div>

                    {!isDownloaded && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                            <p className="text-[11px] text-amber-300/90">
                                Without this model, PDFs will be processed using basic text extraction (PyMuPDF) which may not handle complex layouts, tables, or scanned documents well.
                            </p>
                        </div>
                    )}
                </div>
            </div>
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
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    const meta = PROVIDER_META[providerName]

    const handleProviderChange = (id: string) => {
        setProviderName(id); setDisplayName(''); setApiKey(''); setBaseUrl('')
        setShowKey(false); setTestResult(null); setSaveError(null); setShowAdvanced(false)
    }

    const handleTest = async () => {
        setTesting(true); setTestResult(null)
        try {
            // Create a temporary provider to test
            const temp = await createProvider({
                provider_name: providerName,
                display_name: displayName || meta?.name || providerName,
                api_key: apiKey || undefined,
                base_url: baseUrl || undefined,
            })
            const result = await testConnection(temp.id)
            // Delete the temp provider after testing (will be recreated on save)
            await import('@/lib/api').then(a => a.deleteProvider(temp.id))
            setTestResult(result)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setTestResult({ success: false, message: err?.response?.data?.detail ?? err?.message ?? 'Test failed' })
        } finally { setTesting(false) }
    }

    const handleSave = async () => {
        setSaving(true); setSaveError(null)
        try {
            await createProvider({
                provider_name: providerName,
                display_name: displayName || meta?.name || providerName,
                api_key: apiKey || undefined,
                base_url: baseUrl || undefined,
            })
            onAdded()
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setSaveError(err?.response?.data?.detail ?? err?.message ?? 'Save failed')
        } finally { setSaving(false) }
    }

    const canSave = meta?.needsUrl ? !!baseUrl : (!!apiKey || isLocalProvider(providerName))

    return (
        <div className="glass-card shadow-glass-lg p-5 space-y-4 border border-accent/30 animate-fade-in">
            <h4 className="text-sm font-semibold text-accent">Add Provider</h4>

            {/* Step 1 — Provider type */}
            <div>
                <label className="text-xs text-muted-foreground mb-2 block font-medium">1. Select provider type</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {PROVIDER_NAMES.map(id => {
                        const m = PROVIDER_META[id]
                        return (
                            <button key={id} onClick={() => handleProviderChange(id)}
                                className={`p-2 rounded-xl border text-center text-xs transition-all duration-300 ${providerName === id ? `${m.color} border-accent ring-2 ring-accent/30 scale-105 shadow-glass-md` : 'border-border/50 hover:bg-muted/30 hover:shadow-glass-sm'}`}
                            >
                                <div className="flex justify-center mb-1.5">
                                    <ProviderIcon providerId={id} className="w-4 h-4" />
                                </div>
                                <div className="text-[10px] leading-tight font-medium truncate">{m.name}</div>
                                {isLocalProvider(id) && <div className="mt-1 text-[9px] text-lime-300/90 font-medium">Local</div>}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Step 2 — Credentials */}
            <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium block">2. Enter credentials</label>
                {isLocalProvider(providerName) && (
                    <p className="text-[10px] text-lime-300/90">Local provider — no API key required</p>
                )}
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
                        <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 transition-colors" onClick={() => setShowAdvanced(!showAdvanced)}>
                            <Sliders className="w-3 h-3" /> {showAdvanced ? 'Hide advanced' : 'Custom Base URL'}
                        </button>
                        {showAdvanced && (
                            <div className="animate-fade-in pt-1">
                                <label className="text-[10px] text-muted-foreground mb-1 block">Base URL Override</label>
                                <input className="input text-sm" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Step 3 — Test connection */}
            <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">3. Test connection</label>
                <button className="btn-ghost text-xs border border-border w-full justify-center py-2" onClick={handleTest} disabled={testing || !canSave}>
                    {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe2 className="w-3.5 h-3.5" />}
                    {testing ? 'Testing…' : 'Test Connection'}
                </button>
                {testResult && (
                    <div className={`flex items-start gap-2 text-xs p-2.5 rounded-lg ${testResult.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-destructive/10 text-red-300 border border-destructive/20'}`}>
                        {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                        {testResult.message}
                    </div>
                )}
            </div>

            {saveError && <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-300 border border-destructive/20">{saveError}</div>}

            <button className="btn-primary w-full justify-center py-2.5" onClick={handleSave} disabled={saving || !canSave}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Provider'}
            </button>
            <p className="text-[10px] text-muted-foreground text-center">After saving, add models in the Reasoning, Vision, Embedding, or Audio tabs</p>
        </div>
    )
}

// ── Provider Card ────────────────────────────────────────────────────────────
function ProviderCard({ provider, expanded, onToggle, onDelete }: {
    provider: ProviderRow; expanded: boolean
    onToggle: () => void; onDelete: () => void
}) {
    const qc = useQueryClient()
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
    const [editApiKey, setEditApiKey] = useState('')
    const [editBaseUrl, setEditBaseUrl] = useState(provider.base_url ?? '')
    const [editDisplayName, setEditDisplayName] = useState(provider.display_name ?? '')
    const [showKey, setShowKey] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    const meta = PROVIDER_META[provider.provider_name]

    const handleTest = async () => {
        setTesting(true); setTestResult(null)
        try { setTestResult(await testConnection(provider.id)) }
        catch { setTestResult({ success: false, message: 'Request failed' }) }
        finally { setTesting(false) }
    }

    const handleSave = async () => {
        setSaving(true)
        await updateProvider(provider.id, {
            display_name: editDisplayName || undefined,
            api_key: editApiKey || undefined,
            base_url: editBaseUrl || undefined,
        })
        qc.invalidateQueries({ queryKey: ['providers'] })
        setSaving(false); setSaved(true); setEditApiKey('')
        setTimeout(() => setSaved(false), 2000)
    }

    return (
        <div className="glass-card-hover transition-all duration-300">
            <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={onToggle} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
            >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${meta?.color ?? 'bg-muted border-border'}`}>
                    <ProviderIcon providerId={provider.provider_name} className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{sanitizeProviderDisplayName(provider.display_name) || provider.provider_name}</span>
                        <span className="chip-muted text-[10px]">{provider.provider_name}</span>
                        {isLocalProvider(provider.provider_name) && <span className="chip-muted text-[10px]">Local</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {provider.has_api_key ? 'Key configured' : provider.base_url ?? 'No credentials set'}
                    </p>
                </div>
                <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-ghost p-1.5 text-red-400" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></button>
                    <button className="btn-ghost p-1.5" onClick={onToggle}>
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-border/50 px-4 py-4 space-y-4 animate-fade-in">
                    {/* Edit credentials */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Edit Credentials</label>
                        <input className="input text-sm" placeholder="Display name" value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} />
                        {meta?.needsUrl && (
                            <input className="input text-sm" placeholder={meta.urlPlaceholder ?? 'Base URL'} value={editBaseUrl} onChange={e => setEditBaseUrl(e.target.value)} />
                        )}
                        <div className="relative">
                            <input
                                type={showKey ? 'text' : 'password'}
                                className="input text-sm pr-10"
                                placeholder={provider.has_api_key ? '••••••• (leave blank to keep current)' : (meta?.placeholder ?? 'API Key')}
                                value={editApiKey}
                                onChange={e => setEditApiKey(e.target.value)}
                                autoComplete="off"
                            />
                            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(v => !v)}>
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {!meta?.needsUrl && (
                            <input className="input text-sm" placeholder="Base URL override (optional)" value={editBaseUrl} onChange={e => setEditBaseUrl(e.target.value)} />
                        )}
                        <button className="btn-primary text-xs py-1.5 px-3" onClick={handleSave} disabled={saving}>
                            {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5" /> Save Changes</>}
                        </button>
                    </div>

                    {/* Test connection */}
                    <div className="space-y-2 pt-2 border-t border-border/30">
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

type PromptsSubTab = 'agent' | 'knowledge' | 'extraction'

const PROMPTS_SUB_TABS: Array<{ id: PromptsSubTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'agent', label: 'Agent Prompts', icon: Bot },
    { id: 'knowledge', label: 'Knowledge Intelligence', icon: Brain },
    { id: 'extraction', label: 'Content Extraction', icon: FileText },
]

function PromptsTab() {
    const [activeSubTab, setActiveSubTab] = useState<PromptsSubTab>('agent')
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

    // Map prompts to sub-tabs based on their role
    const promptsBySubTab = useMemo(() => {
        const result: Record<PromptsSubTab, PromptEntry[]> = {
            agent: [],
            knowledge: [],
            extraction: [],
        }
        for (const p of (prompts as PromptEntry[])) {
            // Categorize based on role field
            if (p.role === 'agent' || p.role === 'chat') {
                result.agent.push(p)
            } else if (p.role === 'knowledge' || p.role === 'intelligence') {
                result.knowledge.push(p)
            } else if (p.role === 'extraction' || p.role === 'content') {
                result.extraction.push(p)
            } else {
                // Fallback to category-based mapping
                if (p.category === 'chat') {
                    result.agent.push(p)
                } else if (p.category === 'knowledge') {
                    result.knowledge.push(p)
                } else {
                    result.extraction.push(p)
                }
            }
        }
        return result
    }, [prompts])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <div className="flex shrink-0 gap-2 p-1.5 glass-card w-fit rounded-2xl overflow-x-auto min-h-[48px]">
                {PROMPTS_SUB_TABS.map(tab => {
                    const Icon = tab.icon
                    const count = promptsBySubTab[tab.id].length
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id)}
                            className={`flex min-h-8 items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium rounded-xl transition-all duration-300 whitespace-nowrap ${activeSubTab === tab.id
                                ? 'bg-accent/20 text-accent shadow-glass-inset ring-1 ring-accent/30'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeSubTab === tab.id ? 'bg-accent/20' : 'bg-muted/40'}`}>
                                {count}
                            </span>
                        </button>
                    )
                })}
            </div>

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

            <PromptsSubTabContent
                prompts={promptsBySubTab[activeSubTab]}
                drafts={drafts}
                saving={saving}
                saved={saved}
                onSave={handleSave}
                onReset={handleReset}
                onInsertVariable={insertVariable}
                setDrafts={setDrafts}
            />
        </div>
    )
}

function PromptsSubTabContent({
    prompts,
    drafts,
    saving,
    saved,
    onSave,
    onReset,
    onInsertVariable,
    setDrafts,
}: {
    prompts: PromptEntry[]
    drafts: Record<string, string>
    saving: Record<string, boolean>
    saved: Record<string, boolean>
    onSave: (p: PromptEntry) => void
    onReset: (p: PromptEntry) => void
    onInsertVariable: (promptId: string, variable: string) => void
    setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
    if (prompts.length === 0) {
        return (
            <div className="text-center py-14 text-muted-foreground glass-card rounded-xl">
                <Sliders className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No prompts in this category.</p>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {prompts.map(p => {
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
                                        onClick={() => onInsertVariable(p.id, v)}
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
                                onClick={() => onSave(p)}
                            >
                                {saving[p.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved[p.id] ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                                {saved[p.id] ? 'Saved!' : 'Save override'}
                            </button>
                            {hasOverride && (
                                <button
                                    className="btn-ghost text-xs py-1.5 px-3 text-muted-foreground"
                                    disabled={saving[p.id]}
                                    onClick={() => onReset(p)}
                                >
                                    <RotateCcw className="w-3.5 h-3.5" /> Reset to default
                                </button>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ── Jobs Tab ──────────────────────────────────────────────────────────────────
type JobsSubTab = 'schedules' | 'automated-triggers'

function JobsTab() {
    const [activeSubTab, setActiveSubTab] = useState<JobsSubTab>('schedules')

    const tabs: Array<{ id: JobsSubTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
        { id: 'schedules', label: 'Schedules', icon: Timer },
        { id: 'automated-triggers', label: 'Automated Triggers', icon: Zap },
    ]

    return (
        <div className="space-y-5">
            <div className="flex shrink-0 gap-2 p-1.5 glass-card w-fit rounded-2xl overflow-x-auto min-h-[48px]">
                {tabs.map(tab => {
                    const Icon = tab.icon
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id)}
                            className={`flex min-h-8 items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium rounded-xl transition-all duration-300 whitespace-nowrap ${activeSubTab === tab.id
                                ? 'bg-accent/20 text-accent shadow-glass-inset ring-1 ring-accent/30'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            {activeSubTab === 'schedules' ? <SchedulesTab /> : <AutomatedTriggersTab />}
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

const AUTO_KNOWLEDGE_INTELLIGENCE_KEY = 'automation.auto_knowledge_intelligence_enabled'
const AUTO_BOOKMARK_EXTRACTION_KEY = 'automation.auto_bookmark_content_extraction_enabled'

const CHAT_TRASH_RETENTION_KEY = 'chat.trash_retention_days'
const DEFAULT_CHAT_TRASH_RETENTION_DAYS = 30
const MIN_CHAT_TRASH_RETENTION_DAYS = 1
const MAX_CHAT_TRASH_RETENTION_DAYS = 365

function parseBoolSetting(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true
        if (['false', '0', 'no', 'off'].includes(normalized)) return false
    }
    return fallback
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

function AutomatedTriggersTab() {
    const qc = useQueryClient()
    const { data: settings = [], isLoading } = useQuery<Array<{ key: string; value: unknown; category: string }>>({
        queryKey: ['app-settings'],
        queryFn: listSettings,
    })
    const [savingKey, setSavingKey] = useState<string | null>(null)

    const autoKnowledgeEnabled = useMemo(() => {
        const raw = settings.find(item => item.key === AUTO_KNOWLEDGE_INTELLIGENCE_KEY)?.value
        return parseBoolSetting(raw, true)
    }, [settings])

    const autoBookmarkEnabled = useMemo(() => {
        const raw = settings.find(item => item.key === AUTO_BOOKMARK_EXTRACTION_KEY)?.value
        return parseBoolSetting(raw, true)
    }, [settings])

    const toggleSetting = async (key: string, currentValue: boolean) => {
        setSavingKey(key)
        await updateSetting(key, {
            value: !currentValue,
            category: 'automation',
            sensitive: false,
        })
        qc.invalidateQueries({ queryKey: ['app-settings'] })
        setSavingKey(null)
    }

    if (isLoading) return (
        <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
    )

    return (
        <div className="space-y-4">
            <div className="glass-card p-4 border-accent/20 bg-accent/5">
                <div className="flex items-start gap-3">
                    <Zap className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <div className="text-sm flex-1 min-w-0">
                        <p className="font-medium mb-1">Automated Triggers</p>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                            Control which job triggers run automatically when new knowledge is created.
                        </p>
                    </div>
                </div>
            </div>

            <button
                type="button"
                className="w-full rounded-xl border border-border/60 bg-muted/20 p-4 text-left hover:bg-muted/30 transition-colors disabled:opacity-70"
                onClick={() => { void toggleSetting(AUTO_KNOWLEDGE_INTELLIGENCE_KEY, autoKnowledgeEnabled) }}
                disabled={savingKey === AUTO_KNOWLEDGE_INTELLIGENCE_KEY}
            >
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                        <Star className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Knowledge Intelligence On Create</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Auto-generate title, keywords, summary, and insights when new Note knowledge is created.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {savingKey === AUTO_KNOWLEDGE_INTELLIGENCE_KEY && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                        <TogglePill checked={autoKnowledgeEnabled} />
                    </div>
                </div>
            </button>

            <button
                type="button"
                className="w-full rounded-xl border border-border/60 bg-muted/20 p-4 text-left hover:bg-muted/30 transition-colors disabled:opacity-70"
                onClick={() => { void toggleSetting(AUTO_BOOKMARK_EXTRACTION_KEY, autoBookmarkEnabled) }}
                disabled={savingKey === AUTO_BOOKMARK_EXTRACTION_KEY}
            >
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-400/30 flex items-center justify-center text-blue-300">
                        <Globe2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Bookmark Content Extraction On Create</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Auto-run bookmark extraction when bookmark knowledge is created or link-based knowledge is discovered.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {savingKey === AUTO_BOOKMARK_EXTRACTION_KEY && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                        <TogglePill checked={autoBookmarkEnabled} />
                    </div>
                </div>
            </button>
        </div>
    )
}

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
// ── Tools Tab ─────────────────────────────────────────────────────────────────
interface ToolParam {
    name: string
    type: string
    description?: string
    required: boolean
    enumValues?: string[]
    default?: unknown
}

interface ToolMeta {
    id: string
    category: string
    display_name: string
    description: string
    input_schema: {
        type: string
        properties?: Record<string, {
            type?: string
            description?: string
            enum?: string[]
            default?: unknown
            items?: { type?: string }
        }>
        required?: string[]
    }
    risk_level: string
}

const RISK_STYLES: Record<string, string> = {
    low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    high: 'bg-red-500/10 text-red-400 border-red-500/20',
    critical: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    filesystem: <FolderOpen className="w-4 h-4" />,
    http: <Globe className="w-4 h-4" />,
    shell: <Terminal className="w-4 h-4" />,
    memory: <Brain className="w-4 h-4" />,
    git: <GitBranch className="w-4 h-4" />,
    task: <Target className="w-4 h-4" />,
    language: <FileText className="w-4 h-4" />,
    skills: <Wrench className="w-4 h-4" />,
}

function extractParams(tool: ToolMeta): ToolParam[] {
    const props = tool.input_schema?.properties ?? {}
    const required = new Set(tool.input_schema?.required ?? [])
    return Object.entries(props).map(([name, schema]) => ({
        name,
        type: schema.type === 'array' && schema.items?.type ? `${schema.type}<${schema.items.type}>` : (schema.type ?? 'any'),
        description: schema.description,
        required: required.has(name),
        enumValues: schema.enum,
        default: schema.default,
    }))
}

const PERMISSION_OPTIONS = [
    { value: 'default', label: 'Default', active: 'text-muted-foreground bg-muted/30 ring-1 ring-border/50', inactive: 'text-muted-foreground/40' },
    { value: 'allowed', label: 'Allowed', active: 'text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/30', inactive: 'text-muted-foreground/40' },
    { value: 'hitl', label: 'HITL', active: 'text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/30', inactive: 'text-muted-foreground/40' },
    { value: 'blocked', label: 'Blocked', active: 'text-red-400 bg-red-500/10 ring-1 ring-red-500/30', inactive: 'text-muted-foreground/40' },
] as const

function ToolCard({ tool, permission, onPermissionChange }: {
    tool: ToolMeta
    permission: string
    onPermissionChange: (toolId: string, perm: string) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [showRaw, setShowRaw] = useState(false)
    const params = extractParams(tool)
    const action = tool.id.split('.').slice(1).join('.')

    return (
        <div className="glass-card rounded-xl border-border/50 overflow-hidden">
            <div className="flex items-start">
                <button
                    type="button"
                    className="flex-1 flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                    onClick={() => setExpanded(v => !v)}
                >
                    {expanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{tool.display_name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${RISK_STYLES[tool.risk_level] ?? RISK_STYLES.low}`}>
                                {tool.risk_level}
                            </span>
                            {params.length > 0 && (
                                <span className="text-[10px] text-muted-foreground/60">{params.length} param{params.length !== 1 ? 's' : ''}</span>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</p>
                        <p className="text-[10px] font-mono text-accent/60 mt-0.5">
                            <span className="text-muted-foreground/50">{tool.category}</span>
                            <span className="text-muted-foreground/30">.</span>
                            {action}
                        </p>
                    </div>
                </button>

                {/* Permission selector */}
                <div className="flex items-center gap-0.5 px-3 py-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {PERMISSION_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onPermissionChange(tool.id, opt.value)}
                            className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
                                permission === opt.value
                                    ? opt.active
                                    : `${opt.inactive} hover:text-muted-foreground/70 hover:bg-muted/20`
                            }`}
                            title={`Set permission to ${opt.label}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {expanded && (
                <div className="border-t border-border/40 px-4 py-3 space-y-3 animate-fade-in">
                    {/* Full description */}
                    <p className="text-xs text-foreground/70 leading-relaxed">{tool.description}</p>

                    {/* Parameters table */}
                    {params.length > 0 && (
                        <div>
                            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">Parameters</div>
                            <div className="overflow-x-auto rounded-lg border border-border/40">
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr className="border-b border-border/40 bg-muted/20">
                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground/80">Name</th>
                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground/80">Type</th>
                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground/80">Req</th>
                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground/80">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {params.map(p => (
                                            <tr key={p.name} className="border-b border-border/30 last:border-0">
                                                <td className="px-3 py-1.5 font-mono text-accent/80">{p.name}</td>
                                                <td className="px-3 py-1.5 font-mono text-blue-400/80">{p.type}</td>
                                                <td className="px-3 py-1.5">
                                                    {p.required
                                                        ? <span className="text-amber-400">●</span>
                                                        : <span className="text-muted-foreground/40">○</span>}
                                                </td>
                                                <td className="px-3 py-1.5 text-muted-foreground">
                                                    {p.description ?? '—'}
                                                    {p.enumValues && (
                                                        <span className="ml-1 text-purple-400/80">
                                                            [{p.enumValues.join(', ')}]
                                                        </span>
                                                    )}
                                                    {p.default !== undefined && (
                                                        <span className="ml-1 text-muted-foreground/50">
                                                            (default: {String(p.default)})
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {params.length === 0 && (
                        <p className="text-xs text-muted-foreground/50 italic">No parameters — call with empty object.</p>
                    )}

                    {/* Raw schema toggle */}
                    <div>
                        <button
                            type="button"
                            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 transition-colors"
                            onClick={() => setShowRaw(v => !v)}
                        >
                            {showRaw ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            Raw JSON schema
                        </button>
                        {showRaw && (
                            <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-foreground/60 bg-muted/30 rounded-lg p-3 border border-border/40 max-h-64">
                                {JSON.stringify(tool.input_schema, null, 2)}
                            </pre>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function ToolsTab() {
    const qc = useQueryClient()
    const [query, setQuery] = useState('')
    const [activeCategory, setActiveCategory] = useState<string>('all')

    const { data, isLoading } = useQuery({
        queryKey: ['tool-registry'],
        queryFn: getToolRegistry,
        retry: false,
        staleTime: 60_000,
    })

    const { data: permData } = useQuery({
        queryKey: ['tool-permissions'],
        queryFn: listToolPermissions,
        retry: false,
        staleTime: 30_000,
    })

    // Build permission lookup map: tool_id → permission string
    const permMap = useMemo(() => {
        const m: Record<string, string> = {}
        if (Array.isArray(permData)) {
            for (const p of permData) m[p.tool_id] = p.permission
        }
        return m
    }, [permData])

    const handlePermissionChange = useCallback(async (toolId: string, perm: string) => {
        try {
            await setToolPermission(toolId, perm)
            qc.invalidateQueries({ queryKey: ['tool-permissions'] })
        } catch {
            // toast handled by axios interceptor
        }
    }, [qc])

    const tools: ToolMeta[] = data?.tools ?? []
    const available: boolean = data?.tool_server_available !== false

    const categories = ['all', ...Array.from(new Set(tools.map(t => t.category))).sort()]

    const filtered = tools.filter(t => {
        const matchCat = activeCategory === 'all' || t.category === activeCategory
        const q = query.toLowerCase()
        const matchQ = !q || t.id.includes(q) || t.display_name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
        return matchCat && matchQ
    })

    const grouped = filtered.reduce<Record<string, ToolMeta[]>>((acc, t) => {
        ;(acc[t.category] ??= []).push(t)
        return acc
    }, {})

    return (
        <div className="space-y-5">
            <div>
                <h3 className="font-semibold text-sm">Agent Tools</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    All tools available to the agent. Tools are provided by the <span className="font-mono text-accent">tool-server</span> and executed in the workspace container.
                </p>
            </div>

            {!available && !isLoading && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                        <span className="font-medium">Tool server not running.</span>{' '}
                        Start the <span className="font-mono">tool-server</span> container to see registered tools.
                    </span>
                </div>
            )}

            {isLoading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {!isLoading && available && (
                <>
                    {/* Search + category filter */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                            <input
                                className="input text-sm pl-8"
                                placeholder="Search tools by name, ID, or description…"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-1 flex-wrap">
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setActiveCategory(cat)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${activeCategory === cat
                                        ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}
                                >
                                    {cat !== 'all' && (CATEGORY_ICONS[cat] ?? <Wrench className="w-3.5 h-3.5" />)}
                                    {cat === 'all' ? `All (${tools.length})` : cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tool groups */}
                    {filtered.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground glass-card rounded-xl">
                            <Settings2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No tools match your search.</p>
                        </div>
                    )}

                    {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, catTools]) => (
                        <div key={cat} className="space-y-2">
                            <div className="flex items-center gap-2 py-1">
                                <span className="text-muted-foreground/60">{CATEGORY_ICONS[cat] ?? <Wrench className="w-4 h-4" />}</span>
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground capitalize">{cat}</h4>
                                <span className="text-[10px] text-muted-foreground/50">{catTools.length} tool{catTools.length !== 1 ? 's' : ''}</span>
                                <div className="flex-1 h-px bg-border/40" />
                            </div>
                            {catTools.map(tool => (
                                <ToolCard
                                    key={tool.id}
                                    tool={tool}
                                    permission={permMap[tool.id] ?? 'default'}
                                    onPermissionChange={handlePermissionChange}
                                />
                            ))}
                        </div>
                    ))}
                </>
            )}
        </div>
    )
}

// ── Skills Tab ────────────────────────────────────────────────────────────────
interface InstalledSkill {
    name: string
    description: string
    path: string
}

function SkillsTab() {
    const qc = useQueryClient()
    const { data: skillsData, isLoading: loadingList } = useQuery({
        queryKey: ['installed-skills'],
        queryFn: listInstalledSkills,
        retry: false,
    })
    const installedSkills: InstalledSkill[] = skillsData?.skills ?? []
    const toolServerUnavailable = skillsData?.tool_server_available === false

    // Install panel state
    const [source, setSource] = useState('')
    const [skillNames, setSkillNames] = useState('')
    const [installing, setInstalling] = useState(false)
    const [installResult, setInstallResult] = useState<{ ok: boolean; message: string } | null>(null)

    // Search panel state
    const [searchSource, setSearchSource] = useState('')
    const [searching, setSearching] = useState(false)
    const [searchOutput, setSearchOutput] = useState<string | null>(null)
    const [searchError, setSearchError] = useState<string | null>(null)

    const [removing, setRemoving] = useState<string | null>(null)

    const handleInstall = async () => {
        if (!source.trim()) return
        setInstalling(true)
        setInstallResult(null)
        try {
            const names = skillNames.split(',').map(s => s.trim()).filter(Boolean)
            await installSkill(source.trim(), names.length ? names : undefined)
            setInstallResult({ ok: true, message: 'Skills installed successfully.' })
            setSource('')
            setSkillNames('')
            qc.invalidateQueries({ queryKey: ['installed-skills'] })
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(err)
            setInstallResult({ ok: false, message: msg })
        } finally {
            setInstalling(false)
        }
    }

    const handleSearch = async () => {
        if (!searchSource.trim()) return
        setSearching(true)
        setSearchOutput(null)
        setSearchError(null)
        try {
            const result = await searchSkills(searchSource.trim())
            setSearchOutput(result?.available_skills ?? JSON.stringify(result))
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(err)
            setSearchError(msg)
        } finally {
            setSearching(false)
        }
    }

    const handleRemove = async (name: string) => {
        if (!confirm(`Remove skill "${name}"?`)) return
        setRemoving(name)
        try {
            await removeSkill(name)
            qc.invalidateQueries({ queryKey: ['installed-skills'] })
        } finally {
            setRemoving(null)
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="font-semibold text-sm">Agent Skills</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Install and manage reusable agent skill sets from GitHub repositories using the{' '}
                    <span className="font-mono text-accent">skills.sh</span> CLI.
                    Installed skills are shared across all workspaces.
                </p>
            </div>

            {toolServerUnavailable && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                        <span className="font-medium">Tool server not running.</span> The skills feature requires the{' '}
                        <span className="font-mono">tool-server</span> container. Start it with the full{' '}
                        <span className="font-mono">docker-compose.yml</span> to manage skills.
                    </span>
                </div>
            )}

            {/* Install */}
            <div className="glass-card p-4 space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2"><Plus className="w-3.5 h-3.5 text-accent" /> Install Skills</h4>
                <div className="space-y-2">
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">GitHub source</label>
                        <input
                            className="input text-sm"
                            placeholder="owner/repo  or  https://github.com/owner/repo"
                            value={source}
                            onChange={e => setSource(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void handleInstall() }}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                            Skill names <span className="opacity-60">(comma-separated, leave blank to install all)</span>
                        </label>
                        <input
                            className="input text-sm"
                            placeholder="react-best-practices, web-design-guidelines"
                            value={skillNames}
                            onChange={e => setSkillNames(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void handleInstall() }}
                        />
                    </div>
                </div>
                <button
                    className="btn-primary text-xs py-1.5 px-3"
                    onClick={handleInstall}
                    disabled={installing || !source.trim()}
                >
                    {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {installing ? 'Installing…' : 'Install'}
                </button>
                {installResult && (
                    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${installResult.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        {installResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                        {installResult.message}
                    </div>
                )}
            </div>

            {/* Discover */}
            <div className="glass-card p-4 space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2"><Search className="w-3.5 h-3.5 text-accent" /> Discover Skills</h4>
                <div className="flex gap-2">
                    <input
                        className="input text-sm flex-1"
                        placeholder="owner/repo to browse available skills"
                        value={searchSource}
                        onChange={e => setSearchSource(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void handleSearch() }}
                    />
                    <button
                        className="btn-ghost text-xs py-1.5 px-3"
                        onClick={handleSearch}
                        disabled={searching || !searchSource.trim()}
                    >
                        {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        Browse
                    </button>
                </div>
                {searchOutput && (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-foreground/70 bg-muted/30 rounded-lg p-3 max-h-48 border border-border/40">
                        {searchOutput}
                    </pre>
                )}
                {searchError && (
                    <p className="text-xs text-red-400">{searchError}</p>
                )}
            </div>

            {/* Installed list */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Installed Skills ({installedSkills.length})</h4>
                    <button className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5" onClick={() => qc.invalidateQueries({ queryKey: ['installed-skills'] })}>
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                </div>

                {loadingList && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                )}

                {!loadingList && installedSkills.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground glass-card rounded-xl">
                        <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No skills installed yet.</p>
                        <p className="text-xs mt-1 opacity-60">Use the install panel above or ask the agent to install a skill.</p>
                    </div>
                )}

                {!loadingList && installedSkills.length > 0 && (
                    <div className="space-y-2">
                        {installedSkills.map(skill => (
                            <div key={skill.name} className="glass-card px-4 py-3 flex items-start gap-3 rounded-xl border-border/50">
                                <Wrench className="w-4 h-4 text-accent/60 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <span className="font-medium text-sm">{skill.name}</span>
                                    {skill.description && (
                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{skill.description}</p>
                                    )}
                                    <p className="text-[10px] font-mono text-muted-foreground/50 mt-1 truncate">{skill.path}</p>
                                </div>
                                <button
                                    className="btn-ghost p-1.5 text-red-400 hover:bg-destructive/10 flex-shrink-0"
                                    onClick={() => void handleRemove(skill.name)}
                                    disabled={removing === skill.name}
                                    title="Remove skill"
                                >
                                    {removing === skill.name
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

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
    embed_knowledge: 'Embed Knowledge',
    generate_knowledge_intelligence: 'Generate Knowledge Intelligence',
    extract_bookmark_content: 'Extract Bookmark Content',
    extract_url_content: 'Extract URL Content',
    extract_attachment_content: 'Extract Attachment Content',
    generate_titles: 'Generate Titles',
    extract_insights: 'Extract Insights',
    scrape_bookmarks: 'Scrape Bookmarks',
    cleanup_embeddings: 'Clean Up Embeddings',
    purge_chat_trash: 'Purge Chat Trash',
    summarize_knowledge: 'Summarize Knowledge',
    extract_knowledge_insights: 'Extract Knowledge Insights',
    generate_knowledge_title: 'Generate Knowledge Title',
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

// ── HITL Dashboard Tab ────────────────────────────────────────────────────────
interface HITLRequest {
    id: string
    execution_id: string | null
    workspace_id: string
    tool_call_id: string
    tool_name: string
    tool_arguments: Record<string, unknown>
    risk_level: string
    status: string
    resolution_note: string | null
    created_at: string
    resolved_at: string | null
    resolved_by: string | null
}

function HITLDashboardTab() {
    const qc = useQueryClient()
    const [subTab, setSubTab] = useState<'pending' | 'history'>('pending')

    const { data: pendingData, isLoading: loadingPending } = useQuery({
        queryKey: ['hitl-pending'],
        queryFn: listPendingHITL,
        refetchInterval: 5_000,
    })
    const pending: HITLRequest[] = pendingData ?? []

    const { data: historyData, isLoading: loadingHistory } = useQuery({
        queryKey: ['hitl-history'],
        queryFn: () => getHITLHistory({ limit: 100 }),
        enabled: subTab === 'history',
    })
    const history: HITLRequest[] = historyData ?? []

    const [actionNote, setActionNote] = useState('')
    const [acting, setActing] = useState<string | null>(null)

    const handleApprove = async (id: string) => {
        setActing(id)
        try {
            await approveHITL(id, actionNote || undefined)
            setActionNote('')
            qc.invalidateQueries({ queryKey: ['hitl-pending'] })
            qc.invalidateQueries({ queryKey: ['hitl-history'] })
        } finally {
            setActing(null)
        }
    }

    const handleDeny = async (id: string) => {
        setActing(id)
        try {
            await denyHITL(id, actionNote || undefined)
            setActionNote('')
            qc.invalidateQueries({ queryKey: ['hitl-pending'] })
            qc.invalidateQueries({ queryKey: ['hitl-history'] })
        } finally {
            setActing(null)
        }
    }

    return (
        <div className="space-y-5">
            <div>
                <h3 className="font-semibold text-sm">Human-in-the-Loop</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Review and approve or deny tool calls that require human oversight. Configure per-tool permissions in the Native Tools tab.
                </p>
            </div>

            {/* Sub-tab selector */}
            <div className="flex gap-1 p-1 glass-card rounded-xl w-fit">
                {(['pending', 'history'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setSubTab(tab)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                            subTab === tab
                                ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                    >
                        {tab === 'pending' && <ShieldAlert className="w-3.5 h-3.5" />}
                        {tab === 'history' && <History className="w-3.5 h-3.5" />}
                        {tab}
                        {tab === 'pending' && pending.length > 0 && (
                            <span className="ml-1 text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-semibold">
                                {pending.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {subTab === 'pending' && (
                <div className="space-y-3">
                    {loadingPending && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {!loadingPending && pending.length === 0 && (
                        <div className="text-center py-16 text-muted-foreground glass-card rounded-xl">
                            <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No pending approvals.</p>
                            <p className="text-xs mt-1 opacity-60">Tool calls requiring review will appear here.</p>
                        </div>
                    )}

                    {pending.map(req => (
                        <div key={req.id} className="glass-card rounded-xl p-4 space-y-3 border-amber-500/20">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-sm">{req.tool_name}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${RISK_STYLES[req.risk_level] ?? RISK_STYLES.medium}`}>
                                            {req.risk_level}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                                        {new Date(req.created_at).toLocaleString()}
                                        {req.execution_id && <span className="ml-2">Execution: {req.execution_id.slice(0, 8)}…</span>}
                                    </p>
                                </div>
                            </div>

                            {/* Arguments preview */}
                            <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-foreground/60 bg-muted/30 rounded-lg p-3 border border-border/40 max-h-40">
                                {JSON.stringify(req.tool_arguments, null, 2)}
                            </pre>

                            {/* Action row */}
                            <div className="flex items-center gap-2">
                                <input
                                    className="input text-xs flex-1"
                                    placeholder="Optional note…"
                                    value={acting === req.id ? actionNote : ''}
                                    onChange={e => { setActing(req.id); setActionNote(e.target.value) }}
                                />
                                <button
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                                    onClick={() => void handleApprove(req.id)}
                                    disabled={acting === req.id}
                                >
                                    {acting === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    Approve
                                </button>
                                <button
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                                    onClick={() => void handleDeny(req.id)}
                                    disabled={acting === req.id}
                                >
                                    {acting === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                    Deny
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {subTab === 'history' && (
                <div className="space-y-3">
                    {loadingHistory && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {!loadingHistory && history.length === 0 && (
                        <div className="text-center py-16 text-muted-foreground glass-card rounded-xl">
                            <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No HITL history yet.</p>
                        </div>
                    )}

                    {history.map(req => (
                        <div key={req.id} className="glass-card rounded-xl px-4 py-3 flex items-center gap-3">
                            {req.status === 'approved' && <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                            {req.status === 'denied' && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                            {req.status !== 'approved' && req.status !== 'denied' && <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{req.tool_name}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                                        req.status === 'approved'
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : req.status === 'denied'
                                                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                                : 'bg-muted/30 text-muted-foreground border-border/40'
                                    }`}>
                                        {req.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-0.5">
                                    <span className="text-[10px] text-muted-foreground/60">
                                        {new Date(req.created_at).toLocaleString()}
                                    </span>
                                    {req.resolution_note && (
                                        <span className="text-[10px] text-muted-foreground/50 truncate">
                                            {req.resolution_note}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function AuditTab() {
    const [subTab, setSubTab] = useState<'history' | 'tool-calls' | 'logs'>('history')

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
                    onClick={() => setSubTab('tool-calls')}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 whitespace-nowrap ${subTab === 'tool-calls'
                        ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                >
                    <Wrench className="w-4 h-4" /> Tool Calls
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

            {subTab === 'history' && <JobHistorySubTab />}
            {subTab === 'tool-calls' && <ToolCallLogsSubTab />}
            {subTab === 'logs' && (
                <div className="min-h-0 flex-1">
                    <ContainerLogsSubTab />
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

interface ToolCallLogEntry {
    id: string
    workspace_id: string | null
    conversation_id: string
    call_id: string
    tool_name: string
    arguments: Record<string, unknown> | null
    success: boolean | null
    output: string | null
    error: string | null
    duration_ms: number | null
    started_at: string
    finished_at: string | null
}

function ToolCallLogsSubTab() {
    const [filterTool, setFilterTool] = useState('')
    const [expanded, setExpanded] = useState<string | null>(null)

    const { data: logs = [], isLoading, refetch } = useQuery<ToolCallLogEntry[]>({
        queryKey: ['tool-call-logs', filterTool],
        queryFn: () => getToolCallLogs({ tool_name: filterTool || undefined, limit: 100 }),
        refetchInterval: false,
    })

    const formatDuration = (ms: number | null) => {
        if (!ms) return '—'
        if (ms < 1000) return `${ms}ms`
        return `${(ms / 1000).toFixed(1)}s`
    }

    const toolNames = Array.from(new Set((logs as ToolCallLogEntry[]).map(l => l.tool_name))).sort()

    return (
        <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-sm">Agent Tool Call Executions</h3>
                <div className="flex items-center gap-2">
                    <select
                        className="input text-xs py-1.5 pr-7 w-auto"
                        value={filterTool}
                        onChange={e => setFilterTool(e.target.value)}
                    >
                        <option value="">All tools</option>
                        {toolNames.map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                    <button className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5" onClick={() => refetch()}>
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                </div>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {!isLoading && (logs as ToolCallLogEntry[]).length === 0 && (
                <div className="text-center py-14 text-muted-foreground glass-card rounded-xl">
                    <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No tool calls logged yet. Enable agent mode and run a chat to see logs here.</p>
                </div>
            )}

            {!isLoading && (logs as ToolCallLogEntry[]).length > 0 && (
                <div className="space-y-2">
                    {(logs as ToolCallLogEntry[]).map(log => {
                        const isOpen = expanded === log.id
                        const category = log.tool_name.split('.')[0] ?? log.tool_name
                        const action = log.tool_name.split('.').slice(1).join('.')
                        return (
                            <div key={log.id} className="glass-card rounded-xl border-border/50 overflow-hidden">
                                <button
                                    type="button"
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                                    onClick={() => setExpanded(isOpen ? null : log.id)}
                                >
                                    {isOpen
                                        ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                                    {log.success === true
                                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                        : log.success === false
                                            ? <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                            : <Circle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium">
                                            <span className="text-muted-foreground">{category}</span>
                                            {action && <><span className="text-muted-foreground/50">.</span><span>{action}</span></>}
                                        </span>
                                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                                            <span>{new Date(log.started_at).toLocaleString()}</span>
                                            {log.duration_ms !== null && <span>{formatDuration(log.duration_ms)}</span>}
                                            <span className="font-mono truncate max-w-[180px]" title={log.conversation_id}>
                                                conv: {log.conversation_id.slice(0, 8)}…
                                            </span>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${log.success === true ? 'bg-emerald-500/10 text-emerald-400' : log.success === false ? 'bg-red-500/10 text-red-400' : 'bg-muted text-muted-foreground'}`}>
                                        {log.success === true ? 'success' : log.success === false ? 'failed' : 'unknown'}
                                    </span>
                                </button>

                                {isOpen && (
                                    <div className="border-t border-border/40 px-4 py-3 space-y-3 animate-fade-in">
                                        <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                                            <div><span className="text-foreground/60">Call ID:</span> <span className="font-mono">{log.call_id}</span></div>
                                            <div><span className="text-foreground/60">Conversation:</span> <span className="font-mono">{log.conversation_id}</span></div>
                                            {log.started_at && <div><span className="text-foreground/60">Started:</span> {new Date(log.started_at).toLocaleString()}</div>}
                                            {log.finished_at && <div><span className="text-foreground/60">Finished:</span> {new Date(log.finished_at).toLocaleString()}</div>}
                                            {log.duration_ms !== null && <div><span className="text-foreground/60">Duration:</span> {formatDuration(log.duration_ms)}</div>}
                                        </div>

                                        {log.arguments && Object.keys(log.arguments).length > 0 && (
                                            <div>
                                                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">Request (Arguments)</div>
                                                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-foreground/70 bg-muted/30 rounded-lg p-3 max-h-48 border border-border/40">
                                                    {JSON.stringify(log.arguments, null, 2)}
                                                </pre>
                                            </div>
                                        )}

                                        {log.success && log.output !== null && (
                                            <div>
                                                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">Response (Output)</div>
                                                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-foreground/70 bg-muted/30 rounded-lg p-3 max-h-64 border border-border/40">
                                                    {log.output}
                                                </pre>
                                            </div>
                                        )}

                                        {!log.success && log.error && (
                                            <div>
                                                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">Response (Error)</div>
                                                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-red-400 bg-red-500/10 rounded-lg p-3 max-h-32 border border-red-500/20">
                                                    {log.error}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function ContainerLogsSubTab() {
    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const wsId = (workspaces as { id: string }[])[0]?.id ?? ''
    const { send, on, isConnected } = useWorkspaceWebSocket(wsId)
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
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="relative shrink-0">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search logs..."
                        className="input text-xs py-1.5 pl-8 pr-3 w-48"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>
                <select
                    className="input text-xs py-1.5 pr-7 w-auto shrink-0"
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
                    className="input text-xs py-1.5 pr-7 min-w-[170px] shrink-0"
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
                <button
                    className={`btn-ghost text-xs py-1.5 px-2.5 gap-1.5 shrink-0 ${paused ? 'text-accent bg-accent/10' : ''}`}
                    onClick={() => setPaused(p => !p)}
                >
                    {paused ? <Play className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    {paused ? 'Resume' : 'Pause'}
                </button>
                <button
                    className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 shrink-0"
                    onClick={() => setLogs([])}
                >
                    <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
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

// ── MCP Tab ───────────────────────────────────────────────────────────────────
interface MCPToolDef {
    name: string
    description: string
    inputSchema?: object
}

interface MCPServerRow {
    id: string
    name: string
    url: string
    description: string | null
    transport: string
    auth_type: string
    has_auth: boolean
    is_enabled: boolean
    discovered_tools: MCPToolDef[]
    tool_count: number
    last_discovered_at: string | null
    default_risk_level: string
    created_at: string
    updated_at: string
}

const RISK_LEVELS = ['low', 'medium', 'high', 'critical']
const RISK_BADGE: Record<string, string> = {
    low: 'bg-green-500/15 text-green-300 border-green-500/30',
    medium: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    critical: 'bg-red-500/15 text-red-300 border-red-500/30',
}

const EMPTY_FORM = {
    name: '', url: '', description: '', transport: 'http',
    auth_type: 'none', auth_value: '', is_enabled: true, default_risk_level: 'high',
}

function MCPServerForm({
    initial, onSave, onCancel, saving,
}: {
    initial: typeof EMPTY_FORM
    onSave: (data: typeof EMPTY_FORM) => void
    onCancel: () => void
    saving: boolean
}) {
    const [form, setForm] = useState(initial)
    const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <input className="input text-sm" placeholder="My GitHub Tools" value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Transport</label>
                    <select className="input text-sm" value={form.transport} onChange={e => set('transport', e.target.value)}>
                        <option value="http">HTTP Streamable (newer)</option>
                        <option value="sse">SSE (older)</option>
                    </select>
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Server URL</label>
                <input className="input text-sm font-mono" placeholder="https://mcp.example.com/sse" value={form.url} onChange={e => set('url', e.target.value)} />
            </div>
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Description <span className="opacity-50">(optional)</span></label>
                <input className="input text-sm" placeholder="GitHub repository and PR tools" value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Authentication</label>
                    <select className="input text-sm" value={form.auth_type} onChange={e => set('auth_type', e.target.value)}>
                        <option value="none">None</option>
                        <option value="bearer">Bearer Token</option>
                        <option value="api_key">API Key (X-API-Key)</option>
                        <option value="header">Custom Header (Name: value)</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Default Risk Level</label>
                    <select className="input text-sm capitalize" value={form.default_risk_level} onChange={e => set('default_risk_level', e.target.value)}>
                        {RISK_LEVELS.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                    </select>
                </div>
            </div>
            {form.auth_type !== 'none' && (
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                        {form.auth_type === 'bearer' ? 'Bearer Token' : form.auth_type === 'api_key' ? 'API Key' : 'Header (Name: value)'}
                    </label>
                    <input
                        type="password"
                        className="input text-sm font-mono"
                        placeholder={form.auth_type === 'header' ? 'X-Custom-Header: my-secret' : 'sk-…'}
                        value={form.auth_value}
                        onChange={e => set('auth_value', e.target.value)}
                    />
                </div>
            )}
            <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" className="rounded" checked={form.is_enabled} onChange={e => set('is_enabled', e.target.checked)} />
                    <span>Enabled</span>
                </label>
                <div className="flex gap-2">
                    <button className="btn-ghost text-xs py-1.5 px-3" onClick={onCancel}>Cancel</button>
                    <button
                        className="btn-primary text-xs py-1.5 px-3 gap-1.5"
                        onClick={() => onSave(form)}
                        disabled={!form.name.trim() || !form.url.trim() || saving}
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Save &amp; Discover
                    </button>
                </div>
            </div>
        </div>
    )
}

function MCPServerCard({ server, onUpdated, onDeleted }: {
    server: MCPServerRow
    onUpdated: (s: MCPServerRow) => void
    onDeleted: (id: string) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [editing, setEditing] = useState(false)
    const [discovering, setDiscovering] = useState(false)
    const [savingEdit, setSavingEdit] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [overrideSaving, setOverrideSaving] = useState<string | null>(null)

    const handleDiscover = async () => {
        setDiscovering(true)
        try {
            const updated = await discoverMCPServer(server.id)
            onUpdated(updated)
        } catch {
            /* error shown via toast or ignored */
        } finally {
            setDiscovering(false)
        }
    }

    const handleToggleEnabled = async () => {
        try {
            const updated = await updateMCPServer(server.id, { is_enabled: !server.is_enabled })
            onUpdated(updated)
        } catch { /* ignore */ }
    }

    const handleSaveEdit = async (data: typeof EMPTY_FORM) => {
        setSavingEdit(true)
        try {
            const payload: Record<string, unknown> = { ...data }
            if (!payload.auth_value) delete payload.auth_value
            const updated = await updateMCPServer(server.id, payload)
            onUpdated(updated)
            setEditing(false)
        } finally {
            setSavingEdit(false)
        }
    }

    const handleDelete = async () => {
        await deleteMCPServer(server.id)
        onDeleted(server.id)
    }

    const handleToolToggle = async (toolName: string, enabled: boolean) => {
        setOverrideSaving(toolName)
        try {
            await updateMCPToolOverride(server.id, toolName, { is_enabled: enabled })
        } finally {
            setOverrideSaving(null)
        }
    }

    const handleRiskChange = async (toolName: string, risk: string) => {
        setOverrideSaving(toolName)
        try {
            await updateMCPToolOverride(server.id, toolName, { risk_level: risk })
        } finally {
            setOverrideSaving(null)
        }
    }

    return (
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
            {/* Header row */}
            <div className="flex items-start gap-3 p-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{server.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${RISK_BADGE[server.default_risk_level] ?? RISK_BADGE.high}`}>
                            {server.default_risk_level}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/40 text-muted-foreground uppercase tracking-wide">
                            {server.transport}
                        </span>
                        {server.tool_count > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent">
                                {server.tool_count} tool{server.tool_count !== 1 ? 's' : ''}
                            </span>
                        )}
                        {!server.is_enabled && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/40 border border-border/40 text-muted-foreground">disabled</span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{server.url}</p>
                    {server.description && <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{server.description}</p>}
                    {server.last_discovered_at && (
                        <p className="text-[10px] text-muted-foreground/50 mt-1">
                            Last discovered {new Date(server.last_discovered_at).toLocaleString()}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {/* enabled toggle */}
                    <button
                        onClick={handleToggleEnabled}
                        className={`w-8 h-4.5 relative rounded-full transition-colors ${server.is_enabled ? 'bg-accent/70' : 'bg-muted/60'}`}
                        title={server.is_enabled ? 'Disable' : 'Enable'}
                    >
                        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${server.is_enabled ? 'left-4' : 'left-0.5'}`} />
                    </button>
                    <button
                        className="btn-ghost p-1.5"
                        onClick={handleDiscover}
                        disabled={discovering}
                        title="Refresh tools"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${discovering ? 'animate-spin' : ''}`} />
                    </button>
                    <button className="btn-ghost p-1.5" onClick={() => setEditing(e => !e)} title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {confirmDelete ? (
                        <div className="flex items-center gap-1">
                            <button className="btn-ghost text-[10px] py-1 px-2 text-red-400 hover:bg-red-900/20" onClick={handleDelete}>Delete</button>
                            <button className="btn-ghost text-[10px] py-1 px-2" onClick={() => setConfirmDelete(false)}>Cancel</button>
                        </div>
                    ) : (
                        <button className="btn-ghost p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20" onClick={() => setConfirmDelete(true)} title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {server.tool_count > 0 && (
                        <button className="btn-ghost p-1.5" onClick={() => setExpanded(e => !e)}>
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                    )}
                </div>
            </div>

            {/* Edit form */}
            {editing && (
                <div className="px-4 pb-4 border-t border-border/30 pt-4">
                    <MCPServerForm
                        initial={{
                            name: server.name, url: server.url,
                            description: server.description ?? '',
                            transport: server.transport, auth_type: server.auth_type,
                            auth_value: '', is_enabled: server.is_enabled,
                            default_risk_level: server.default_risk_level,
                        }}
                        onSave={handleSaveEdit}
                        onCancel={() => setEditing(false)}
                        saving={savingEdit}
                    />
                </div>
            )}

            {/* Tool list */}
            {expanded && !editing && server.discovered_tools.length > 0 && (
                <div className="border-t border-border/30">
                    <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                        Discovered Tools
                    </div>
                    <div className="divide-y divide-border/20">
                        {server.discovered_tools.map(tool => (
                            <div key={tool.name} className="px-4 py-2.5 flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-mono font-medium">{tool.name}</p>
                                    {tool.description && (
                                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <select
                                        className="text-[10px] bg-muted/30 border border-border/40 rounded px-1.5 py-0.5 capitalize cursor-pointer"
                                        defaultValue={server.default_risk_level}
                                        disabled={overrideSaving === tool.name}
                                        onChange={e => handleRiskChange(tool.name, e.target.value)}
                                    >
                                        {RISK_LEVELS.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                                    </select>
                                    <button
                                        className={`w-7 h-4 relative rounded-full transition-colors ${overrideSaving === tool.name ? 'opacity-50' : 'bg-accent/70'}`}
                                        onClick={() => handleToolToggle(tool.name, false)}
                                        title="Disable this tool"
                                        disabled={overrideSaving === tool.name}
                                    >
                                        <span className="absolute top-0.5 left-3.5 w-3 h-3 rounded-full bg-white shadow" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

function MCPTab() {
    const qc = useQueryClient()
    const { data, isLoading } = useQuery({
        queryKey: ['mcp-servers'],
        queryFn: listMCPServers,
        staleTime: 30_000,
    })
    const servers: MCPServerRow[] = data?.servers ?? []

    const [showAdd, setShowAdd] = useState(false)
    const [addSaving, setAddSaving] = useState(false)

    const handleAdd = async (form: typeof EMPTY_FORM) => {
        setAddSaving(true)
        try {
            const payload: Record<string, unknown> = { ...form }
            if (!payload.auth_value) delete payload.auth_value
            await createMCPServer(payload)
            qc.invalidateQueries({ queryKey: ['mcp-servers'] })
            setShowAdd(false)
        } finally {
            setAddSaving(false)
        }
    }

    const handleUpdated = (updated: MCPServerRow) => {
        qc.setQueryData(['mcp-servers'], (old: { servers: MCPServerRow[] } | undefined) => ({
            servers: (old?.servers ?? []).map(s => s.id === updated.id ? updated : s),
        }))
    }

    const handleDeleted = (id: string) => {
        qc.setQueryData(['mcp-servers'], (old: { servers: MCPServerRow[] } | undefined) => ({
            servers: (old?.servers ?? []).filter(s => s.id !== id),
        }))
    }

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="font-semibold text-sm">MCP Servers</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Connect external MCP (Model Context Protocol) servers to extend the agent with additional tools.
                        Discovered tools appear alongside built-in tools during agent execution.
                    </p>
                </div>
                <button
                    className="btn-primary text-xs py-1.5 px-3 gap-1.5 shrink-0"
                    onClick={() => setShowAdd(s => !s)}
                >
                    {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {showAdd ? 'Cancel' : 'Add Server'}
                </button>
            </div>

            {showAdd && (
                <div className="glass-card rounded-xl border border-accent/20 p-4 space-y-1">
                    <p className="text-xs font-semibold text-accent mb-3">New MCP Server</p>
                    <MCPServerForm
                        initial={EMPTY_FORM}
                        onSave={handleAdd}
                        onCancel={() => setShowAdd(false)}
                        saving={addSaving}
                    />
                </div>
            )}

            {isLoading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {!isLoading && servers.length === 0 && !showAdd && (
                <div className="text-center py-16 glass-card rounded-xl text-muted-foreground">
                    <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No MCP servers configured.</p>
                    <p className="text-xs mt-1 opacity-60">Add a server to extend the agent with external tools.</p>
                </div>
            )}

            <div className="space-y-3">
                {servers.map(server => (
                    <MCPServerCard
                        key={server.id}
                        server={server}
                        onUpdated={handleUpdated}
                        onDeleted={handleDeleted}
                    />
                ))}
            </div>
        </div>
    )
}

// ── Export Tab ────────────────────────────────────────────────────────────────
function ExportTab() {
    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const [exporting, setExporting] = useState<'all' | string | null>(null)
    const [exportError, setExportError] = useState<string | null>(null)

    const handleExportAll = async () => {
        setExporting('all')
        setExportError(null)
        try {
            const blob = await exportAllData()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `openforge-export-${new Date().toISOString().split('T')[0]}.zip`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ?? (err as Error)?.message ?? 'Export failed'
            setExportError(msg)
        } finally {
            setExporting(null)
        }
    }

    const handleExportWorkspace = async (wsId: string) => {
        setExporting(wsId)
        setExportError(null)
        try {
            const blob = await exportWorkspaceData(wsId)
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const ws = (workspaces as WorkspaceRow[]).find(w => w.id === wsId)
            a.download = `${ws?.name ?? 'workspace'}-export-${new Date().toISOString().split('T')[0]}.zip`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ?? (err as Error)?.message ?? 'Export failed'
            setExportError(msg)
        } finally {
            setExporting(null)
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="font-semibold text-sm">Export Data</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Download your data as ZIP archives. Exports include chat threads, knowledge, attachments, and settings.
                </p>
            </div>

            {exportError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{exportError}</span>
                </div>
            )}

            {/* Export All */}
            <div className="glass-card p-4 border-accent/20 bg-accent/5">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                            <Archive className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="font-medium text-sm">Export All Data</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Download a complete backup of all workspaces, including chat threads, knowledge, attachments, and settings configuration.
                            </p>
                        </div>
                    </div>
                    <button
                        className="btn-primary text-xs py-2 px-4 gap-2 shrink-0"
                        onClick={handleExportAll}
                        disabled={exporting !== null}
                    >
                        {exporting === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {exporting === 'all' ? 'Exporting...' : 'Export All'}
                    </button>
                </div>
            </div>

            {/* Per-workspace exports */}
            <div>
                <h4 className="text-sm font-medium mb-3">Export Individual Workspaces</h4>
                <div className="space-y-2">
                    {(workspaces as WorkspaceRow[]).map(ws => (
                        <div key={ws.id} className="glass-card px-4 py-3 flex items-center justify-between gap-3 rounded-xl border-border/50">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                                    {getWorkspaceIcon(ws.icon)}
                                </div>
                                <div>
                                    <span className="font-medium text-sm">{ws.name}</span>
                                    <p className="text-xs text-muted-foreground">
                                        {ws.knowledge_count} knowledge · {ws.conversation_count} chats
                                    </p>
                                </div>
                            </div>
                            <button
                                className="btn-ghost text-xs py-1.5 px-3 gap-1.5 shrink-0"
                                onClick={() => handleExportWorkspace(ws.id)}
                                disabled={exporting !== null}
                            >
                                {exporting === ws.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />}
                                {exporting === ws.id ? 'Exporting...' : 'Export'}
                            </button>
                        </div>
                    ))}
                    {(workspaces as WorkspaceRow[]).length === 0 && (
                        <div className="text-center py-8 text-muted-foreground glass-card rounded-xl">
                            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No workspaces to export.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
