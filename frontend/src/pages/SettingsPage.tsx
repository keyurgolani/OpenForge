import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
    listProviders, createProvider, updateProvider, deleteProvider,
    testConnection, listModels, syncModels,
    listEndpoints, setDefaultEndpoint,
    listVirtualProviders, createVirtualProvider, deleteVirtualProvider,
    listWorkspaces, updateWorkspace, createWorkspace, deleteWorkspace,
    listPrompts, updatePrompt,
    listSchedules, updateSchedule, runTaskNow, getTaskHistory, listSettings, updateSetting,
    getEmbeddingConfig, setEmbeddingConfig, reindexAllEmbeddings,
} from '@/lib/api'
import {
    Globe2, Loader2, Trash2, CheckCircle2, XCircle, Star, Plus,
    ChevronDown, ChevronUp, Eye, EyeOff, RefreshCw, Zap, Server, Search, Check,
    Layers, Bot, FolderOpen, Pencil, Save, X, Sliders, RotateCcw, MessageSquare,
    FileText, Timer, History, Play, Clock, CheckCircle, AlertCircle, Circle, Terminal,
    Brain, Folder, Briefcase, Microscope, BookOpen, Target, Globe, Lightbulb, Wrench,
    Palette, BarChart3, Rocket, Shield, FlaskConical, Leaf, Key, Settings2, PenLine,
    Database, Sprout, Activity, ChevronRight, Mic, Volume2, Cpu, RotateCw
} from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'

import { MCPServerSettings } from '@/components/settings/MCPServerSettings'
import { RouterConfig } from '@/components/settings/RouterConfig'
import { CouncilConfig } from '@/components/settings/CouncilConfig'
import { OptimizerConfig } from '@/components/settings/OptimizerConfig'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { isLocalProvider, sanitizeProviderDisplayName } from '@/lib/provider-display'

// ── Provider registry ────────────────────────────────────────────────────────
const PROVIDER_META: Record<string, {
    name: string; color: string
    needsKey: boolean; needsUrl: boolean; placeholder: string; urlPlaceholder?: string
}> = {
    openai: { name: 'OpenAI', color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700', needsKey: true, needsUrl: false, placeholder: 'sk-proj-…' },
    anthropic: { name: 'Anthropic', color: 'bg-orange-500/10 border-orange-500/20 text-orange-700', needsKey: true, needsUrl: false, placeholder: 'sk-ant-…' },
    gemini: { name: 'Google Gemini', color: 'bg-blue-500/10 border-blue-500/20 text-blue-700', needsKey: true, needsUrl: false, placeholder: 'AIza…' },
    groq: { name: 'Groq', color: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700', needsKey: true, needsUrl: false, placeholder: 'gsk_…' },
    deepseek: { name: 'DeepSeek', color: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-700', needsKey: true, needsUrl: false, placeholder: 'sk-…' },
    mistral: { name: 'Mistral AI', color: 'bg-purple-500/10 border-purple-500/20 text-purple-700', needsKey: true, needsUrl: false, placeholder: 'Key…' },
    openrouter: { name: 'OpenRouter', color: 'bg-pink-500/10 border-pink-500/20 text-pink-700', needsKey: true, needsUrl: false, placeholder: 'sk-or-…' },
    xai: { name: 'xAI (Grok)', color: 'bg-gray-500/10 border-gray-500/20 text-gray-700', needsKey: true, needsUrl: false, placeholder: 'xai-…' },
    cohere: { name: 'Cohere', color: 'bg-teal-500/10 border-teal-500/20 text-teal-700', needsKey: true, needsUrl: false, placeholder: 'API key…' },
    zhipuai: { name: 'Z.AI (ZhipuAI)', color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-700', needsKey: true, needsUrl: false, placeholder: 'API key…' },
    huggingface: { name: 'HuggingFace', color: 'bg-orange-400/10 border-orange-400/20 text-orange-700', needsKey: true, needsUrl: false, placeholder: 'hf_…' },
    ollama: { name: 'Ollama', color: 'bg-lime-500/10 border-lime-500/20 text-lime-700', needsKey: false, needsUrl: true, placeholder: 'Token (optional)', urlPlaceholder: 'http://host.docker.internal:11434' },
    'custom-openai': { name: 'Custom OpenAI-compatible', color: 'bg-violet-500/10 border-violet-500/20 text-violet-700', needsKey: false, needsUrl: true, placeholder: 'Token (optional)', urlPlaceholder: 'https://your-api.com' },
    'custom-anthropic': { name: 'Custom Anthropic-compat.', color: 'bg-rose-500/10 border-rose-500/20 text-rose-700', needsKey: false, needsUrl: true, placeholder: 'Token (optional)', urlPlaceholder: 'https://your-api.com' },
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

type SettingsTab = 'workspaces' | 'llm' | 'prompts' | 'jobs' | 'tools' | 'mcp' | 'hitl' | 'audit' | 'skills'
const SETTINGS_TABS: SettingsTab[] = ['workspaces', 'llm', 'prompts', 'jobs', 'tools', 'mcp', 'hitl', 'audit', 'skills']
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
        { id: 'tools' as const, label: 'Tools', Icon: Wrench },
        { id: 'mcp' as const, label: 'MCP Servers', Icon: Server },
        { id: 'hitl' as const, label: 'Approvals', Icon: Shield },
        { id: 'audit' as const, label: 'Audit', Icon: History },
        { id: 'skills' as const, label: 'Skills', Icon: Zap },
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
            {activeTab === 'tools' && <ToolsTab />}
            {activeTab === 'mcp' && <MCPServerSettings />}
            {activeTab === 'hitl' && <HITLTab />}
            {activeTab === 'skills' && <SkillsTab />}
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
    chat_endpoint_id: string | null; vision_endpoint_id: string | null
    knowledge_count: number
    conversation_count: number
    tools_enabled?: boolean
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
    const { data: endpoints = [] } = useQuery({ queryKey: ['endpoints'], queryFn: listEndpoints })

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
                    endpoints={endpoints as EndpointRow[]}
                    isActive={ws.id === activeWorkspaceId}
                    onDeleted={() => qc.invalidateQueries({ queryKey: ['workspaces'] })}
                    onSaved={() => qc.invalidateQueries({ queryKey: ['workspaces'] })}
                />
            ))}
        </div>
    )
}

