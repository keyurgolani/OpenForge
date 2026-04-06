import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
    listWorkspaces, listProviders, createWorkspace, updateWorkspace, deleteWorkspace,
    listSettings,
} from '@/lib/api'
import {
    Loader2, Trash2, CheckCircle2, Plus,
    Eye, Save, Bot, Brain, AlertCircle,
} from 'lucide-react'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { sanitizeProviderDisplayName } from '@/lib/provider-display'
import { cn } from '@/lib/utils'
import type { WorkspaceRow, ProviderRow } from './types'
import { WORKSPACE_ICONS, WORKSPACE_ICON_NAMES, getWorkspaceIcon } from './constants'

// ── WorkspaceDetail ────────────────────────────────────────────────────────

function WorkspaceDetail({
    workspace: ws,
    providers,
    onDeleted,
    onSaved,
}: {
    workspace: WorkspaceRow
    providers: ProviderRow[]
    onDeleted: () => void
    onSaved: () => void
}) {
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
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

    // Sync form state when a different workspace is selected
    useEffect(() => {
        setName(ws.name)
        setDescription(ws.description ?? '')
        setIcon(ws.icon ?? 'folder')
        setShowIcons(false)
        setProviderId(ws.llm_provider_id ?? '')
        setModel(ws.llm_model ?? '')
        setKiProviderId(ws.knowledge_intelligence_provider_id ?? '')
        setKiModel(ws.knowledge_intelligence_model ?? '')
        setVisionProviderId(ws.vision_provider_id ?? '')
        setVisionModel(ws.vision_model ?? '')
        setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset form fields when workspace selection changes
    }, [ws.id])

    const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })

    const chatModels = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === 'system_chat_models')?.value
        if (Array.isArray(raw) && raw.length > 0) {
            return (raw as { provider_id: string; model_id: string; model_name: string }[]).map(m => {
                const p = providers.find(pr => pr.id === m.provider_id)
                return {
                    value: `${m.provider_id}:${m.model_id}`,
                    label: `${p ? sanitizeProviderDisplayName(p.display_name) : 'Unknown'} / ${m.model_name}`,
                    provider_id: m.provider_id,
                    model_id: m.model_id,
                }
            })
        }
        return providers.flatMap(p =>
            (p.enabled_models ?? []).map(m => ({
                value: `${p.id}:${m.id}`,
                label: `${sanitizeProviderDisplayName(p.display_name)} / ${m.name}`,
                provider_id: p.id,
                model_id: m.id,
            }))
        )
    }, [settings, providers])

    const visionModels = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === 'system_vision_models')?.value
        if (Array.isArray(raw) && raw.length > 0) {
            return (raw as { provider_id: string; model_id: string; model_name: string }[]).map(m => {
                const p = providers.find(pr => pr.id === m.provider_id)
                return {
                    value: `${m.provider_id}:${m.model_id}`,
                    label: `${p ? sanitizeProviderDisplayName(p.display_name) : 'Unknown'} / ${m.model_name}`,
                    provider_id: m.provider_id,
                    model_id: m.model_id,
                }
            })
        }
        return providers.flatMap(p =>
            (p.enabled_models ?? []).map(m => ({
                value: `${p.id}:${m.id}`,
                label: `${sanitizeProviderDisplayName(p.display_name)} / ${m.name}`,
                provider_id: p.id,
                model_id: m.id,
            }))
        )
    }, [settings, providers])

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
        })
        setSaving(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        onSaved()
    }

    const confirmDelete = async () => {
        setDeleteConfirmOpen(false)
        setDeleting(true)
        await deleteWorkspace(ws.id)
        onDeleted()
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center flex-shrink-0">
                        {getWorkspaceIcon(ws.icon)}
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm">{ws.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {ws.knowledge_count} knowledge
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    className="btn-ghost p-1.5 text-red-400 hover:bg-destructive/10 flex-shrink-0"
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={deleting}
                    aria-label="Delete workspace"
                >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
            </div>

            {/* Name + icon */}
            <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Name</label>
                <div className="flex items-center gap-2">
                    <div className="relative flex-shrink-0">
                        <button
                            type="button"
                            onClick={() => setShowIcons(v => !v)}
                            className="rounded-lg border border-border/25 bg-muted/20 h-10 w-11 px-0 flex items-center justify-center hover:bg-muted/40 transition-colors"
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
                                            className={cn(
                                                'w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors',
                                                icon === ic && 'bg-accent/25 ring-1 ring-accent'
                                            )}
                                        >
                                            <IconComp className="w-4 h-4" />
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    <input
                        className="rounded-lg border border-border/25 bg-muted/20 px-3 py-2 text-sm flex-1 outline-none focus:border-accent/50 focus:bg-muted/30 transition-colors"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Workspace name"
                    />
                </div>
            </div>

            {/* Description */}
            <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Description</label>
                <textarea
                    className="rounded-lg border border-border/25 bg-muted/20 px-3 py-2 text-sm w-full resize-none outline-none focus:border-accent/50 focus:bg-muted/30 transition-colors"
                    rows={3}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Optional description"
                />
            </div>

            {/* AI Models */}
            <div className="border-t border-border/25 pt-4 space-y-4">
                <div>
                    <p className="text-xs font-medium text-muted-foreground">
                        AI Models{' '}
                        <span className="font-normal opacity-60">(override global defaults per category for this workspace)</span>
                    </p>
                </div>

                {chatModels.length === 0 && visionModels.length === 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        <span>No models configured yet. Go to <strong>AI Models</strong> → <strong>Chat</strong> / <strong>Vision</strong> tabs to add models first.</span>
                    </div>
                )}

                {/* Chat Model */}
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                        <Bot className="w-3 h-3 text-accent" />
                        <p className="text-xs font-medium">Chat Model</p>
                        <span className="text-[10px] text-muted-foreground opacity-70">Used for chat and agent tool calls</span>
                    </div>
                    <select
                        className="rounded-lg border border-border/25 bg-muted/20 px-3 py-2 text-sm w-full outline-none focus:border-accent/50 transition-colors"
                        value={chatSelectValue}
                        onChange={e => handleChatModelSelect(e.target.value)}
                    >
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
                    <select
                        className="rounded-lg border border-border/25 bg-muted/20 px-3 py-2 text-sm w-full outline-none focus:border-accent/50 transition-colors"
                        value={kiSelectValue}
                        onChange={e => handleKiModelSelect(e.target.value)}
                    >
                        <option value="">Use system default</option>
                        {chatModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>

                {/* Vision Model */}
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                        <Eye className="w-3 h-3 text-sky-400" />
                        <p className="text-xs font-medium">Vision Model</p>
                        <span className="text-[10px] text-muted-foreground opacity-70">Used for image and visual content extraction</span>
                    </div>
                    <select
                        className="rounded-lg border border-border/25 bg-muted/20 px-3 py-2 text-sm w-full outline-none focus:border-accent/50 transition-colors"
                        value={visionSelectValue}
                        onChange={e => handleVisionModelSelect(e.target.value)}
                    >
                        <option value="">Use system default</option>
                        {visionModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>
            </div>

            {/* Save */}
            <div className="pt-1">
                <button
                    className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5"
                    onClick={handleSave}
                    disabled={saving || !name.trim()}
                >
                    {saved
                        ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</>
                        : saving
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <><Save className="w-3.5 h-3.5" /> Save Changes</>}
                </button>
            </div>

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

// ── WorkspacesPage ─────────────────────────────────────────────────────────

export function WorkspacesPage() {
    const qc = useQueryClient()
    const [searchParams, setSearchParams] = useSearchParams()

    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })

    const workspaceList = workspaces as WorkspaceRow[]
    const providerList = providers as ProviderRow[]

    const [selectedId, setSelectedId] = useState<string | null>(null)

    // Auto-select first workspace on mount / when list loads
    useEffect(() => {
        if (workspaceList.length > 0 && (!selectedId || !workspaceList.find(w => w.id === selectedId))) {
            setSelectedId(workspaceList[0].id)
        }
    }, [workspaceList, selectedId])

    // New workspace form state
    const [showAdd, setShowAdd] = useState(false)
    const [newName, setNewName] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [adding, setAdding] = useState(false)

    // Handle ?newWorkspace=1 query param
    useEffect(() => {
        if (searchParams.get('newWorkspace') !== '1') return
        setShowAdd(true)
        const next = new URLSearchParams(searchParams)
        next.delete('newWorkspace')
        setSearchParams(next, { replace: true })
    }, [searchParams, setSearchParams])

    const handleAdd = async () => {
        if (!newName.trim()) return
        setAdding(true)
        const created = await createWorkspace({ name: newName.trim(), description: newDesc || undefined }) as WorkspaceRow
        await qc.invalidateQueries({ queryKey: ['workspaces'] })
        setNewName('')
        setNewDesc('')
        setShowAdd(false)
        setAdding(false)
        if (created?.id) setSelectedId(created.id)
    }

    const selectedWorkspace = workspaceList.find(w => w.id === selectedId) ?? null

    return (
        <div className="flex h-full">
            {/* Left panel — workspace list */}
            <div className="w-64 flex-shrink-0 border-r border-border/25 overflow-y-auto p-4 space-y-1">
                {/* New Workspace button */}
                <button
                    type="button"
                    className="btn-primary text-xs py-1.5 px-3 w-full flex items-center gap-1.5 mb-3"
                    onClick={() => setShowAdd(v => !v)}
                >
                    <Plus className="w-3.5 h-3.5" />
                    New Workspace
                </button>

                {/* Inline create form */}
                {showAdd && (
                    <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 space-y-2 mb-2">
                        <p className="text-xs font-semibold text-accent">New Workspace</p>
                        <input
                            className="rounded-lg border border-border/25 bg-muted/20 px-2.5 py-1.5 text-xs w-full outline-none focus:border-accent/50 transition-colors"
                            placeholder="Name"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void handleAdd() }}
                            autoFocus
                        />
                        <input
                            className="rounded-lg border border-border/25 bg-muted/20 px-2.5 py-1.5 text-xs w-full outline-none focus:border-accent/50 transition-colors"
                            placeholder="Description (optional)"
                            value={newDesc}
                            onChange={e => setNewDesc(e.target.value)}
                        />
                        <div className="flex gap-1.5">
                            <button
                                className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1"
                                onClick={handleAdd}
                                disabled={!newName.trim() || adding}
                            >
                                {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                Create
                            </button>
                            <button
                                className="btn-ghost text-xs py-1 px-2.5"
                                onClick={() => { setShowAdd(false); setNewName(''); setNewDesc('') }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Workspace list items */}
                {workspaceList.map(ws => (
                    <button
                        key={ws.id}
                        type="button"
                        onClick={() => setSelectedId(ws.id)}
                        className={cn(
                            'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                            ws.id === selectedId
                                ? 'bg-accent/15 text-accent'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        )}
                    >
                        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                            {getWorkspaceIcon(ws.icon)}
                        </span>
                        <span className="text-xs font-medium truncate">{ws.name}</span>
                    </button>
                ))}

                {workspaceList.length === 0 && !showAdd && (
                    <p className="text-xs text-muted-foreground text-center py-4">No workspaces yet.</p>
                )}
            </div>

            {/* Right panel — workspace detail */}
            <div className="flex-1 min-w-0 overflow-y-auto p-6">
                {selectedWorkspace ? (
                    <WorkspaceDetail
                        key={selectedWorkspace.id}
                        workspace={selectedWorkspace}
                        providers={providerList}
                        onDeleted={() => {
                            qc.invalidateQueries({ queryKey: ['workspaces'] })
                            setSelectedId(null)
                        }}
                        onSaved={() => {
                            qc.invalidateQueries({ queryKey: ['workspaces'] })
                        }}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                        {workspaceList.length === 0
                            ? 'Create a workspace to get started.'
                            : 'Select a workspace to view its settings.'}
                    </div>
                )}
            </div>
        </div>
    )
}

export default WorkspacesPage
