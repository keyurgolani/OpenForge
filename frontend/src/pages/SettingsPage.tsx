import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
    listProviders, createProvider, updateProvider, deleteProvider,
    testConnection, listModels, setDefaultProvider,
    listWorkspaces, updateWorkspace, createWorkspace, deleteWorkspace,
    listPrompts, updatePrompt,
    listSchedules, updateSchedule, runTaskNow, getTaskHistory, getToolCallLogs, listSettings, updateSetting,
    listInstalledSkills, installSkill, searchSkills, removeSkill, getToolRegistry,
    listMCPServers, createMCPServer, updateMCPServer, deleteMCPServer, discoverMCPServer,
    updateMCPToolOverride,
} from '@/lib/api'
import {
    Globe2, Loader2, Trash2, CheckCircle2, XCircle, Star, Plus,
    ChevronDown, ChevronUp, ChevronRight, Eye, EyeOff, RefreshCw, Zap, Server, Search, Check,
    GitBranch,
    Layers, Bot, FolderOpen, Pencil, Save, X, Sliders, RotateCcw, MessageSquare,
    FileText, Timer, History, Play, Clock, CheckCircle, AlertCircle, Circle, Terminal,
    Brain, Folder, Briefcase, Microscope, BookOpen, Target, Globe, Lightbulb, Wrench,
    Palette, BarChart3, Rocket, Shield, FlaskConical, Leaf, Key, Settings2, PenLine,
    Database, Sprout
} from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'
import { ModelOverrideSelect } from '@/components/shared/ModelOverrideSelect'
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

type SettingsTab = 'workspaces' | 'llm' | 'prompts' | 'jobs' | 'skills' | 'tools' | 'mcp' | 'audit'
const SETTINGS_TABS: SettingsTab[] = ['workspaces', 'llm', 'prompts', 'jobs', 'skills', 'tools', 'mcp', 'audit']
const toSettingsTab = (value: string | null): SettingsTab => {
    const normalized = value === 'schedules' ? 'jobs' : value
    return SETTINGS_TABS.includes(normalized as SettingsTab) ? (normalized as SettingsTab) : 'workspaces'
}

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
        { id: 'jobs' as const, label: 'Jobs', Icon: Timer },
        { id: 'skills' as const, label: 'Skills', Icon: Wrench },
        { id: 'tools' as const, label: 'Tools', Icon: Settings2 },
        { id: 'mcp' as const, label: 'MCP', Icon: Layers },
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
            {activeTab === 'jobs' && <JobsTab />}
            {activeTab === 'skills' && <SkillsTab />}
            {activeTab === 'tools' && <ToolsTab />}
            {activeTab === 'mcp' && <MCPTab />}
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
    knowledge_count: number
    conversation_count: number
    agent_enabled: boolean
    agent_tool_categories: string[]
    agent_max_tool_loops: number
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
    const [agentEnabled, setAgentEnabled] = useState(ws.agent_enabled ?? false)
    const [agentToolCategories, setAgentToolCategories] = useState<string[]>(ws.agent_tool_categories ?? [])
    const [agentMaxToolLoops, setAgentMaxToolLoops] = useState(ws.agent_max_tool_loops ?? 20)
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
            agent_enabled: agentEnabled,
            agent_tool_categories: agentToolCategories,
            agent_max_tool_loops: agentMaxToolLoops,
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

                    <div className="border-t border-border/40 pt-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">AI Override <span className="text-xs font-normal opacity-60">(overrides global default for this workspace)</span></p>
                        <div className="grid gap-3 md:grid-cols-2">
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Provider</label>
                                <select className="input text-sm" value={providerId} onChange={e => { setProviderId(e.target.value); setModel('') }}>
                                    <option value="">Use global default</option>
                                    {providers.map(p => (
                                        <option key={p.id} value={p.id}>{sanitizeProviderDisplayName(p.display_name)}</option>
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
                                    <p className="text-xs text-muted-foreground">Enabled tool categories:</p>
                                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                        {(['filesystem', 'http', 'shell', 'memory', 'git', 'task', 'language', 'skills'] as const).map(cat => {
                                            const checked = agentToolCategories.includes(cat)
                                            const isDangerous = cat === 'shell' || cat === 'git'
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
                                    {agentToolCategories.some(c => c === 'shell' || c === 'git') && (
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
                                {isLocalProvider(id) && (
                                    <div className="mt-1 text-[9px] text-lime-300/90 font-medium">Local</div>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Step 2 — Credentials */}
            <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium block">2. Enter credentials</label>
                {isLocalProvider(providerName) && (
                    <p className="text-[10px] text-lime-300/90">Local provider (runs on this machine)</p>
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
                        <span className="font-medium text-sm">{sanitizeProviderDisplayName(provider.display_name) || provider.provider_name}</span>
                        <span className="chip-muted text-[10px]">{provider.provider_name}</span>
                        {isLocalProvider(provider.provider_name) && <span className="chip-muted text-[10px]">Local provider</span>}
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

    const categories = ['knowledge', 'chat']
    const categoryLabels: Record<string, string> = {
        knowledge: 'Knowledge Intelligence',
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
                const CatIcon = cat === 'knowledge' ? FileText : MessageSquare
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

function ToolCard({ tool }: { tool: ToolMeta }) {
    const [expanded, setExpanded] = useState(false)
    const [showRaw, setShowRaw] = useState(false)
    const params = extractParams(tool)
    const action = tool.id.split('.').slice(1).join('.')

    return (
        <div className="glass-card rounded-xl border-border/50 overflow-hidden">
            <button
                type="button"
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
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
    const [query, setQuery] = useState('')
    const [activeCategory, setActiveCategory] = useState<string>('all')

    const { data, isLoading } = useQuery({
        queryKey: ['tool-registry'],
        queryFn: getToolRegistry,
        retry: false,
        staleTime: 60_000,
    })

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
                                <ToolCard key={tool.id} tool={tool} />
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

function AuditTab({ workspaceId }: { workspaceId: string }) {
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
            {subTab === 'tool-calls' && <ToolCallLogsSubTab workspaceId={workspaceId} />}
            {subTab === 'logs' && (
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

function ToolCallLogsSubTab({ workspaceId }: { workspaceId: string }) {
    const [filterTool, setFilterTool] = useState('')
    const [expanded, setExpanded] = useState<string | null>(null)

    const { data: logs = [], isLoading, refetch } = useQuery<ToolCallLogEntry[]>({
        queryKey: ['tool-call-logs', workspaceId, filterTool],
        queryFn: () => getToolCallLogs({ workspace_id: workspaceId || undefined, tool_name: filterTool || undefined, limit: 100 }),
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