type ProviderRow = { id: string; display_name: string; provider_name: string; has_api_key: boolean; base_url: string | null; endpoint_id: string; models: { id: string; model_id: string; display_name: string; capabilities: string[]; is_enabled: boolean }[] }
type EndpointRow = { id: string; endpoint_type: string; display_name: string | null; provider_id: string | null; model_id: string | null; virtual_provider_id: string | null; is_default_chat: boolean; is_default_vision: boolean; is_default_tts: boolean; is_default_stt: boolean; provider_name?: string; provider_display_name?: string; virtual_type?: string; virtual_display_name?: string }
type VirtualProviderRow = { id: string; virtual_type: string; display_name: string; description: string | null; endpoint_id: string | null }

function WorkspaceCard({ workspace: ws, endpoints, isActive, onDeleted, onSaved }: {
    workspace: WorkspaceRow
    endpoints: EndpointRow[]
    isActive: boolean
    onDeleted: () => void
    onSaved: () => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [name, setName] = useState(ws.name)
    const [description, setDescription] = useState(ws.description ?? '')
    const [icon, setIcon] = useState(ws.icon ?? 'folder')
    const [showIcons, setShowIcons] = useState(false)
    const [chatEndpointId, setChatEndpointId] = useState(ws.chat_endpoint_id ?? '')
    const [visionEndpointId, setVisionEndpointId] = useState(ws.vision_endpoint_id ?? '')
    const [toolsEnabled, setToolsEnabled] = useState(ws.tools_enabled ?? false)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const endpointLabel = (ep: EndpointRow) =>
        ep.display_name || `${ep.provider_display_name || ep.virtual_display_name || ''} / ${ep.model_id || ep.virtual_type || ''}`

    const handleSave = async () => {
        setSaving(true)
        await updateWorkspace(ws.id, {
            name: name.trim(),
            description: description || null,
            icon: icon || null,
            chat_endpoint_id: chatEndpointId || null,
            vision_endpoint_id: visionEndpointId || null,
            tools_enabled: toolsEnabled,
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
                        {ws.description || (ws.chat_endpoint_id ? `Endpoint override set` : 'Using global default endpoint')}
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
                                <label className="text-xs text-muted-foreground mb-1 block">Chat Endpoint</label>
                                <select className="input text-sm" value={chatEndpointId} onChange={e => setChatEndpointId(e.target.value)}>
                                    <option value="">Use global default</option>
                                    {endpoints.map(ep => (
                                        <option key={ep.id} value={ep.id}>{endpointLabel(ep)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Vision Endpoint</label>
                                <select className="input text-sm" value={visionEndpointId} onChange={e => setVisionEndpointId(e.target.value)}>
                                    <option value="">Use global default</option>
                                    {endpoints.map(ep => (
                                        <option key={ep.id} value={ep.id}>{endpointLabel(ep)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-border/40 pt-3">
                        <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5">
                            <div>
                                <div className="font-medium text-sm">Agent Mode (Tool Calling)</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                    Enable AI agent to use tools during chat. When disabled, chat is knowledge-only.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setToolsEnabled(v => !v)}
                                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${toolsEnabled ? 'bg-accent' : 'bg-white/20'}`}
                                aria-label="Toggle agent mode"
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${toolsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
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
type LLMInnerTab = 'chat' | 'vision' | 'audio' | 'embedding'

function LLMSettings() {
    const [innerTab, setInnerTab] = useState<LLMInnerTab>('chat')

    const LLM_INNER_TABS: { id: LLMInnerTab; label: string; Icon: React.ElementType }[] = [
        { id: 'chat', label: 'Chat Models', Icon: MessageSquare },
        { id: 'vision', label: 'Vision Models', Icon: Eye },
        { id: 'audio', label: 'Audio Models', Icon: Mic },
        { id: 'embedding', label: 'Embedding', Icon: Database },
    ]

    return (
        <div className="space-y-5">
            {/* Inner tabs */}
            <div className="flex gap-1.5 p-1 glass-card w-fit rounded-xl overflow-x-auto">
                {LLM_INNER_TABS.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        onClick={() => setInnerTab(id)}
                        className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${innerTab === id
                            ? 'bg-accent/20 text-accent shadow-glass-inset ring-1 ring-accent/30'
                            : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                            }`}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
            </div>

            {innerTab === 'chat' && <ChatModelsTab />}
            {innerTab === 'vision' && <VisionModelsTab />}
            {innerTab === 'audio' && <AudioModelsTab />}
            {innerTab === 'embedding' && <EmbeddingModelsTab />}
        </div>
    )
}

// ── Shared: Provider + Virtual Provider management panels ─────────────────────
function ProvidersPanel({ onInvalidate }: { onInvalidate: () => void }) {
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const { data: virtualProviders = [] } = useQuery({ queryKey: ['virtual-providers'], queryFn: listVirtualProviders })
    const [expanded, setExpanded] = useState<string | null>(null)
    const [expandedVP, setExpandedVP] = useState<string | null>(null)
    const [showAdd, setShowAdd] = useState(false)

    return (
        <div className="space-y-6">
            {/* Standard Providers */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-sm">AI Providers</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Standard LLM providers. Endpoints are auto-created for each model.
                        </p>
                    </div>
                    <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                        <Plus className="w-3.5 h-3.5" /> {showAdd ? 'Close' : 'Add Provider'}
                    </button>
                </div>

                {showAdd && <AddProviderPanel onAdded={onInvalidate} />}

                {(providers as ProviderRow[]).map(p => (
                    <ProviderCard
                        key={p.id}
                        provider={p}
                        expanded={expanded === p.id}
                        onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                        onDelete={() => deleteProvider(p.id).then(onInvalidate)}
                    />
                ))}

                {(providers as unknown[]).length === 0 && !showAdd && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        <Server className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>No AI providers configured yet.</p>
                    </div>
                )}
            </div>

            {/* Virtual Providers */}
            {(virtualProviders as VirtualProviderRow[]).length > 0 && (
                <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Virtual Providers</h3>
                    {(virtualProviders as VirtualProviderRow[]).map(vp => {
                        const meta = VIRTUAL_PROVIDER_META[vp.virtual_type as VirtualProviderType]
                        return (
                            <div key={vp.id} className="glass-card-hover transition-all duration-300">
                                <div className="flex items-center gap-3 px-4 py-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${meta?.color ?? 'bg-muted border-border'}`}>
                                        <Bot className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-sm">{vp.display_name}</span>
                                            <span className="chip-muted text-[10px]">{meta?.name || vp.virtual_type}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                            {vp.description || meta?.description || ''}
                                        </p>
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                        <button className="btn-ghost p-1.5 text-red-400"
                                            onClick={() => { if (confirm(`Delete "${vp.display_name}"?`)) deleteVirtualProvider(vp.id).then(onInvalidate) }}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button className="btn-ghost p-1.5" onClick={() => setExpandedVP(expandedVP === vp.id ? null : vp.id)}>
                                            {expandedVP === vp.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                                {expandedVP === vp.id && (
                                    <div className="border-t border-border/50 px-4 py-4 animate-fade-in">
                                        {vp.virtual_type === 'router' && <RouterConfig vpId={vp.id} />}
                                        {vp.virtual_type === 'council' && <CouncilConfig vpId={vp.id} />}
                                        {vp.virtual_type === 'optimizer' && <OptimizerConfig vpId={vp.id} />}
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

// ── Chat Models Tab ───────────────────────────────────────────────────────────
function ChatModelsTab() {
    const qc = useQueryClient()
    const { data: endpoints = [] } = useQuery({ queryKey: ['endpoints'], queryFn: listEndpoints })

    const invalidateAll = () => {
        qc.invalidateQueries({ queryKey: ['providers'] })
        qc.invalidateQueries({ queryKey: ['virtual-providers'] })
        qc.invalidateQueries({ queryKey: ['endpoints'] })
    }

    return (
        <div className="space-y-6">
            <ProvidersPanel onInvalidate={invalidateAll} />

            {(endpoints as EndpointRow[]).length > 0 && (
                <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Default Chat Endpoint</h3>
                    <p className="text-xs text-muted-foreground">
                        <Star className="w-3 h-3 inline-block text-amber-400" /> Used for new chats when no workspace override is set.
                    </p>
                    <select
                        className="input text-sm max-w-md"
                        value={(endpoints as EndpointRow[]).find(e => e.is_default_chat)?.id ?? ''}
                        onChange={e => { if (e.target.value) setDefaultEndpoint(e.target.value, 'chat').then(invalidateAll) }}
                    >
                        <option value="">None</option>
                        {(endpoints as EndpointRow[]).map(ep => (
                            <option key={ep.id} value={ep.id}>
                                {ep.display_name || `${ep.provider_display_name || ep.virtual_display_name || ''} / ${ep.model_id || ep.virtual_type || ''}`}
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    )
}

// ── Vision Models Tab ─────────────────────────────────────────────────────────
function VisionModelsTab() {
    const qc = useQueryClient()
    const { data: endpoints = [] } = useQuery({ queryKey: ['endpoints'], queryFn: listEndpoints })

    const invalidateAll = () => {
        qc.invalidateQueries({ queryKey: ['providers'] })
        qc.invalidateQueries({ queryKey: ['virtual-providers'] })
        qc.invalidateQueries({ queryKey: ['endpoints'] })
    }

    return (
        <div className="space-y-6">
            <ProvidersPanel onInvalidate={invalidateAll} />

            {(endpoints as EndpointRow[]).length > 0 && (
                <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Default Vision Endpoint</h3>
                    <p className="text-xs text-muted-foreground">
                        <Star className="w-3 h-3 inline-block text-amber-400" /> Used for image analysis when no workspace override is set.
                    </p>
                    <select
                        className="input text-sm max-w-md"
                        value={(endpoints as EndpointRow[]).find(e => e.is_default_vision)?.id ?? ''}
                        onChange={e => { if (e.target.value) setDefaultEndpoint(e.target.value, 'vision').then(invalidateAll) }}
                    >
                        <option value="">None</option>
                        {(endpoints as EndpointRow[]).map(ep => (
                            <option key={ep.id} value={ep.id}>
                                {ep.display_name || `${ep.provider_display_name || ep.virtual_display_name || ''} / ${ep.model_id || ep.virtual_type || ''}`}
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    )
}

// ── Audio Models Tab ──────────────────────────────────────────────────────────
function AudioModelsTab() {
    const qc = useQueryClient()
    const { data: endpoints = [] } = useQuery({ queryKey: ['endpoints'], queryFn: listEndpoints })

    const invalidateAll = () => {
        qc.invalidateQueries({ queryKey: ['endpoints'] })
    }

    // Only standard (non-virtual) endpoints for audio
    const standardEndpoints = (endpoints as EndpointRow[]).filter(e => e.endpoint_type === 'standard')
    const defaultTTS = standardEndpoints.find(e => e.is_default_tts)
    const defaultSTT = standardEndpoints.find(e => e.is_default_stt)

    const epLabel = (ep: EndpointRow) =>
        ep.display_name || `${ep.provider_display_name || ''} / ${ep.model_id || ''}`

    return (
        <div className="space-y-6">
            <div className="glass-card p-4 space-y-1">
                <div className="flex items-center gap-2 mb-2">
                    <Volume2 className="w-4 h-4 text-accent" />
                    <h3 className="font-semibold text-sm">Text-to-Speech (TTS)</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                    Model used to synthesize speech from text. Select a provider endpoint that supports audio generation.
                </p>
                <select
                    className="input text-sm"
                    value={defaultTTS?.id ?? ''}
                    onChange={e => { if (e.target.value) setDefaultEndpoint(e.target.value, 'tts').then(invalidateAll) }}
                >
                    <option value="">None — TTS disabled</option>
                    {standardEndpoints.map(ep => (
                        <option key={ep.id} value={ep.id}>{epLabel(ep)}</option>
                    ))}
                </select>
                {defaultTTS && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                        Current: <span className="text-foreground">{epLabel(defaultTTS)}</span>
                    </p>
                )}
            </div>

            <div className="glass-card p-4 space-y-1">
                <div className="flex items-center gap-2 mb-2">
                    <Mic className="w-4 h-4 text-accent" />
                    <h3 className="font-semibold text-sm">Speech-to-Text (STT)</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                    Model used to transcribe audio to text. Select a provider endpoint that supports transcription.
                </p>
                <select
                    className="input text-sm"
                    value={defaultSTT?.id ?? ''}
                    onChange={e => { if (e.target.value) setDefaultEndpoint(e.target.value, 'stt').then(invalidateAll) }}
                >
                    <option value="">None — STT disabled</option>
                    {standardEndpoints.map(ep => (
                        <option key={ep.id} value={ep.id}>{epLabel(ep)}</option>
                    ))}
                </select>
                {defaultSTT && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                        Current: <span className="text-foreground">{epLabel(defaultSTT)}</span>
                    </p>
                )}
            </div>

            {standardEndpoints.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                    <Server className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>No provider endpoints configured yet.</p>
                    <p className="text-xs mt-1">Add a provider in the Chat Models tab first.</p>
                </div>
            )}
        </div>
    )
}

// ── Embedding Models Tab ──────────────────────────────────────────────────────
function EmbeddingModelsTab() {
    const qc = useQueryClient()
    const { data: endpoints = [] } = useQuery({ queryKey: ['endpoints'], queryFn: listEndpoints })
    const { data: embeddingConfig, isLoading: configLoading } = useQuery({
        queryKey: ['embedding-config'],
        queryFn: getEmbeddingConfig,
    })

    const [mode, setMode] = useState<'native' | 'provider'>('native')
    const [nativeModel, setNativeModel] = useState('all-MiniLM-L6-v2')
    const [providerEndpointId, setProviderEndpointId] = useState('')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [reindexing, setReindexing] = useState(false)
    const [reindexResult, setReindexResult] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)

    // Sync state from loaded config
    useEffect(() => {
        if (!embeddingConfig) return
        setMode(embeddingConfig.mode === 'provider' ? 'provider' : 'native')
        setNativeModel(embeddingConfig.native_model || 'all-MiniLM-L6-v2')
        setProviderEndpointId(embeddingConfig.provider_endpoint_id || '')
    }, [embeddingConfig])

    // Only standard (non-virtual) endpoints for embedding
    const standardEndpoints = (endpoints as EndpointRow[]).filter(e => e.endpoint_type === 'standard')
    const epLabel = (ep: EndpointRow) =>
        ep.display_name || `${ep.provider_display_name || ''} / ${ep.model_id || ''}`

    const handleSave = async () => {
        setSaving(true); setSaveError(null)
        try {
            await setEmbeddingConfig({
                mode,
                native_model: mode === 'native' ? nativeModel : undefined,
                provider_endpoint_id: mode === 'provider' ? providerEndpointId : undefined,
            })
            qc.invalidateQueries({ queryKey: ['embedding-config'] })
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setSaveError(err?.response?.data?.detail ?? err?.message ?? 'Save failed')
        } finally { setSaving(false) }
    }

    const handleReindex = async () => {
        if (!confirm('This will reset all knowledge items and trigger a full re-embedding. Continue?')) return
        setReindexing(true); setReindexResult(null)
        try {
            const result = await reindexAllEmbeddings()
            setReindexResult(result.message || `Reset ${result.reset_count} items for re-embedding.`)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setReindexResult(`Error: ${err?.response?.data?.detail ?? err?.message ?? 'Failed'}`)
        } finally { setReindexing(false) }
    }

    if (configLoading) {
        return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
    }

    return (
        <div className="space-y-5">
            {/* Mode selection */}
            <div className="glass-card p-4 space-y-4">
                <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-accent" />
                    <h3 className="font-semibold text-sm">Embedding Model</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                    Controls how knowledge is converted to vectors for semantic search.
                    Changing the model requires re-indexing all existing knowledge.
                </p>

                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => setMode('native')}
                        className={`p-3 rounded-xl border text-left transition-all duration-200 ${mode === 'native'
                            ? 'border-accent bg-accent/10 ring-2 ring-accent/30'
                            : 'border-border/50 hover:bg-muted/30'
                            }`}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <Cpu className="w-3.5 h-3.5 text-accent" />
                            <span className="text-xs font-semibold">Built-in Native</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Local sentence-transformers model. No API calls, works offline.
                        </p>
                    </button>
                    <button
                        onClick={() => setMode('provider')}
                        className={`p-3 rounded-xl border text-left transition-all duration-200 ${mode === 'provider'
                            ? 'border-accent bg-accent/10 ring-2 ring-accent/30'
                            : 'border-border/50 hover:bg-muted/30'
                            }`}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <Server className="w-3.5 h-3.5 text-accent" />
                            <span className="text-xs font-semibold">Provider Model</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Use an API provider's embedding model (e.g. OpenAI text-embedding-3-small).
                        </p>
                    </button>
                </div>

                {mode === 'native' && (
                    <div className="animate-fade-in">
                        <label className="text-xs text-muted-foreground mb-1 block font-medium">Model Name</label>
                        <input
                            className="input text-sm"
                            placeholder="all-MiniLM-L6-v2"
                            value={nativeModel}
                            onChange={e => setNativeModel(e.target.value)}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Any sentence-transformers compatible model name from HuggingFace.
                        </p>
                    </div>
                )}

                {mode === 'provider' && (
                    <div className="animate-fade-in space-y-2">
                        <label className="text-xs text-muted-foreground mb-1 block font-medium">Provider Endpoint</label>
                        {standardEndpoints.length > 0 ? (
                            <select
                                className="input text-sm"
                                value={providerEndpointId}
                                onChange={e => setProviderEndpointId(e.target.value)}
                            >
                                <option value="">Select endpoint…</option>
                                {standardEndpoints.map(ep => (
                                    <option key={ep.id} value={ep.id}>{epLabel(ep)}</option>
                                ))}
                            </select>
                        ) : (
                            <p className="text-xs text-amber-600 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                No standard provider endpoints configured. Add a provider in the Chat Models tab first.
                            </p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                            Virtual providers are not supported for embedding.
                        </p>
                    </div>
                )}

                {saveError && (
                    <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-700 border border-destructive/20">
                        {saveError}
                    </div>
                )}

                <button
                    className="btn-primary text-xs py-2 px-4"
                    onClick={handleSave}
                    disabled={saving || (mode === 'provider' && !providerEndpointId)}
                >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                    {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
                </button>
            </div>

            {/* Re-index section */}
            <div className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <RotateCw className="w-4 h-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">Re-index All Embeddings</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                    After changing the embedding model, re-index all knowledge items to use the new model.
                    All existing knowledge will be re-processed on the next embedding run.
                </p>

                {reindexResult && (
                    <div className={`text-xs p-2.5 rounded-lg border ${reindexResult.startsWith('Error')
                        ? 'bg-destructive/10 text-red-700 border-destructive/20'
                        : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                        }`}>
                        {reindexResult}
                    </div>
                )}

                <button
                    className="btn-ghost text-xs border border-amber-500/30 text-amber-600 hover:bg-amber-500/10 py-2 px-4"
                    onClick={handleReindex}
                    disabled={reindexing}
                >
                    {reindexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                    {reindexing ? 'Resetting…' : 'Trigger Re-index'}
                </button>
            </div>
        </div>
    )
}

// ── Virtual Provider Types ────────────────────────────────────────────────────
const VIRTUAL_PROVIDER_TYPES = ['router', 'council', 'optimizer'] as const
type VirtualProviderType = typeof VIRTUAL_PROVIDER_TYPES[number]
const VIRTUAL_PROVIDER_META: Record<VirtualProviderType, { name: string; color: string; description: string }> = {
    router: { name: 'Router (Virtual)', color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-700', description: 'Automatically routes requests to the best model based on complexity' },
    council: { name: 'Council (Virtual)', color: 'bg-purple-500/10 border-purple-500/20 text-purple-700', description: 'Multiple models deliberate and the best response is selected' },
    optimizer: { name: 'Optimizer (Virtual)', color: 'bg-teal-500/10 border-teal-500/20 text-teal-700', description: 'Optimizes prompts before forwarding to a target model' },
}

function VirtualProviderPanel({ providerType, onAdded }: { providerType: VirtualProviderType; onAdded: () => void }) {
    const [displayName, setDisplayName] = useState('')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    const meta = VIRTUAL_PROVIDER_META[providerType]

    const handleSave = async () => {
        if (!displayName.trim()) { setSaveError('Display name is required'); return }
        setSaving(true); setSaveError(null)
        try {
            await createVirtualProvider({
                virtual_type: providerType,
                display_name: displayName.trim(),
            })
            setSaved(true); onAdded()
            setTimeout(() => setSaved(false), 3000)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setSaveError(err?.response?.data?.detail ?? err?.message ?? 'Save failed')
        } finally { setSaving(false) }
    }

    return (
        <div className="space-y-4 pt-2">
            <div className={`p-3 rounded-lg border text-xs ${meta.color}`}>
                {meta.description}
            </div>
            <div>
                <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
                <input className="input text-sm" placeholder={`e.g. My ${meta.name}`} value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>
            <p className="text-[10px] text-muted-foreground">
                After saving, configure this virtual provider's settings via the provider card.
            </p>
            {saveError && <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-700 border border-destructive/20">{saveError}</div>}
            <button className="btn-primary w-full justify-center py-2.5" onClick={handleSave} disabled={saving || !displayName.trim()}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Saving…' : `Save ${meta.name}`}
                {saved && <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-1" />}
            </button>
        </div>
    )
}

// ── Add Provider Panel ────────────────────────────────────────────────────────
function AddProviderPanel({ onAdded }: { onAdded: () => void }) {
    const [providerName, setProviderName] = useState('openai')
    const [virtualType, setVirtualType] = useState<VirtualProviderType | null>(null)
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
        setProviderName(id); setVirtualType(null); setDisplayName(''); setApiKey(''); setBaseUrl('')
        setShowKey(false); setModels(null); setModelError(null)
        setModelSearch(''); setSelectedModels(new Set()); setManualModel('')
        setSaved(false); setSaveError(null)
        setCreatedProviderId(null)
        setShowAdvanced(false)
    }

    const handleVirtualTypeChange = (vt: VirtualProviderType) => {
        setVirtualType(vt); setProviderName(''); setDisplayName(''); setApiKey(''); setBaseUrl('')
        setShowKey(false); setModels(null); setModelError(null)
        setModelSearch(''); setSelectedModels(new Set()); setManualModel('')
        setSaved(false); setSaveError(null)
        setCreatedProviderId(null)
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
                // Sync discovered models into the existing provider
                await syncModels(createdProviderId, enabledList)
            } else {
                await createProvider({
                    provider_name: providerName,
                    display_name: displayName || meta?.name || providerName,
                    api_key: apiKey || undefined,
                    base_url: baseUrl || undefined,
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
                                className={`p-2 rounded-xl border text-center text-xs transition-all duration-300 ${providerName === id && !virtualType ? `${m.color} border-accent ring-2 ring-accent/30 scale-105 shadow-glass-md` : 'border-border/50 hover:bg-muted/30 hover:shadow-glass-sm'
                                    }`}
                            >
                                <div className="flex justify-center mb-1.5">
                                    <ProviderIcon providerId={id} className="w-4 h-4" />
                                </div>
                                <div className="text-[10px] leading-tight font-medium truncate">{m.name}</div>
                                {isLocalProvider(id) && (
                                    <div className="mt-1 text-[9px] text-lime-700 font-medium">Local</div>
                                )}
                            </button>
                        )
                    })}
                </div>
                <div className="mt-2">
                    <label className="text-[10px] text-muted-foreground font-medium block mb-1.5">Virtual Providers</label>
                    <div className="grid grid-cols-3 gap-1.5">
                        {VIRTUAL_PROVIDER_TYPES.map(vt => {
                            const vm = VIRTUAL_PROVIDER_META[vt]
                            return (
                                <button key={vt} onClick={() => handleVirtualTypeChange(vt)}
                                    className={`p-2 rounded-xl border text-center text-xs transition-all duration-300 ${virtualType === vt ? `${vm.color} border-accent ring-2 ring-accent/30 scale-105 shadow-glass-md` : 'border-border/50 hover:bg-muted/30 hover:shadow-glass-sm'}`}
                                >
                                    <div className="flex justify-center mb-1.5">
                                        <Bot className="w-4 h-4 opacity-70" />
                                    </div>
                                    <div className="text-[10px] leading-tight font-medium truncate">{vm.name}</div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {virtualType && (
                <VirtualProviderPanel providerType={virtualType} onAdded={onAdded} />
            )}

            {!virtualType && (
            <>
            {/* Step 2 — Credentials */}
            <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium block">2. Enter credentials</label>
                {isLocalProvider(providerName) && (
                    <p className="text-[10px] text-lime-700">Local provider (runs on this machine)</p>
                )}
                <input className="input text-sm" placeholder={`Display name (default: ${meta?.name})`} value={displayName} onChange={e => setDisplayName(e.target.value)} />

                {meta?.needsUrl ? (
                    <>
                        <input className="input text-sm" placeholder={meta.urlPlaceholder ?? 'https://your-api.com'} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                        {providerName === 'ollama' && (
                            <p className="text-[10px] text-muted-foreground">Running via Docker? Use <code className="bg-muted px-1 rounded">host.docker.internal</code> instead of <code className="bg-muted px-1 rounded">localhost</code> or a LAN IP.</p>
                        )}
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
                    <div className="text-xs p-3 rounded-lg bg-destructive/10 text-red-700 border border-destructive/20 space-y-1">
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

            {saveError && <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-700 border border-destructive/20">{saveError}</div>}

            {/* Step 4 — Save */}
            <button className="btn-primary w-full justify-center py-2.5" onClick={handleSave} disabled={saving || totalSelected === 0}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? `Saving…` : totalSelected > 0 ? `Save Provider with ${totalSelected} model${totalSelected > 1 ? 's' : ''}` : 'Select models above'}
            </button>
            <p className="text-[10px] text-muted-foreground text-center">Panel stays open — add more providers after saving</p>
            </>
            )}
        </div>
    )
}

// ── Provider Card ────────────────────────────────────────────────────────────
function ProviderCard({ provider, expanded, onToggle, onDelete }: {
    provider: ProviderRow; expanded: boolean
    onToggle: () => void; onDelete: () => void
}) {
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

    const meta = PROVIDER_META[provider.provider_name]
    const enabledModels = (provider.models || []).filter(m => m.is_enabled)

    const handleTest = async () => {
        setTesting(true); setTestResult(null)
        try { setTestResult(await testConnection(provider.id)) }
        catch { setTestResult({ success: false, message: 'Request failed' }) }
        finally { setTesting(false) }
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
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {provider.has_api_key ? 'Key set' : provider.base_url ?? 'No credentials'}
                        {enabledModels.length > 0 ? ` · ${enabledModels.length} model${enabledModels.length > 1 ? 's' : ''}` : ''}
                    </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
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
                        {testing ? 'Testing...' : 'Test Connection'}
                    </button>
                    {testResult && (
                        <div className={`flex items-start gap-2 text-xs p-2.5 rounded-lg ${testResult.success ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' : 'bg-destructive/10 text-red-700 border border-destructive/20'}`}>
                            {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                            {testResult.message}
                        </div>
                    )}

                    {enabledModels.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Registered Models</label>
                            <div className="max-h-36 overflow-y-auto rounded-lg border border-border/50 bg-background/30 divide-y divide-border/20">
                                {enabledModels.map(m => (
                                    <div key={m.id} className="px-3 py-1.5 text-xs flex items-center gap-2 text-muted-foreground">
                                        <Zap className="w-3 h-3 flex-shrink-0 text-accent" />
                                        <span className="truncate">{m.display_name || m.model_id}</span>
                                        <span className="text-[10px] opacity-50 ml-auto">{m.model_id}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
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
                    <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-400/30 flex items-center justify-center text-blue-700">
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
    error: 'bg-red-500/15 border-red-400/30 text-red-700',
    warn: 'bg-amber-500/15 border-amber-300/35 text-amber-700',
    info: 'bg-blue-500/15 border-blue-300/35 text-blue-700',
    debug: 'bg-cyan-500/15 border-cyan-300/35 text-cyan-700',
    trace: 'bg-purple-500/15 border-purple-300/35 text-purple-700',
    unknown: 'bg-muted/60 border-border/60 text-muted-foreground',
}

function StatusIcon({ status }: { status: string }) {
    if (status === 'running') return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
    if (status === 'done') return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
    if (status === 'failed') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
    return <Circle className="w-3.5 h-3.5 text-muted-foreground" />
}

// ── HITL Tab (Human-in-the-Loop Approvals) ────────────────────────────────────────
function HITLTab() {
    const qc = useQueryClient()
    const { data: pendingData, isLoading } = useQuery({
        queryKey: ['hitl-pending'],
        queryFn: async () => {
            const res = await fetch('/api/v1/hitl/pending')
            if (!res.ok) throw new Error('Failed to fetch pending requests')
            return res.json()
        },
        refetchInterval: 5000, // Refresh every 5 seconds
    })

    const approveMutation = useMutation({
        mutationFn: async (requestId: string) => {
            const res = await fetch(`/api/v1/hitl/${requestId}/approve`, { method: 'POST' })
            if (!res.ok) throw new Error('Failed to approve')
            return res.json()
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['hitl-pending'] }),
    })

    const denyMutation = useMutation({
        mutationFn: async (requestId: string) => {
            const res = await fetch(`/api/v1/hitl/${requestId}/deny`, { method: 'POST' })
            if (!res.ok) throw new Error('Failed to deny')
            return res.json()
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['hitl-pending'] }),
    })

    const requests = pendingData?.requests || []

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Shield className="w-4 h-4 text-orange-400" />
                        Pending Approvals
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Review and approve or deny agent tool requests
                    </p>
                </div>
                {requests.length > 0 && (
                    <span className="px-2 py-0.5 bg-orange-500/20 text-orange-700 text-xs rounded-full">
                        {requests.length} pending
                    </span>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : requests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No pending approval requests</p>
                    <p className="text-xs mt-1">Agent tool calls requiring approval will appear here</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {requests.map((req: any) => (
                        <div key={req.id} className="glass-card p-4 border border-orange-500/20">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="px-2 py-0.5 bg-orange-500/20 text-orange-700 text-xs rounded">
                                            {req.tool_id}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(req.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-foreground mb-2">{req.action_summary}</p>
                                    {req.tool_input && (
                                        <pre className="text-xs text-muted-foreground bg-black/20 p-2 rounded overflow-x-auto">
                                            {JSON.stringify(req.tool_input, null, 2)}
                                        </pre>
                                    )}
                                </div>
                                <div className="flex gap-2 ml-4">
                                    <button
                                        onClick={() => approveMutation.mutate(req.id)}
                                        disabled={approveMutation.isPending}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30
                                                 text-green-700 rounded-lg text-sm transition-colors disabled:opacity-50"
                                    >
                                        {approveMutation.isPending ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <CheckCircle2 className="w-4 h-4" />
                                        )}
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => denyMutation.mutate(req.id)}
                                        disabled={denyMutation.isPending}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30
                                                 text-red-700 rounded-lg text-sm transition-colors disabled:opacity-50"
                                    >
                                        {denyMutation.isPending ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <XCircle className="w-4 h-4" />
                                        )}
                                        Deny
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Tools Tab (Tool Definitions) ────────────────────────────────────────────────
function ToolsTab() {
    const qc = useQueryClient()
    const { data: toolsData, isLoading } = useQuery({
        queryKey: ['tools'],
        queryFn: async () => {
            const res = await fetch('/api/v1/tools')
            if (!res.ok) throw new Error('Failed to fetch tools')
            return res.json()
        },
    })

    const { data: categoriesData } = useQuery({
        queryKey: ['tool-categories'],
        queryFn: async () => {
            const res = await fetch('/api/v1/tools/categories')
            if (!res.ok) throw new Error('Failed to fetch categories')
            return res.json()
        },
    })

    const syncMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/v1/tools/sync', { method: 'POST' })
            if (!res.ok) throw new Error('Failed to sync tools')
            return res.json()
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['tools'] })
            qc.invalidateQueries({ queryKey: ['tool-categories'] })
        },
    })

    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const [expandedTool, setExpandedTool] = useState<string | null>(null)
    const tools = toolsData?.tools || []
    const categories = categoriesData?.categories || []
    const filteredTools = selectedCategory
        ? tools.filter((t: any) => t.category === selectedCategory)
        : tools

    const categoryColors: Record<string, string> = {
        filesystem: 'text-blue-400',
        git: 'text-orange-400',
        shell: 'text-red-400',
        language: 'text-purple-400',
        web: 'text-green-400',
        default: 'text-muted-foreground',
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-purple-400" />
                        Tool Definitions
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Built-in tools available to agents
                    </p>
                </div>
                <button
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30
                             text-purple-700 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                    {syncMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <RefreshCw className="w-4 h-4" />
                    )}
                    Sync from Server
                </button>
            </div>

            {/* Category filters */}
            {categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setSelectedCategory(null)}
                        className={`px-2.5 py-1 rounded text-xs transition-colors ${
                            selectedCategory === null
                                ? 'bg-accent/20 text-accent'
                                : 'bg-gray-700/50 text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        All ({tools.length})
                    </button>
                    {categories.map((cat: any) => (
                        <button
                            key={cat.name}
                            onClick={() => setSelectedCategory(cat.name)}
                            className={`px-2.5 py-1 rounded text-xs transition-colors ${
                                selectedCategory === cat.name
                                    ? 'bg-accent/20 text-accent'
                                    : 'bg-gray-700/50 text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {cat.name} ({cat.count})
                        </button>
                    ))}
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : filteredTools.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No tools found</p>
                    <p className="text-xs mt-1">Click "Sync from Server" to fetch tool definitions</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {filteredTools.map((tool: any) => (
                        <div key={tool.id} className="glass-card overflow-hidden">
                            <div
                                onClick={() => setExpandedTool(expandedTool === tool.id ? null : tool.id)}
                                className="p-4 cursor-pointer flex items-start justify-between"
                            >
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`text-xs font-medium ${categoryColors[tool.category] || categoryColors.default}`}>
                                            {tool.category}
                                        </span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                                            tool.risk_level === 'low' ? 'bg-green-500/20 text-green-700' :
                                            tool.risk_level === 'medium' ? 'bg-yellow-500/20 text-yellow-700' :
                                            tool.risk_level === 'high' ? 'bg-orange-500/20 text-orange-700' :
                                            'bg-red-500/20 text-red-700'
                                        }`}>
                                            {tool.risk_level}
                                        </span>
                                        {!tool.is_enabled && (
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-muted-foreground">
                                                disabled
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="text-sm font-semibold text-foreground mt-2">{tool.display_name}</h4>
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{tool.description}</p>
                                </div>
                                <div className="ml-3">
                                    {expandedTool === tool.id ? (
                                        <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                    )}
                                </div>
                            </div>
                            {expandedTool === tool.id && (
                                <div className="border-t border-border/50 px-4 py-4 space-y-4 animate-fade-in">
                                    <div>
                                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Description</div>
                                        <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{tool.description}</p>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Input Schema</div>
                                        <pre className="text-xs text-white/70 bg-black/20 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                                            {JSON.stringify(tool.input_schema, null, 2)}
                                        </pre>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground/50 font-mono">{tool.id}</div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Skills Tab ─────────────────────────────────────────────────────────────────
function SkillsTab() {
    const [installInput, setInstallInput] = useState('')
    const [installing, setInstalling] = useState(false)
    const [installResult, setInstallResult] = useState<{ success: boolean; message: string } | null>(null)
    const { data: skillsList, isLoading, refetch } = useQuery({
        queryKey: ['skills'],
        queryFn: async () => {
            const res = await fetch('/api/v1/skills')
            if (!res.ok) return []
            return res.json()
        },
    })

    const skills: any[] = Array.isArray(skillsList) ? skillsList : (skillsList?.skills ?? [])

    const handleInstall = async () => {
        if (!installInput.trim()) return
        setInstalling(true); setInstallResult(null)
        try {
            const res = await fetch('/api/v1/skills/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: installInput.trim() }),
            })
            const data = await res.json()
            if (res.ok) {
                setInstallResult({ success: true, message: data.message || 'Skill installed successfully' })
                setInstallInput('')
                await refetch()
            } else {
                setInstallResult({ success: false, message: data.detail || 'Installation failed' })
            }
        } catch (e: unknown) {
            const err = e as { message?: string }
            setInstallResult({ success: false, message: err?.message || 'Installation failed' })
        } finally { setInstalling(false) }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" />
                        Skills
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Manage agent skills and capabilities
                    </p>
                </div>
                <button
                    onClick={() => refetch()}
                    className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5"
                >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            <div className="glass-card p-4 space-y-3 border border-accent/20">
                <h4 className="text-sm font-medium">Install Skill</h4>
                <p className="text-xs text-muted-foreground">Enter a skill in <code>owner/skill-name</code> format from skills.sh (e.g. <code>vercel-labs/agent-skills</code>).</p>
                <div className="flex gap-2">
                    <input
                        className="input text-sm flex-1"
                        placeholder="e.g. vercel-labs/agent-skills"
                        value={installInput}
                        onChange={e => setInstallInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void handleInstall() }}
                    />
                    <button
                        className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap"
                        onClick={handleInstall}
                        disabled={installing || !installInput.trim()}
                    >
                        {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Install
                    </button>
                </div>
                {installResult && (
                    <div className={`flex items-start gap-2 text-xs p-2.5 rounded-lg ${installResult.success ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' : 'bg-destructive/10 text-red-700 border border-destructive/20'}`}>
                        {installResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                        {installResult.message}
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : skills.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No skills installed yet</p>
                    <p className="text-xs mt-1">Install skills to extend agent capabilities</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {skills.map((skill: any, i: number) => (
                        <div key={skill.id ?? skill.name ?? i} className="glass-card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                                        <span className="font-medium text-sm">{skill.name ?? skill.id ?? 'Unknown'}</span>
                                        {skill.version && <span className="chip-muted text-[10px]">v{skill.version}</span>}
                                    </div>
                                    {skill.description && (
                                        <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>
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

function AuditTab({ workspaceId }: { workspaceId: string }) {
    const [subTab, setSubTab] = useState<'history' | 'tool-executions' | 'logs'>('history')

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
                    onClick={() => setSubTab('tool-executions')}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 whitespace-nowrap ${subTab === 'tool-executions'
                        ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                >
                    <Activity className="w-4 h-4" /> Tool Executions
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
            {subTab === 'tool-executions' && <ToolExecutionLogSubTab />}
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

// ── Tool Execution Log ────────────────────────────────────────────────────────

interface ToolExecutionEntry {
    id: string
    workspace_id: string | null
    conversation_id: string | null
    execution_id: string | null
    tool_id: string
    tool_display_name: string | null
    tool_category: string | null
    input_params: Record<string, unknown> | null
    output_summary: string | null
    success: boolean
    error_message: string | null
    duration_ms: number | null
    started_at: string
}

const TOOL_CATEGORY_COLORS: Record<string, string> = {
    filesystem: 'text-blue-400 bg-blue-500/10',
    git: 'text-orange-400 bg-orange-500/10',
    http: 'text-green-400 bg-green-500/10',
    shell: 'text-yellow-400 bg-yellow-500/10',
    language: 'text-purple-400 bg-purple-500/10',
    memory: 'text-pink-400 bg-pink-500/10',
    task: 'text-cyan-400 bg-cyan-500/10',
    skills: 'text-indigo-400 bg-indigo-500/10',
}

function ToolExecutionLogSubTab() {
    const [filterCategory, setFilterCategory] = useState('')
    const [filterSuccess, setFilterSuccess] = useState<'' | 'true' | 'false'>('')
    const [expandedId, setExpandedId] = useState<string | null>(null)

    const { data: executions = [], isLoading, refetch } = useQuery<ToolExecutionEntry[]>({
        queryKey: ['tool-executions', filterCategory, filterSuccess],
        queryFn: async () => {
            const params = new URLSearchParams()
            if (filterCategory) params.set('tool_category', filterCategory)
            if (filterSuccess !== '') params.set('success', filterSuccess)
            params.set('limit', '100')
            const res = await fetch(`/api/v1/tools/executions?${params}`)
            if (!res.ok) throw new Error('Failed to fetch tool executions')
            return res.json()
        },
        refetchInterval: 15000,
    })

    const formatDuration = (ms: number | null) => {
        if (!ms) return '—'
        if (ms < 1000) return `${ms}ms`
        return `${(ms / 1000).toFixed(1)}s`
    }

    const categories = useMemo(() => {
        const cats = new Set(executions.map(e => e.tool_category).filter(Boolean))
        return Array.from(cats).sort()
    }, [executions])

    return (
        <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-sm">Tool Execution Audit Log</h3>
                <div className="flex items-center gap-2">
                    <select
                        className="input text-xs py-1.5 pr-7 w-auto"
                        value={filterCategory}
                        onChange={e => setFilterCategory(e.target.value)}
                    >
                        <option value="">All categories</option>
                        {categories.map(c => (
                            <option key={c} value={c!}>{c}</option>
                        ))}
                    </select>
                    <select
                        className="input text-xs py-1.5 pr-7 w-auto"
                        value={filterSuccess}
                        onChange={e => setFilterSuccess(e.target.value as '' | 'true' | 'false')}
                    >
                        <option value="">All results</option>
                        <option value="true">Successful</option>
                        <option value="false">Failed</option>
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

            {!isLoading && executions.length === 0 && (
                <div className="text-center py-14 text-muted-foreground glass-card rounded-xl">
                    <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No tool executions recorded yet.</p>
                    <p className="text-xs mt-1 opacity-60">Tool calls made by the agent will appear here.</p>
                </div>
            )}

            {!isLoading && executions.length > 0 && (
                <div className="space-y-2">
                    {executions.map(entry => {
                        const isExpanded = expandedId === entry.id
                        const categoryColor = TOOL_CATEGORY_COLORS[entry.tool_category ?? ''] ?? 'text-muted-foreground bg-muted/30'
                        return (
                            <div key={entry.id} className="glass-card rounded-xl border-border/50 overflow-hidden">
                                <button
                                    className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-muted/20 transition-colors"
                                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                                >
                                    <div className="mt-0.5">
                                        {entry.success
                                            ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                                            : <XCircle className="w-4 h-4 text-red-400" />
                                        }
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <span className="text-sm font-medium">
                                                {entry.tool_display_name ?? entry.tool_id}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {entry.tool_category && (
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${categoryColor}`}>
                                                        {entry.tool_category}
                                                    </span>
                                                )}
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${entry.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                    {entry.success ? 'success' : 'failed'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                                            <span>{new Date(entry.started_at).toLocaleString()}</span>
                                            {entry.duration_ms !== null && <span>Duration: {formatDuration(entry.duration_ms)}</span>}
                                            {entry.tool_id !== entry.tool_display_name && (
                                                <span className="font-mono opacity-60">{entry.tool_id}</span>
                                            )}
                                        </div>
                                        {entry.error_message && (
                                            <p className="text-[10px] text-red-400 mt-1 font-mono truncate" title={entry.error_message}>
                                                {entry.error_message}
                                            </p>
                                        )}
                                    </div>
                                    <ChevronRight className={`w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                </button>

                                {isExpanded && (
                                    <div className="border-t border-border/30 px-4 py-3 space-y-3 bg-muted/10">
                                        {entry.input_params && Object.keys(entry.input_params).length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Input</p>
                                                <pre className="text-[10px] font-mono bg-background/60 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                                                    {JSON.stringify(entry.input_params, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                        {entry.output_summary && (
                                            <div>
                                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Output</p>
                                                <pre className="text-[10px] font-mono bg-background/60 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                                                    {entry.output_summary}
                                                </pre>
                                            </div>
                                        )}
                                        <div className="flex gap-4 text-[10px] text-muted-foreground flex-wrap">
                                            {entry.conversation_id && (
                                                <span>Conversation: <span className="font-mono">{entry.conversation_id.slice(0, 8)}…</span></span>
                                            )}
                                            {entry.execution_id && (
                                                <span>Execution: <span className="font-mono">{entry.execution_id.slice(0, 12)}…</span></span>
                                            )}
                                        </div>
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
                    className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5 text-red-400 hover:text-red-700 hover:bg-red-900/20 shrink-0"
                    onClick={() => setLogs([])}
                >
                    <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
            </div>

            <div className="min-h-0 flex-1 glass-card border border-border/50 rounded-xl overflow-y-auto p-4 font-mono text-xs bg-black/40 text-gray-700 flex flex-col gap-1 relative">
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
