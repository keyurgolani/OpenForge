import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Pencil, Rocket, Trash2, X, Zap } from 'lucide-react'

import AutomationConfigSiderail from '@/components/automations/AutomationConfigSiderail'
import AutomationGraphEditor, { type AutomationGraphEditorHandle } from '@/components/automations/AutomationGraphEditor'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import DynamicParameterForm from '@/components/shared/DynamicParameterForm'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import {
  useAutomationQuery,
  useCreateAutomation,
  useUpdateAutomation,
  useDeleteAutomation,
  useAutomationGraphQuery,
  useDeploymentSchemaQuery,
  useSaveAutomationGraph,
  useAutomationVersionsQuery,
} from '@/features/automations'
import { useDeployAutomation } from '@/features/deployments'
import { useWorkspaces } from '@/hooks/useWorkspace'
import { automationsRoute } from '@/lib/routes'
import type { AutomationCreate, AutomationUpdate } from '@/types/automations'
import type { ParameterDefinition } from '@/types/deployments'

// ── Form State ──

interface FormState {
  name: string
  slug: string
  description: string
  tags: string[]
}

function defaultFormState(): FormState {
  return {
    name: '',
    slug: '',
    description: '',
    tags: [],
  }
}

function automationToFormState(auto: {
  name: string
  slug: string
  description: string | null
  tags: string[]
}): FormState {
  return {
    name: auto.name,
    slug: auto.slug,
    description: auto.description ?? '',
    tags: auto.tags ?? [],
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Component ──

export default function AutomationDetailPage() {
  const { automationId } = useParams<{ automationId: string }>()
  const navigate = useNavigate()
  const isCreateMode = !automationId || automationId === 'new'

  const { data: automation, isLoading, error } = useAutomationQuery(isCreateMode ? undefined : automationId)
  const createAutomation = useCreateAutomation()
  const updateAutomation = useUpdateAutomation()
  const deleteAutomation = useDeleteAutomation()
  const deployAutomation = useDeployAutomation()
  const saveGraphMutation = useSaveAutomationGraph()
  const graphEditorRef = useRef<AutomationGraphEditorHandle>(null)

  const { data: graphData } = useAutomationGraphQuery(isCreateMode ? undefined : automationId)
  const { data: deploySchemaData } = useDeploymentSchemaQuery(isCreateMode ? undefined : automationId)
  const { data: versionsData } = useAutomationVersionsQuery(isCreateMode ? undefined : automationId)
  const { data: workspaces } = useWorkspaces()
  const defaultWorkspaceId = (workspaces as { id: string }[] | undefined)?.[0]?.id

  const [isEditing, setIsEditing] = useState(isCreateMode)
  const [formState, setFormState] = useState<FormState>(defaultFormState)
  const [autoSlug, setAutoSlug] = useState(isCreateMode)
  const [graphResetKey, setGraphResetKey] = useState(0)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showDeployDialog, setShowDeployDialog] = useState(false)
  const [deployInputValues, setDeployInputValues] = useState<Record<string, unknown>>({})
  const [deployTriggerType, setDeployTriggerType] = useState<'manual' | 'cron' | 'interval'>('manual')
  const [deploySchedule, setDeploySchedule] = useState('')
  const [deployInterval, setDeployInterval] = useState('')

  // Reset editing mode when automationId changes
  useEffect(() => {
    setIsEditing(isCreateMode)
    setAutoSlug(isCreateMode)
    if (isCreateMode) {
      setFormState(defaultFormState())
    }
  }, [automationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync form state from loaded automation
  useEffect(() => {
    if (automation && !isCreateMode) {
      setFormState(automationToFormState(automation))
    }
  }, [automation, isCreateMode])

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

  // ── Deployment schema ──
  const deploymentSchema: ParameterDefinition[] = (deploySchemaData?.deployment_input_schema ?? []).map((item: Record<string, unknown>) => ({
    name: item.node_key ? `${item.node_key}.${item.input_key}` : item.input_key ?? item.name,
    type: item.type ?? 'text',
    label: item.label ?? item.input_key ?? item.name,
    description: item.description,
    required: item.required ?? true,
    default: item.default,
    options: item.options as string[] | undefined,
  })) as ParameterDefinition[]

  // ── Actions ──
  const handleSave = async () => {
    if (isCreateMode) {
      if (!formState.name.trim() || !formState.slug.trim()) return
      const payload: AutomationCreate = {
        name: formState.name.trim(),
        slug: formState.slug.trim(),
        description: formState.description.trim() || undefined,
        tags: formState.tags,
      }
      try {
        const created = await createAutomation.mutateAsync(payload)
        // Save any pending graph nodes that were added during creation
        const pendingGraph = graphEditorRef.current?.getPendingGraph()
        if (pendingGraph) {
          await saveGraphMutation.mutateAsync({ id: created.id, graph: pendingGraph })
        }
        navigate(automationsRoute(created.id))
      } catch {
        // handled by global interceptor
      }
    } else {
      if (!automationId) return
      const payload: AutomationUpdate = {
        name: formState.name.trim(),
        slug: formState.slug.trim(),
        description: formState.description.trim() || undefined,
        tags: formState.tags,
      }
      try {
        await updateAutomation.mutateAsync({ id: automationId, data: payload })
        setIsEditing(false)
      } catch {
        // handled by global interceptor
      }
    }
  }

  const handleCancel = () => {
    if (isCreateMode) {
      navigate(automationsRoute())
    } else if (automation) {
      setFormState(automationToFormState(automation))
      setGraphResetKey(k => k + 1)
      setIsEditing(false)
    }
  }

  const handleDelete = async () => {
    if (!automationId) return
    try {
      await deleteAutomation.mutateAsync(automationId)
      setShowDeleteModal(false)
      navigate(automationsRoute())
    } catch {
      // handled by global interceptor
    }
  }

  const handleEdit = () => {
    setAutoSlug(false)
    setIsEditing(true)
  }

  // ── Loading / error states ──
  if (!isCreateMode && isLoading) return <LoadingState label="Loading automation..." />
  if (!isCreateMode && (error || !automation)) return <ErrorState message="Automation could not be loaded." />

  const isSaving = createAutomation.isPending || updateAutomation.isPending

  return (
    <div className="flex h-full gap-4 p-6 overflow-hidden">
      {/* ── Main area ── */}
      <div className="flex flex-1 flex-col gap-0 min-w-0 overflow-y-auto min-h-0">

        {/* ── Header Zone: Name + Slug + Description + Actions ── */}
        <div className="rounded-2xl border border-border/25 bg-card/35 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <input
                  className="input text-2xl font-semibold tracking-tight w-full"
                  value={formState.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="Automation name"
                  autoFocus={isCreateMode}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <Zap className="h-6 w-6 text-accent flex-shrink-0" />
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground truncate">
                    {formState.name || 'Untitled Automation'}
                  </h2>
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                {isEditing ? (
                  <input
                    className="input text-xs font-mono w-full max-w-xs mt-1"
                    value={formState.slug}
                    onChange={(e) => {
                      setAutoSlug(false)
                      setField('slug', e.target.value)
                    }}
                    placeholder="automation-slug"
                  />
                ) : (
                  formState.slug || 'automation-slug'
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {isEditing ? (
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
                  {automation?.active_spec_id && defaultWorkspaceId && (
                    <button
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-600/90 disabled:opacity-50"
                      onClick={() => {
                        const defaults: Record<string, unknown> = {}
                        for (const p of deploymentSchema) {
                          if (p.default !== undefined && p.default !== null) defaults[p.name] = p.default
                        }
                        setDeployInputValues(defaults)
                        setDeployTriggerType('manual')
                        setDeploySchedule('')
                        setDeployInterval('')
                        setShowDeployDialog(true)
                      }}
                      disabled={deployAutomation.isPending}
                    >
                      <Rocket className="h-3.5 w-3.5" />
                      {deployAutomation.isPending ? 'Deploying...' : 'Deploy'}
                    </button>
                  )}
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-medium text-red-400 transition-colors hover:text-red-300 hover:bg-red-500/20"
                    onClick={() => setShowDeleteModal(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => navigate(automationsRoute())}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                </>
              )}
            </div>
          </div>

        </div>

        {/* ── Graph Editor ── */}
        <div className="mt-4 flex-1 min-h-0 flex flex-col">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground mb-2 flex-shrink-0">Workflow Graph</p>
          <div className="flex-1 min-h-[300px]">
            <AutomationGraphEditor
              ref={graphEditorRef}
              key={`${automationId ?? 'new'}_${graphResetKey}`}
              automationId={automationId ?? 'new'}
              graph={graphData ?? null}
              readOnly={!isEditing}
            />
          </div>
        </div>
      </div>

      {/* ── Config Siderail ── */}
      <AutomationConfigSiderail
        description={formState.description}
        tags={formState.tags}
        isEditing={isEditing}
        status={automation?.status}
        healthStatus={automation?.health_status}
        graphVersion={automation?.graph_version}
        createdAt={automation?.created_at}
        updatedAt={automation?.updated_at}
        compilationStatus={automation?.compilation_status}
        compilationError={automation?.compilation_error}
        versions={versionsData?.versions}
        onChange={(field, value) => setField(field as keyof FormState, value as FormState[keyof FormState])}
      />

      {/* ── Delete Confirmation Modal ── */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Automation"
        message={`Are you sure you want to delete "${formState.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        icon="trash"
        loading={deleteAutomation.isPending}
      />

      {/* ── Deploy dialog ── */}
      {showDeployDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border/25 bg-background p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Deploy {automation?.name}</h3>

            {/* Trigger type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Trigger</label>
              <p className="text-xs text-muted-foreground mb-2">How this deployment will be triggered.</p>
              <select
                className="input w-full"
                value={deployTriggerType}
                onChange={(e) => setDeployTriggerType(e.target.value as 'manual' | 'cron' | 'interval')}
              >
                <option value="manual">Manual (on-demand only)</option>
                <option value="cron">Cron Schedule</option>
                <option value="interval">Interval</option>
              </select>
            </div>

            {deployTriggerType === 'cron' && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Cron Expression</label>
                <input
                  type="text"
                  value={deploySchedule}
                  onChange={(e) => setDeploySchedule(e.target.value)}
                  placeholder="0 9 * * 1"
                  className="w-full rounded-lg border border-border/25 bg-background/50 px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-accent/40"
                />
                <p className="mt-1 text-[10px] text-muted-foreground/70">e.g. "0 9 * * 1" = every Monday at 9 AM</p>
              </div>
            )}

            {deployTriggerType === 'interval' && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Interval (seconds)</label>
                <input
                  type="number"
                  value={deployInterval}
                  onChange={(e) => setDeployInterval(e.target.value)}
                  placeholder="3600"
                  min={1}
                  className="w-full rounded-lg border border-border/25 bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/40"
                />
                <p className="mt-1 text-[10px] text-muted-foreground/70">e.g. 3600 = every hour</p>
              </div>
            )}

            {/* Deployment inputs */}
            {deploymentSchema.length > 0 && (
              <div className="border-t border-border/25 pt-4">
                <p className="text-sm font-medium text-foreground mb-1">Inputs</p>
                <p className="text-xs text-muted-foreground mb-3">Values for unfilled agent parameters.</p>
                <DynamicParameterForm
                  schema={deploymentSchema}
                  values={deployInputValues}
                  onChange={setDeployInputValues}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-border/25 pt-4">
              <button
                className="px-4 py-2 rounded-lg border border-border/25 text-sm text-muted-foreground hover:text-foreground transition"
                onClick={() => { setShowDeployDialog(false); setDeployInputValues({}); setDeploySchedule(''); setDeployInterval('') }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold transition hover:bg-emerald-600/90"
                disabled={deployAutomation.isPending}
                onClick={() => {
                  if (!defaultWorkspaceId || !automationId) return
                  deployAutomation.mutate({
                    automationId,
                    data: {
                      workspace_id: defaultWorkspaceId,
                      input_values: deployInputValues,
                      ...(deployTriggerType === 'cron' && deploySchedule ? { schedule_expression: deploySchedule } : {}),
                      ...(deployTriggerType === 'interval' && deployInterval ? { interval_seconds: Number(deployInterval) } : {}),
                    },
                  }, {
                    onSuccess: () => {
                      setShowDeployDialog(false)
                      setDeployInputValues({})
                      setDeploySchedule('')
                      setDeployInterval('')
                    },
                  })
                }}
              >
                {deployAutomation.isPending ? 'Deploying...' : 'Deploy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
