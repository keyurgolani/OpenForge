import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Copy, GitBranch, Pencil, PlayCircle, Route, Save, Shapes, Trash2, Waypoints } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card'
import { CloneStepperModal } from '@/components/shared/CloneStepperModal'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import Section from '@/components/shared/Section'
import StatusBadge from '@/components/shared/StatusBadge'
import { useToast } from '@/components/shared/ToastProvider'
import WorkflowFlowView from '@/components/shared/WorkflowFlowView'
import { useWorkflowQuery, useWorkflowVersionQuery, useWorkflowVersionsQuery } from '@/features/workflows'
import { useWorkspaces } from '@/hooks/useWorkspace'
import { deleteWorkflow, updateWorkflow } from '@/lib/api'
import { formatDateTime } from '@/lib/formatters'
import { catalogRoute, workflowsRoute } from '@/lib/routes'
import type { WorkflowDefinition, WorkflowNode, WorkflowVersion } from '@/types/workflows'

function formatJson(value: unknown): string {
  const normalized = value ?? {}
  return JSON.stringify(normalized, null, 2)
}

function countConnections(version: WorkflowVersion | null, nodeId: string) {
  if (!version) {
    return { inbound: 0, outbound: 0 }
  }
  return {
    inbound: version.edges.filter((edge) => edge.to_node_id === nodeId).length,
    outbound: version.edges.filter((edge) => edge.from_node_id === nodeId).length,
  }
}

function nodeTitle(node: WorkflowNode | null): string {
  if (!node) {
    return 'Select a node'
  }
  return `${node.label} (${node.node_key})`
}

const COMPOSITE_NODE_TYPES = new Set(['delegate_call', 'handoff', 'fanout', 'subworkflow', 'join', 'reduce'])

export function getWorkflowPatternBadges(workflow: WorkflowDefinition): string[] {
  const metadata = workflow.template_metadata ?? {}
  const badges = Array.isArray(metadata.badges) ? metadata.badges.filter((value): value is string => typeof value === 'string') : []
  return workflow.template_kind ? [workflow.template_kind, ...badges] : badges
}

export function getCompositeNodeFacts(node: WorkflowNode | null): Array<{ label: string; value: string }> {
  if (!node) {
    return []
  }
  const config = node.config as Record<string, unknown>
  const facts = [
    { label: 'Delegation mode', value: typeof config.delegation_mode === 'string' ? config.delegation_mode : node.node_type },
    { label: 'Target workflow', value: typeof config.child_workflow_id === 'string' ? config.child_workflow_id : typeof config.target_workflow_id === 'string' ? config.target_workflow_id : '' },
    { label: 'Join group', value: typeof config.join_group_id === 'string' ? config.join_group_id : '' },
    { label: 'Merge strategy', value: typeof config.merge_strategy === 'string' ? config.merge_strategy : typeof config.strategy === 'string' ? config.strategy : '' },
    { label: 'Target profile', value: typeof config.target_profile_id === 'string' ? config.target_profile_id : '' },
  ]
  return facts.filter((fact) => fact.value)
}

