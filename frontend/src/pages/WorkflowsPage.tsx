import { Workflow } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useWorkflowsQuery } from '@/features/workflows'
import { EMPTY_STATE_COPY, getDescription, getLabel } from '@/lib/productVocabulary'

export default function WorkflowsPage() {
  const { data, isLoading, error } = useWorkflowsQuery()

  if (isLoading) {
    return <LoadingState label="Loading workflows…" />
  }

  if (error) {
    return <ErrorState message="Workflows could not be loaded from the canonical domain API." />
  }

  const workflows = data?.workflows ?? []
  const emptyCopy = EMPTY_STATE_COPY.workflow

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={getLabel('workflow', true)} description={getDescription('workflow')} />
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
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-foreground">{workflow.name}</h2>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/75">{workflow.slug}</p>
                </div>
                <StatusBadge status={workflow.status} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground/90">
                {workflow.description || 'No workflow description has been written yet.'}
              </p>
              <div className="mt-4 grid gap-3 text-xs text-muted-foreground/85 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2">
                  <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Version</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{workflow.version}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2">
                  <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Nodes</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{workflow.nodes?.length ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2">
                  <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Edges</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{workflow.edges?.length ?? 0}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
