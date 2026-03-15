import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, GitBranch, PlayCircle, Route, Shapes, Waypoints } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import Section from '@/components/shared/Section'
import StatusBadge from '@/components/shared/StatusBadge'
import { useWorkflowQuery, useWorkflowVersionQuery, useWorkflowVersionsQuery } from '@/features/workflows'
import { formatDateTime } from '@/lib/formatters'
import { workflowsRoute } from '@/lib/routes'
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
  const { workspaceId = '', workflowId = '' } = useParams<{ workspaceId: string; workflowId: string }>()
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

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={workflow.name}
        description="Inspect the active runtime definition, compare version snapshots, and review node and edge structure without dropping back to the legacy monolith."
        actions={(
          <Link
            to={workflowsRoute(workspaceId)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Workflows
          </Link>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Workflow status', value: <StatusBadge status={workflow.status} />, icon: <Waypoints className="h-4 w-4" /> },
          { label: 'Current version', value: <span className="text-foreground">v{workflow.current_version?.version_number ?? workflow.version}</span>, icon: <GitBranch className="h-4 w-4" /> },
          { label: 'Entry node', value: <span className="text-foreground">{workflow.current_version?.entry_node?.node_key ?? workflow.entry_node ?? 'None'}</span>, icon: <PlayCircle className="h-4 w-4" /> },
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

        <Section title="Schemas" description="Phase 9 keeps state, input, and output contracts visible for builders and operators.">
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
      </div>

      <Section title="Composite orchestration" description="Phase 10 surfaces composite patterns directly in the workflow definition.">
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <Section title="Node inspector" description="Use the node list as a first-pass graph browser before a full visual editor exists.">
          <div className="grid gap-3 lg:grid-cols-2">
            {(activeVersion?.nodes ?? []).map((node) => {
              const connections = countConnections(activeVersion, node.id)
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    selectedNodeId === node.id
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-border/60 bg-card/30 hover:border-border/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{node.label}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground/75">{node.node_key}</p>
                    </div>
                    <StatusBadge status={node.status} />
                  </div>
                  <div className="mt-4 grid gap-2 text-xs text-muted-foreground/85 sm:grid-cols-3">
                    <div>
                      <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Type</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{node.node_type}</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Inbound</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{connections.inbound}</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Outbound</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{connections.outbound}</p>
                    </div>
                  </div>
                  {COMPOSITE_NODE_TYPES.has(node.node_type) ? (
                    <div className="mt-3 inline-flex rounded-full border border-border/60 px-2.5 py-1 text-xs text-foreground">
                      Composite node
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
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
  )
}