export default function WorkflowDetailPage() {
  const { workflowId = '' } = useParams<{ workflowId: string }>()
  const navigate = useNavigate()
  const { data: workflow, isLoading, error } = useWorkflowQuery(workflowId)
  const { data: versionsData } = useWorkflowVersionsQuery(workflowId)
  const versions = useMemo(() => versionsData?.versions ?? [], [versionsData])
  const [selectedVersionId, setSelectedVersionId] = useState<string>('')
  const { data: selectedVersionData } = useWorkflowVersionQuery(
    workflowId,
    selectedVersionId || workflow?.current_version_id || undefined,
  )
  const selectedVersion = selectedVersionData ?? workflow?.current_version ?? null
  const [selectedNodeId, setSelectedNodeId] = useState<string>('')
  const { data: workspaces = [] } = useWorkspaces()
  const { success: showSuccess } = useToast()
  const queryClient = useQueryClient()

  // Clone stepper state
  const [showCloneStepper, setShowCloneStepper] = useState(false)

  // Inline editing state
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatus, setEditStatus] = useState('')

  const updateWorkspaceMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => updateWorkflow(id, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', vars.id] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      showSuccess('Workspace updated.')
    },
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      updateWorkflow(workflowId, {
        name: editName,
        slug: editSlug,
        description: editDescription || null,
        status: editStatus,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      showSuccess('Workflow updated.')
      setIsEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteWorkflow(workflowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      navigate(workflowsRoute())
    },
  })

  useEffect(() => {
    if (!selectedVersionId) {
      const fallbackVersionId = workflow?.current_version_id ?? versions[0]?.id ?? ''
      if (fallbackVersionId) {
        setSelectedVersionId(fallbackVersionId)
      }
    }
  }, [selectedVersionId, versions, workflow?.current_version_id])

  useEffect(() => {
    const fallbackNodeId = selectedVersion?.entry_node_id ?? selectedVersion?.nodes[0]?.id ?? ''
    if (!fallbackNodeId) {
      setSelectedNodeId('')
      return
    }
    if (!selectedVersion?.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(fallbackNodeId)
    }
  }, [selectedNodeId, selectedVersion])

  if (isLoading) {
    return <LoadingState label="Loading workflow detail…" />
  }

  if (error || !workflow) {
    return <ErrorState message="Workflow detail could not be loaded from the canonical workflows API." />
  }

  const activeVersion = selectedVersion
  const selectedNode = activeVersion?.nodes.find((node) => node.id === selectedNodeId) ?? activeVersion?.entry_node ?? null
  const selectedNodeConnections = selectedNode ? countConnections(activeVersion, selectedNode.id) : { inbound: 0, outbound: 0 }
  const connectedEdges = activeVersion?.edges.filter((edge) => edge.from_node_id === selectedNode?.id || edge.to_node_id === selectedNode?.id) ?? []
  const workflowBadges = getWorkflowPatternBadges(workflow)
  const compositeNodes = (activeVersion?.nodes ?? []).filter((node) => COMPOSITE_NODE_TYPES.has(node.node_type))
  const compositeFacts = getCompositeNodeFacts(selectedNode)
  const isTemplate = workflow.is_template === true

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={workflow.name}
        description="Inspect the active runtime definition, compare version snapshots, and review node and edge structure with full version history and graph visualization."
        actions={(
          <div className="flex items-center gap-2">
            <Link
              to={isTemplate ? catalogRoute() : workflowsRoute()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {isTemplate ? 'Back to Catalog' : 'Back to Workflows'}
            </Link>
            {isTemplate ? (
              <button
                onClick={() => setShowCloneStepper(true)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 text-sm text-accent transition hover:bg-accent/20"
              >
                <Copy className="h-4 w-4" />
                Clone
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditName(workflow.name)
                    setEditSlug(workflow.slug)
                    setEditDescription(workflow.description ?? '')
                    setEditStatus(workflow.status)
                    setIsEditing(!isEditing)
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                  {isEditing ? 'Cancel' : 'Edit'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete workflow "${workflow.name}"?`)) {
                      deleteMutation.mutate()
                    }
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-sm text-red-400 transition hover:bg-red-500/20"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Workflow status', value: <StatusBadge status={workflow.status} />, icon: <Waypoints className="h-4 w-4" /> },
          { label: 'Current version', value: <span className="text-foreground">{workflow.current_version?.version_number ? `v${workflow.current_version.version_number}` : 'No active version'}</span>, icon: <GitBranch className="h-4 w-4" /> },
          { label: 'Entry node', value: <span className="text-foreground">{workflow.current_version?.entry_node?.node_key ?? 'None'}</span>, icon: <PlayCircle className="h-4 w-4" /> },
          { label: 'Topology', value: <span className="text-foreground">{activeVersion?.nodes.length ?? 0} nodes / {activeVersion?.edges.length ?? 0} edges</span>, icon: <Route className="h-4 w-4" /> },
          { label: 'Composite nodes', value: <span className="text-foreground">{compositeNodes.length}</span>, icon: <Shapes className="h-4 w-4" /> },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/60 bg-card/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">{item.label}</p>
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                {item.icon}
              </div>
            </div>
            <div className="mt-3 text-sm font-medium">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Inline edit form (user mode only) */}
      {isEditing && !isTemplate && (
        <div className="rounded-2xl border border-accent/30 bg-card/30 p-5 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Slug</label>
              <input
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground"
              />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Status</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm text-foreground"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save Changes
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <Section title="Definition" description="The workflow identity stays stable while executable graph versions evolve underneath it.">
          <Card glass padding="lg">
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Slug</p>
                <p className="mt-1 text-sm font-medium text-foreground">{workflow.slug}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Mode</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {workflow.is_system ? 'System' : 'Workspace'} / {workflow.is_template ? 'Template' : 'Custom'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Template kind</p>
                <p className="mt-1 text-sm font-medium text-foreground">{workflow.template_kind ?? 'None'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Workspace</p>
                <select
                  value={workflow.workspace_id ?? ''}
                  onChange={(e) => {
                    const val = e.target.value || null
                    updateWorkspaceMutation.mutate({ id: workflow.id, data: { workspace_id: val } })
                  }}
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background/40 px-2.5 py-1.5 text-sm text-foreground"
                >
                  <option value="">No workspace</option>
                  {(workspaces as any[]).map((ws: any) => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Created</p>
                <p className="mt-1 text-sm font-medium text-foreground">{workflow.created_at ? formatDateTime(workflow.created_at) : 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Updated</p>
                <p className="mt-1 text-sm font-medium text-foreground">{workflow.updated_at ? formatDateTime(workflow.updated_at) : 'Unknown'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Description</p>
                <p className="mt-1 text-sm text-muted-foreground/90">
                  {workflow.description || 'No workflow description has been written yet.'}
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Pattern badges</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {workflowBadges.length === 0 ? (
                    <span className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground/80">No composite metadata</span>
                  ) : workflowBadges.map((badge) => (
                    <span key={badge} className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-foreground">
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Section title="Versions" description="Workflow versions are explicit executable snapshots rather than implicit edits to a mutable graph.">
            <div className="grid gap-3">
              {versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => setSelectedVersionId(version.id)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    selectedVersionId === version.id
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-border/60 bg-card/30 hover:border-border/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Version {version.version_number}</p>
                      <p className="mt-1 text-xs text-muted-foreground/80">{version.change_note || 'No change note recorded.'}</p>
                    </div>
                    <StatusBadge status={version.status} />
                  </div>
                </button>
              ))}
            </div>
          </Section>
        </Section>

      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <Section title="Node inspector" description="Visual node flow following edge connections from the entry node.">
          <WorkflowFlowView
            nodes={activeVersion?.nodes ?? []}
            edges={activeVersion?.edges ?? []}
            entryNodeId={activeVersion?.entry_node_id ?? undefined}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </Section>

        <Section title="Selected node" description="Executor config and connected edges stay readable even without a graph canvas.">
          <Card glass>
            <CardHeader>
              <CardTitle as="h2">{nodeTitle(selectedNode)}</CardTitle>
              <CardDescription>
                {selectedNode ? `Executor ${selectedNode.executor_ref ?? 'not assigned'} with ${selectedNodeConnections.inbound} inbound and ${selectedNodeConnections.outbound} outbound edges.` : 'Select a node to inspect its runtime config and graph connectivity.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedNode ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border/60 bg-background/35 p-3">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Node type</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{selectedNode.node_type}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/35 p-3">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Executor ref</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{selectedNode.executor_ref ?? 'Unassigned'}</p>
                    </div>
                  </div>

                  {compositeFacts.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">Composite semantics</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        {compositeFacts.map((fact) => (
                          <div key={fact.label} className="rounded-xl border border-border/60 bg-background/35 p-3">
                            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">{fact.label}</p>
                            <p className="mt-1 text-sm font-medium text-foreground">{fact.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">Config</p>
                    <pre className="overflow-x-auto rounded-xl border border-border/60 bg-background/50 p-4 text-xs text-foreground/90">
                      {formatJson(selectedNode.config)}
                    </pre>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">Connected edges</p>
                    <div className="space-y-2">
                      {connectedEdges.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground/80">
                          No edges reference this node.
                        </div>
                      ) : connectedEdges.map((edge) => (
                        <div key={edge.id} className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-foreground">{edge.label || `${edge.edge_type} transition`}</p>
                              <p className="mt-1 text-xs text-muted-foreground/80">
                                {edge.from_node_id === selectedNode.id ? 'Outbound' : 'Inbound'} • {edge.edge_type} • priority {edge.priority}
                              </p>
                            </div>
                            <StatusBadge status={edge.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-6 text-sm text-muted-foreground/80">
                  This version does not have any nodes yet.
                </div>
              )}
            </CardContent>
          </Card>
        </Section>
      </div>

      {/* Tier 3 — Advanced (collapsible) */}
      <details className="rounded-2xl border border-border/60 bg-card/30">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-muted-foreground/70 uppercase tracking-[0.12em]">
          Advanced
        </summary>
        <div className="px-5 pb-5 space-y-6">
          <Section title="Schemas" description="State, input, and output contracts are visible for builders and operators.">
            <div className="grid gap-4">
              {[
                { title: 'State schema', description: 'Persisted runtime state shape for the selected version.', payload: activeVersion?.state_schema ?? {} },
                { title: 'Default input schema', description: 'Expected launch payload for the selected version.', payload: activeVersion?.default_input_schema ?? {} },
                { title: 'Default output schema', description: 'Final output contract for the selected version.', payload: activeVersion?.default_output_schema ?? {} },
              ].map((schema) => (
                <Card key={schema.title} glass>
                  <CardHeader>
                    <CardTitle as="h2">{schema.title}</CardTitle>
                    <CardDescription>{schema.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="overflow-x-auto rounded-xl border border-border/60 bg-background/50 p-4 text-xs text-foreground/90">
                      {formatJson(schema.payload)}
                    </pre>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Section>

          <Section title="Composite orchestration" description="Composite patterns are defined directly in the workflow definition.">
            <div className="grid gap-4 md:grid-cols-3">
              <Card glass>
                <CardHeader>
                  <CardTitle as="h2">Pattern</CardTitle>
                  <CardDescription>The composite pattern metadata attached to this template.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-foreground">
                  {typeof workflow.template_metadata?.pattern === 'string' ? workflow.template_metadata.pattern : 'No pattern metadata'}
                </CardContent>
              </Card>
              <Card glass>
                <CardHeader>
                  <CardTitle as="h2">Composite nodes</CardTitle>
                  <CardDescription>Nodes using delegation, fan-out, subworkflow, join, or reduce semantics.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-foreground">
                  {compositeNodes.length === 0 ? 'No composite nodes' : compositeNodes.map((node) => node.node_key).join(', ')}
                </CardContent>
              </Card>
              <Card glass>
                <CardHeader>
                  <CardTitle as="h2">Runtime summary</CardTitle>
                  <CardDescription>The workflow features the runtime should expose at execution time.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-foreground">
                  {workflowBadges.length === 0 ? 'No runtime summary available' : workflowBadges.join(', ')}
                </CardContent>
              </Card>
            </div>
          </Section>

          <Section title="Version metadata" description="Selected version timing and activation context.">
            <div className="grid gap-4 md:grid-cols-3">
              <Card glass>
                <CardHeader>
                  <CardTitle as="h2">Selected version</CardTitle>
                  <CardDescription>The explicit executable snapshot currently in view.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground/90">
                  <div className="flex items-center justify-between gap-3">
                    <span>Status</span>
                    <StatusBadge status={activeVersion?.status ?? 'draft'} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Entry node</span>
                    <span className="text-foreground">{activeVersion?.entry_node?.node_key ?? 'None'}</span>
                  </div>
                </CardContent>
              </Card>
              <Card glass>
                <CardHeader>
                  <CardTitle as="h2">Created</CardTitle>
                  <CardDescription>Version snapshot creation timestamp.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-foreground">
                  {activeVersion?.created_at ? formatDateTime(activeVersion.created_at) : 'Unknown'}
                </CardContent>
              </Card>
              <Card glass>
                <CardHeader>
                  <CardTitle as="h2">Updated</CardTitle>
                  <CardDescription>Latest metadata or topology update.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-foreground">
                  {activeVersion?.updated_at ? formatDateTime(activeVersion.updated_at) : 'Unknown'}
                </CardContent>
              </Card>
            </div>
          </Section>
        </div>
      </details>

      {showCloneStepper && (
        <CloneStepperModal
          templateId={workflowId}
          catalogType="workflow"
          onClose={() => setShowCloneStepper(false)}
          onSuccess={(clonedEntity) => {
            setShowCloneStepper(false)
            navigate(workflowsRoute(clonedEntity.id))
          }}
        />
      )}
    </div>
  )
}
