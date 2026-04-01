import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Check, Copy, MessageSquare, Pencil, Plus, Trash2, X } from 'lucide-react'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import PromptTemplateEditor, { extractVariables } from '@/components/shared/PromptTemplateEditor'
import AgentConfigSiderail from '@/components/agents/AgentConfigSiderail'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import {
  useAgentQuery,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useAgentVersionsQuery,
  useAgentVersionQuery,
} from '@/features/agents'
import { getTemplateReference } from '@/lib/api'
import { agentsRoute, globalChatRoute } from '@/lib/routes'
import type {
  AgentDefinition,
  AgentDefinitionCreate,
  AgentDefinitionUpdate,
  ParameterConfig,
  LlmConfig,
  ToolConfig,
  MemoryConfig,
  OutputDefinition,
} from '@/types/agents'
import type { TemplateReferenceData } from '@/types/deployments'

// ── Defaults ──

const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: null,
  model: null,
  temperature: 0.7,
  max_tokens: 2000,
  allow_override: true,
}

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  history_limit: 20,
  attachment_support: true,
  auto_bookmark_urls: true,
}

// Internal types with stable keys for React list rendering
interface ParameterConfigWithKey extends ParameterConfig {
  _key: string
}
interface OutputDefinitionWithKey extends OutputDefinition {
  _key: string
}

let _nextKey = 0
function nextKey(): string {
  return `_k${++_nextKey}`
}

interface FormState {
  name: string
  slug: string
  description: string
  system_prompt: string
  tags: string[]
  parameters: ParameterConfigWithKey[]
  llm_config: LlmConfig
  tools_config: ToolConfig[]
  memory_config: MemoryConfig
  output_definitions: OutputDefinitionWithKey[]
}

function defaultFormState(): FormState {
  return {
    name: '',
    slug: '',
    description: '',
    system_prompt: '',
    tags: [],
    parameters: [],
    llm_config: { ...DEFAULT_LLM_CONFIG },
    tools_config: [],
    memory_config: { ...DEFAULT_MEMORY_CONFIG },
    output_definitions: [],
  }
}

