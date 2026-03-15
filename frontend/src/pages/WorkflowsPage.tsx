import { useState } from 'react'
import { ArrowRight, Boxes, Filter, GitBranch, Layers3, Workflow } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useWorkflowsQuery } from '@/features/workflows'
import { formatRelativeTime } from '@/lib/formatters'
import { EMPTY_STATE_COPY, getDescription, getLabel } from '@/lib/productVocabulary'
import { workflowsRoute } from '@/lib/routes'
import type { WorkflowStatus } from '@/types/workflows'

type SystemFilter = 'all' | 'system' | 'workspace'
type TemplateFilter = 'all' | 'template' | 'custom'

export default function WorkflowsPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()
  const [statusFilter, setStatusFilter] = useState<'all' | WorkflowStatus>('all')
  const [systemFilter, setSystemFilter] = useState<SystemFilter>('all')
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all')
  const { data, isLoading, error } = useWorkflowsQuery({
    workspaceId,
    status: statusFilter === 'all' ? undefined : statusFilter,
    isSystem: systemFilter === 'all' ? undefined : systemFilter === 'system',
    isTemplate: templateFilter === 'all' ? undefined : templateFilter === 'template',
  })

  if (isLoading) {
    return <LoadingState label="Loading workflows…" />
  }

  if (error) {
    return <ErrorState message="Workflows could not be loaded from the canonical domain API." />
  }

  const workflows = data?.workflows ?? []
  const emptyCopy = EMPTY_STATE_COPY.workflow
  const activeCount = workflows.filter((workflow) => workflow.status === 'active').length
  const systemCount = workflows.filter((workflow) => workflow.is_system).length
  const templateCount = workflows.filter((workflow) => workflow.is_template).length
  const versionCount = workflows.reduce((total, workflow) => total + (workflow.current_version ? 1 : 0), 0)

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={getLabel('workflow', true)}
        description={getDescription('workflow')}
        actions={<span className="text-sm text-muted-foreground/90">{data?.total ?? 0} visible</span>}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <div className="rounded-2xl border border-border/60 bg-card/30 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="h-4 w-4 text-accent" />
            Runtime filters
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Status</span>
              <select className="input w-full" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | WorkflowStatus)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
                <option value="deleted">Deleted</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Ownership</span>
              <select className="input w-full" value={systemFilter} onChange={(event) => setSystemFilter(event.target.value as SystemFilter)}>
                <option value="all">System and workspace</option>
                <option value="system">System workflows</option>
                <option value="workspace">Workspace workflows</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Template mode</span>
              <select className="input w-full" value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value as TemplateFilter)}>
                <option value="all">Templates and custom</option>
                <option value="template">Templates only</option>
                <option value="custom">Custom only</option>
              </select>
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
          {[
            { label: 'Active', value: activeCount, icon: <Workflow className="h-4 w-4" /> },
            { label: 'System', value: systemCount, icon: <Layers3 className="h-4 w-4" /> },
            { label: 'Templates', value: templateCount, icon: <GitBranch className="h-4 w-4" /> },
            { label: 'Active versions', value: versionCount, icon: <Boxes className="h-4 w-4" /> },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-border/60 bg-card/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">{item.label}</p>
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                  {item.icon}
                </div>
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      {workflows.length === 0 ? (
        <EmptyState
          title={emptyCopy.title}
          description={emptyCopy.description}
          actionLabel={emptyCopy.cta}
          actionHint="Workflow creation can land here without reviving the old agent-first model."
          icon={<Workflow className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {workflows.map((workflow) => (
            <article key={workflow.id} className="rounded-2xl border border-border/60 bg-card/30 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-foreground">{workflow.name}</h2>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/75">{workflow.slug}</p>
                </div>
                <StatusBadge status={workflow.status} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground/90">
                {workflow.description || 'No workflow description has been written yet.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground/75">
                {workflow.is_system ? <span className="rounded-full border border-border/60 px-2.5 py-1">System</span> : null}
                {workflow.is_template ? <span className="rounded-full border border-border/60 px-2.5 py-1">Template</span> : null}
                {workflow.current_version ? <span className="rounded-full border border-border/60 px-2.5 py-1">Versioned</span> : null}
              </div>
              <div className="mt-4 grid gap-3 text-xs text-muted-foreground/85 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2">
                  <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Version</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{workflow.version}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2">
                  <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Nodes</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{workflow.current_version?.nodes.length ?? workflow.nodes?.length ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2">
                  <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Edges</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{workflow.current_version?.edges.length ?? workflow.edges?.length ?? 0}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/35 px-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Entry node</p>
                  <p className="mt-1 truncate font-medium text-foreground">
                    {workflow.current_version?.entry_node?.node_key ?? workflow.entry_node ?? 'No entry node'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    Updated {formatRelativeTime(workflow.updated_at)}
                  </p>
                </div>
                <Link
                  to={workflowsRoute(workspaceId, workflow.id)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/60 bg-background/50 px-3 text-sm text-foreground transition hover:border-accent/35 hover:text-accent"
                >
                  Inspect runtime
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