function agentToFormState(agent: AgentDefinition): FormState {
  return {
    name: agent.name,
    slug: agent.slug,
    description: agent.description ?? '',
    system_prompt: agent.system_prompt ?? '',
    tags: agent.tags ?? [],
    parameters: (agent.parameters ?? []).map((p) => ({ ...p, _key: nextKey() })),
    llm_config: {
      ...DEFAULT_LLM_CONFIG,
      ...(agent.llm_config ?? {}),
      temperature: Math.round(((agent.llm_config?.temperature ?? DEFAULT_LLM_CONFIG.temperature) + Number.EPSILON) * 10) / 10,
    },
    tools_config: (agent.tools_config ?? []).map((t) => ({
      name: t.name,
      category: t.category ?? 'other',
      mode: t.mode ?? 'allowed',
    })),
    memory_config: { ...DEFAULT_MEMORY_CONFIG, ...(agent.memory_config ?? {}) },
    output_definitions: (agent.output_definitions ?? []).map((o) => ({ ...o, _key: nextKey() })),
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const PARAM_TYPES: ParameterConfig['type'][] = ['text', 'enum', 'number', 'boolean']

// ── Component ──

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const isCreateMode = !agentId || agentId === 'new'

  const { data: agent, isLoading, error } = useAgentQuery(isCreateMode ? undefined : agentId)
  const createAgent = useCreateAgent()
  const updateAgent = useUpdateAgent()
  const deleteAgent = useDeleteAgent()

  const [isEditing, setIsEditing] = useState(isCreateMode)
  const [formState, setFormState] = useState<FormState>(defaultFormState)
  const [viewingVersion, setViewingVersion] = useState<string | null>(null)
  const [referenceData, setReferenceData] = useState<TemplateReferenceData | null>(null)
  const [autoSlug, setAutoSlug] = useState(isCreateMode)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)

  // Reset editing mode when agentId changes (e.g. after creation navigates to detail)
  useEffect(() => {
    setIsEditing(isCreateMode)
    setAutoSlug(isCreateMode)
    if (isCreateMode) {
      setFormState(defaultFormState())
    }
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load template reference for PromptTemplateEditor autocomplete
  useEffect(() => {
    getTemplateReference().then(setReferenceData).catch(() => {})
  }, [])

  // Sync form state from loaded agent
  useEffect(() => {
    if (agent && !isCreateMode) {
      setFormState(agentToFormState(agent))
    }
  }, [agent, isCreateMode])

  // ── Version history ──
  const { data: versionsData } = useAgentVersionsQuery(isCreateMode ? '' : (agentId ?? ''))
  const { data: versionSnapshot } = useAgentVersionQuery(
    isCreateMode ? '' : (agentId ?? ''),
    viewingVersion ?? '',
  )

  // When viewing a version, overlay its snapshot onto the form
  const displayState = useMemo<FormState>(() => {
    if (viewingVersion && versionSnapshot?.snapshot) {
      const snap = versionSnapshot.snapshot as Partial<AgentDefinition>
      return {
        name: snap.name ?? formState.name,
        slug: snap.slug ?? formState.slug,
        description: snap.description ?? '',
        system_prompt: (snap.system_prompt as string) ?? '',
        tags: (snap.tags as string[]) ?? [],
        parameters: ((snap.parameters as ParameterConfig[]) ?? []).map((p) => ({ ...p, _key: nextKey() })),
        llm_config: {
          ...DEFAULT_LLM_CONFIG,
          ...((snap.llm_config as Partial<LlmConfig>) ?? {}),
          temperature: Math.round((((snap.llm_config as Partial<LlmConfig>)?.temperature ?? DEFAULT_LLM_CONFIG.temperature) + Number.EPSILON) * 10) / 10,
        },
        tools_config: (snap.tools_config as ToolConfig[]) ?? [],
        memory_config: { ...DEFAULT_MEMORY_CONFIG, ...((snap.memory_config as Partial<MemoryConfig>) ?? {}) },
        output_definitions: ((snap.output_definitions as OutputDefinition[]) ?? []).map((o) => ({ ...o, _key: nextKey() })),
      }
    }
    return formState
  }, [viewingVersion, versionSnapshot, formState])

  // ── Field updaters ──
  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'name' && autoSlug) {
        next.slug = slugify(value as string)
      }
      return next
    })
  }, [autoSlug])

  const updateParam = useCallback((index: number, patch: Partial<ParameterConfig>) => {
    setFormState((prev) => {
      const params = [...prev.parameters]
      params[index] = { ...params[index], ...patch }
      return { ...prev, parameters: params }
    })
  }, [])

  const addParam = useCallback(() => {
    setFormState((prev) => ({
      ...prev,
      parameters: [
        ...prev.parameters,
        { name: '', type: 'text', label: null, description: null, required: true, default: null, options: [], _key: nextKey() },
      ],
    }))
  }, [])

  const removeParam = useCallback((index: number) => {
    setFormState((prev) => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index),
    }))
  }, [])

  // ── Actions ──
  const handleSave = async () => {
    if (isCreateMode) {
      if (!formState.name.trim() || !formState.slug.trim()) return
      // Filter out parameters/outputs with empty names/keys, strip internal _key
      const validParams = formState.parameters
        .filter((p) => p.name.trim())
        .map(({ _key: _, ...rest }) => rest)
      const validOutputs = formState.output_definitions
        .filter((o) => o.key.trim())
        .map(({ _key: _, ...rest }) => rest)
      const payload: AgentDefinitionCreate = {
        name: formState.name.trim(),
        slug: formState.slug.trim(),
        description: formState.description.trim() || undefined,
        system_prompt: formState.system_prompt,
        tags: formState.tags,
        parameters: validParams,
        llm_config: formState.llm_config,
        tools_config: formState.tools_config,
        memory_config: formState.memory_config,
        output_definitions: validOutputs,
      }
      try {
        const created = await createAgent.mutateAsync(payload)
        navigate(agentsRoute(created.id))
      } catch {
        // handled by global interceptor
      }
    } else {
      if (!agentId) return
      // Filter out parameters/outputs with empty names/keys, strip internal _key
      const validParams = formState.parameters
        .filter((p) => p.name.trim())
        .map(({ _key: _, ...rest }) => rest)
      const validOutputs = formState.output_definitions
        .filter((o) => o.key.trim())
        .map(({ _key: _, ...rest }) => rest)
      const payload: AgentDefinitionUpdate = {
        name: formState.name.trim(),
        slug: formState.slug.trim(),
        description: formState.description.trim() || undefined,
        system_prompt: formState.system_prompt,
        tags: formState.tags,
        parameters: validParams,
        llm_config: formState.llm_config,
        tools_config: formState.tools_config,
        memory_config: formState.memory_config,
        output_definitions: validOutputs,
      }
      try {
        await updateAgent.mutateAsync({ id: agentId, data: payload })
        setIsEditing(false)
      } catch {
        // handled by global interceptor
      }
    }
  }

  const handleCancel = () => {
    if (isCreateMode) {
      navigate(agentsRoute())
    } else if (agent) {
      setFormState(agentToFormState(agent))
      setIsEditing(false)
    }
  }

  const handleDelete = async () => {
    if (!agentId) return
    try {
      await deleteAgent.mutateAsync(agentId)
      setShowDeleteModal(false)
      navigate(agentsRoute())
    } catch {
      // handled by global interceptor
    }
  }

  const handleEdit = () => {
    setViewingVersion(null)
    setAutoSlug(false)
    setIsEditing(true)
  }

  const handleDuplicate = async () => {
    if (!agent) return
    setIsDuplicating(true)
    try {
      const copy = await createAgent.mutateAsync({
        name: `${agent.name} (Copy)`,
        slug: `${agent.slug}-copy`,
        description: agent.description ?? undefined,
        icon: agent.icon ?? undefined,
        tags: agent.tags,
        system_prompt: agent.system_prompt,
        llm_config: agent.llm_config,
        tools_config: agent.tools_config,
        memory_config: agent.memory_config,
        parameters: agent.parameters,
        output_definitions: agent.output_definitions,
      })
      navigate(`/agents/${copy.id}`)
    } catch {
      // handled by global interceptor
    } finally {
      setIsDuplicating(false)
    }
  }

  // ── Loading / error states ──
  if (!isCreateMode && isLoading) return <LoadingState label="Loading agent..." />
  if (!isCreateMode && (error || !agent)) return <ErrorState message="Agent could not be loaded." />

  const isSaving = createAgent.isPending || updateAgent.isPending
  const isViewingVersion = viewingVersion !== null

  return (
    <div className="flex h-full gap-4 p-6 overflow-hidden">
      {/* ── Main area ── */}
      <div className="flex flex-1 flex-col gap-0 min-w-0 overflow-y-auto min-h-0">
        {/* Version viewing banner */}
        {isViewingVersion && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
            <p className="text-sm text-amber-200">
              Viewing version snapshot. Fields are read-only.
            </p>
            <button
              className="text-xs font-medium text-amber-300 hover:text-amber-100 transition"
              onClick={() => setViewingVersion(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Top Zone: Name + Description + Actions ── */}
        <div className="rounded-2xl border border-border/25 bg-card/35 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 min-w-0">
              {isEditing && !isViewingVersion ? (
                <input
                  className="input text-2xl font-semibold tracking-tight w-full"
                  value={formState.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="Agent name"
                  autoFocus={isCreateMode}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <Bot className="h-6 w-6 text-accent flex-shrink-0" />
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground truncate">
                    {displayState.name || 'Untitled Agent'}
                  </h2>
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                {isEditing && !isViewingVersion ? (
                  <input
                    className="input text-xs font-mono w-full max-w-xs mt-1"
                    value={formState.slug}
                    onChange={(e) => {
                      setAutoSlug(false)
                      setField('slug', e.target.value)
                    }}
                    placeholder="agent-slug"
                  />
                ) : (
                  displayState.slug || 'agent-slug'
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {isEditing && !isViewingVersion ? (
                <>
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {isSaving ? 'Saving...' : isCreateMode ? 'Create' : 'Save'}
                  </button>
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={handleCancel}
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90"
                    onClick={handleEdit}
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  {!isCreateMode && (
                    <>
                      <button
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-600/90"
                        onClick={() => navigate(globalChatRoute(undefined, { agentId: agentId }))}
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Chat
                      </button>
                      <button
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/30"
                        onClick={handleDuplicate}
                        disabled={isDuplicating}
                      >
                        <Copy className="w-3.5 h-3.5" /> {isDuplicating ? 'Duplicating...' : 'Duplicate'}
                      </button>
                    </>
                  )}
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-medium text-red-400 transition-colors hover:text-red-300 hover:bg-red-500/20"
                    onClick={() => setShowDeleteModal(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => navigate(agentsRoute())}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Description — full width inside header */}
          <div className="mt-4">
            {isEditing && !isViewingVersion ? (
              <textarea
                className="input w-full min-h-[60px] text-sm resize-y"
                value={formState.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Describe what this agent does..."
              />
            ) : (
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                {displayState.description || <span className="text-muted-foreground italic">No description</span>}
              </p>
            )}
          </div>
        </div>

        {/* ── Input Parameters + Output Definitions row ── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Input Parameters */}
          <div className="rounded-xl border border-border/25 bg-card/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Input Parameters</p>
              {isEditing && !isViewingVersion && (
                <button
                  className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition"
                  onClick={addParam}
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              )}
            </div>
            {displayState.parameters.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No parameters defined</p>
            ) : (
              <div className="space-y-2">
                {displayState.parameters.map((param, idx) => (
                  <ParameterRow
                    key={param._key}
                    param={param}
                    isEditing={isEditing && !isViewingVersion}
                    onChange={(patch) => updateParam(idx, patch)}
                    onRemove={() => removeParam(idx)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Output Definitions */}
          <div className="rounded-xl border border-border/25 bg-card/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Output Definitions</p>
              {isEditing && !isViewingVersion && (
                <button
                  className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition"
                  onClick={() => setField('output_definitions', [
                    ...formState.output_definitions,
                    { key: '', type: 'text' as const, label: '', description: '', _key: nextKey() },
                  ])}
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              )}
            </div>
            {displayState.output_definitions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No outputs defined</p>
            ) : (
              <div className="space-y-2">
                {displayState.output_definitions.map((out, idx) => (
                  <OutputRow
                    key={out._key}
                    output={out}
                    isEditing={isEditing && !isViewingVersion}
                    onChange={(patch) => {
                      const updated = [...formState.output_definitions]
                      updated[idx] = { ...updated[idx], ...patch }
                      setField('output_definitions', updated)
                    }}
                    onRemove={() => {
                      setField('output_definitions', formState.output_definitions.filter((_, i) => i !== idx))
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── System Prompt Section ── */}
        <div className="mt-4 flex-1 min-h-0 flex flex-col">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground mb-2">System Prompt</p>

          <div className="flex-1 flex gap-3 min-h-0">
            {/* Editor — 80% */}
            <div className="flex-[4] min-h-[250px]">
              <PromptTemplateEditor
                value={displayState.system_prompt}
                onChange={(val) => setField('system_prompt', val)}
                readOnly={!isEditing || isViewingVersion}
                referenceData={referenceData}
                preamble={PREAMBLE_TEMPLATE}
                postamble={POSTAMBLE_TEMPLATE}
                className="h-full"
              />
            </div>

            {/* Variables sidebar — 20% */}
            <PromptVariablesSidebar
              systemPrompt={displayState.system_prompt}
              referenceData={referenceData}
              outputDefinitions={displayState.output_definitions}
            />
          </div>
        </div>
      </div>

      {/* ── Config Siderail ── */}
      <AgentConfigSiderail
        llmConfig={displayState.llm_config}
        toolsConfig={displayState.tools_config}
        memoryConfig={displayState.memory_config}
        tags={displayState.tags}
        isEditing={isEditing && !isViewingVersion}
        createdAt={agent?.created_at}
        updatedAt={agent?.updated_at}
        versions={!isCreateMode ? versionsData?.versions : undefined}
        viewingVersion={viewingVersion}
        onViewVersion={setViewingVersion}
        onChange={(field, value) => setField(field as keyof FormState, value as FormState[keyof FormState])}
      />

      {/* ── Delete Confirmation Modal ── */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Agent"
        message={`Are you sure you want to delete "${formState.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        icon="trash"
        loading={deleteAgent.isPending}
      />
    </div>
  )
}

// ── Parameter Row Sub-component ──

// ── Postamble Template ──

const POSTAMBLE_TEMPLATE = `# OpenForge Application Context

{% if system.workspaces %}
## Available Workspaces
{{system.workspace_context}}
{% for ws in system.workspaces %}
- **{{ws.name}}** (id: \`{{ws.id}}\`{% if ws.knowledge_count %}, {{ws.knowledge_count}} knowledge items{% endif %}){% if ws.description %}: {{ws.description}}{% endif %}
{% endfor %}
{% endif %}

{% if contains(system.tools, "platform.agent.invoke") %}
## Available Agents
You can invoke these agents via the \`platform.agent.invoke\` tool:
{% for ag in system.agents %}
- **{{ag.slug}}**{% if ag.tags %} [{{join(ag.tags, ", ")}}]{% endif %}: {{ag.description}}
{% endfor %}
{% endif %}

{% if system.skills %}
## Available Skills
If there are relevant skills, use tools to read the skills to enhance your ability to tackle the request.
{% for sk in system.skills %}
- \`{{sk.name}}\`: {{sk.description}}
{% endfor %}
{% endif %}`

// ── Preamble Template ──

const PREAMBLE_TEMPLATE = `# Agent: {{system.agent_name}}
You are **{{system.agent_name}}**{% if system.agent_description %} — {{system.agent_description}}.{% else %}, an AI agent in OpenForge.{% endif %}
You are running on the **OpenForge** platform.

{% if system.input_schema %}
## Input Variables
{% for p in system.input_schema %}
- \`{{p.name}}\` ({{p.type}}{% if p.required %}, required{% endif %}){% if p.description %} — {{p.description}}{% endif %}
{% endfor %}
{% endif %}

{% if system.output_definitions %}
## Output Variables
You MUST structure your final response so the system can extract these output variables:
{% for out in system.output_definitions %}
- \`{{out.key}}\` ({{out.type}}){% if out.label %} — {{out.label}}{% endif %}
{% endfor %}

Wrap your structured output in a fenced block:
\`\`\`output
{
{% for out in system.output_definitions %}
  "{{out.key}}": <{{out.type}} value>{% if not loop.last %},{% endif %}
{% endfor %}
}
\`\`\`
{% endif %}`

// ── Prompt Variables Sidebar ──

interface SystemVarDef {
  name: string
  description: string
  category: string
  children?: { name: string; description: string }[]
}

function PromptVariablesSidebar({
  systemPrompt,
  referenceData,
  outputDefinitions,
}: {
  systemPrompt: string
  referenceData: TemplateReferenceData | null
  outputDefinitions: OutputDefinition[]
}) {
  const detectedVars = useMemo(() => extractVariables(systemPrompt), [systemPrompt])
  const systemVars: SystemVarDef[] = (referenceData?.system_variables ?? []) as SystemVarDef[]

  const categories = useMemo(() => {
    const map = new Map<string, SystemVarDef[]>()
    systemVars.forEach((v) => {
      const list = map.get(v.category) ?? []
      list.push(v)
      map.set(v.category, list)
    })
    return map
  }, [systemVars])

  // Group functions by category
  const functionCategories = useMemo(() => {
    const fns = referenceData?.functions ?? []
    const map = new Map<string, typeof fns>()
    fns.forEach((fn) => {
      const list = map.get(fn.category) ?? []
      list.push(fn)
      map.set(fn.category, list)
    })
    return map
  }, [referenceData])

  const [expandedFnCat, setExpandedFnCat] = useState<string | null>(null)

  return (
    <div className="flex-1 overflow-y-auto rounded-xl border border-border/25 bg-card/20 p-3 space-y-3">
      {/* Title */}
      <div className="border-b border-border/20 pb-2">
        <p className="text-[11px] font-semibold text-foreground/90 tracking-tight">
          Template Reference
        </p>
        <p className="text-[9px] text-muted-foreground/80 mt-0.5">
          Variables, functions &amp; syntax for the template engine
        </p>
      </div>

      {/* Detected Variables */}
      {detectedVars.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/70 mb-1.5">
            Detected ({detectedVars.length})
          </p>
          <div className="space-y-1">
            {detectedVars.map((v) => (
              <div key={v.name} className="flex items-baseline gap-1.5 text-xs">
                <code className="rounded bg-accent/8 px-1 py-0.5 text-[10px] text-accent font-mono">
                  {`{{${v.name}}}`}
                </code>
                <span className="text-muted-foreground text-[10px]">{v.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Variables by category */}
      {categories.size > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            System Variables
          </p>
          <div className="space-y-3">
            {Array.from(categories.entries()).map(([cat, vars]) => (
              <div key={cat}>
                <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/65 mb-1 pl-0.5">
                  {cat}
                </p>
                <div className="space-y-1.5">
                  {vars.map((v) => (
                    <div key={v.name} className="flex flex-col gap-0.5">
                      <code className="rounded bg-accent/8 px-1 py-0.5 text-[10px] text-accent font-mono w-fit">
                        {`{{${v.name}}}`}
                      </code>
                      <span className="text-muted-foreground text-[10px] pl-1">{v.description}</span>
                      {v.children && v.children.length > 0 && (
                        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border/20 pl-2">
                          {v.children.map((c) => (
                            <div key={c.name} className="flex items-baseline gap-1 text-[10px]">
                              <code className="text-accent/60 font-mono">.{c.name}</code>
                              <span className="text-muted-foreground/80">{c.description}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output Variables */}
      {outputDefinitions.some((o) => o.key) && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70 mb-1">
            Output Variables
          </p>
          <div className="space-y-1.5">
            {outputDefinitions.filter((o) => o.key).map((o) => (
              <div key={o.key} className="flex flex-col gap-0.5">
                <code className="rounded bg-emerald-500/8 px-1 py-0.5 text-[10px] text-emerald-400 font-mono w-fit">
                  {`{{output.${o.key}}}`}
                </code>
                <span className="text-muted-foreground text-[10px] pl-1">
                  {o.label || o.key} ({o.type})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Functions Reference */}
      {functionCategories.size > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Built-in Functions
          </p>
          <div className="space-y-0.5">
            {Array.from(functionCategories.entries()).map(([cat, fns]) => (
              <div key={cat}>
                <button
                  onClick={() => setExpandedFnCat(expandedFnCat === cat ? null : cat)}
                  className="w-full flex items-center gap-1 py-0.5 text-[10px] text-muted-foreground/80 hover:text-muted-foreground transition"
                >
                  <span className={`transition-transform text-[8px] ${expandedFnCat === cat ? 'rotate-90' : ''}`}>&#9656;</span>
                  <span className="font-medium">{cat}</span>
                  <span className="ml-auto text-muted-foreground">{fns.length}</span>
                </button>
                {expandedFnCat === cat && (
                  <div className="ml-3 space-y-0.5 border-l border-border/20 pl-2">
                    {fns.map((fn) => (
                      <div key={fn.name} className="text-[10px]">
                        <code className="text-accent/70 font-mono">{fn.signature}</code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Syntax Reference */}
      {referenceData?.syntax && referenceData.syntax.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Syntax
          </p>
          <div className="space-y-1">
            {referenceData.syntax.map((s) => (
              <div key={s.name} className="text-[10px]">
                <code className="text-accent/60 font-mono">{s.pattern}</code>
                <span className="text-muted-foreground/65 ml-1">{s.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[9px] text-muted-foreground/80 italic pt-1 border-t border-border/25">
        System variables are auto-populated at runtime.
      </p>
    </div>
  )
}

// ── Output Row Sub-component ──

const OUTPUT_TYPES: OutputDefinition['type'][] = ['text', 'json', 'number', 'boolean']

function OutputRow({
  output,
  isEditing,
  onChange,
  onRemove,
}: {
  output: OutputDefinition
  isEditing: boolean
  onChange: (patch: Partial<OutputDefinition>) => void
  onRemove: () => void
}) {
  if (!isEditing) {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono text-foreground">{output.key || '(empty)'}</span>
          <span className="chip-muted text-xs">{output.type}</span>
          {output.label && <span className="text-xs text-muted-foreground truncate">{output.label}</span>}
        </div>
        {output.description && (
          <p className="text-xs text-muted-foreground pl-1">{output.description}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-border/25 bg-background/20 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input text-xs flex-1 min-w-[80px]"
          value={output.key}
          onChange={(e) => onChange({ key: e.target.value })}
          placeholder="output_key"
        />
        <select
          className="input text-xs w-24"
          value={output.type}
          onChange={(e) => onChange({ type: e.target.value as OutputDefinition['type'] })}
        >
          {OUTPUT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          className="input text-xs flex-1 min-w-[80px]"
          value={output.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Label"
        />
        <button
          className="text-red-400 hover:text-red-300 transition p-0.5"
          onClick={onRemove}
          title="Remove output"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        className="input text-xs w-full"
        value={output.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Description (optional)"
      />
    </div>
  )
}

// ── Enum Options Input ──
// Uses local text state to avoid stripping commas on every keystroke.
// Parses comma-separated values only on blur.
function EnumOptionsInput({
  options,
  onChange,
}: {
  options: string[]
  onChange: (options: string[]) => void
}) {
  const [text, setText] = useState(options.join(', '))
  // Sync when options change externally (e.g. switching param type)
  const prevRef = useRef(options)
  useEffect(() => {
    if (prevRef.current !== options) {
      prevRef.current = options
      const joined = options.join(', ')
      if (joined !== text) setText(joined)
    }
  }, [options])

  const commit = () => {
    const parsed = text
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    onChange(parsed)
  }

  return (
    <input
      className="input text-xs flex-1 min-w-[120px]"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      placeholder="option1, option2, ..."
    />
  )
}

// ── Parameter Row Sub-component ──

function ParameterRow({
  param,
  isEditing,
  onChange,
  onRemove,
}: {
  param: ParameterConfig
  isEditing: boolean
  onChange: (patch: Partial<ParameterConfig>) => void
  onRemove: () => void
}) {
  if (!isEditing) {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono text-foreground">{param.name}</span>
          <span className="chip-muted text-xs">{param.type}</span>
          {param.required && <span className="text-xs text-amber-400">required</span>}
          {param.type === 'enum' && param.options.length > 0 && (
            <span className="text-xs text-muted-foreground">
              [{param.options.join(', ')}]
            </span>
          )}
        </div>
        {param.description && (
          <p className="text-xs text-muted-foreground pl-1">{param.description}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-border/25 bg-background/20 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input text-xs flex-1 min-w-[100px]"
          value={param.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="param_name"
        />
        <select
          className="input text-xs w-24"
          value={param.type}
          onChange={(e) => onChange({ type: e.target.value as ParameterConfig['type'] })}
        >
          {PARAM_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={param.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="accent-accent"
          />
          Required
        </label>
        {param.type === 'enum' && (
          <EnumOptionsInput
            options={param.options}
            onChange={(options) => onChange({ options })}
          />
        )}
        <button
          className="text-red-400 hover:text-red-300 transition p-0.5"
          onClick={onRemove}
          title="Remove parameter"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        className="input text-xs w-full"
        value={param.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Description (optional)"
      />
    </div>
  )
}
