import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Boxes, Clock3, Filter, PauseCircle } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useRunsQuery } from '@/features/runs'
import { formatDateTime, formatRelativeTime, truncateText } from '@/lib/formatters'
import { EMPTY_STATE_COPY, getDescription, getLabel } from '@/lib/productVocabulary'
import { runsRoute, agentsRoute } from '@/lib/routes'
import type { ExecutionStatus } from '@/types/common'

export default function RunsPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | ExecutionStatus>('all')
  const { data, isLoading, error } = useRunsQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
  })

  if (isLoading) {
    return <LoadingState label="Loading runs..." />
  }

  if (error) {
    return <ErrorState message="Runs could not be loaded from the canonical domain API." />
  }

  const emptyCopy = EMPTY_STATE_COPY.run
  const sortedRuns = [...(data?.runs ?? [])].sort((left, right) => {
    const leftTime = left.started_at ? new Date(left.started_at).getTime() : 0
    const rightTime = right.started_at ? new Date(right.started_at).getTime() : 0
    return rightTime - leftTime
  })
  const interruptedCount = sortedRuns.filter((run) => run.status === 'waiting_approval' || run.status === 'interrupted').length
  const failedCount = sortedRuns.filter((run) => run.status === 'failed').length
  const activeCount = sortedRuns.filter((run) => ['pending', 'queued', 'running', 'retrying'].includes(run.status)).length

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={getLabel('run', true)}
        description={getDescription('run')}
        actions={<span className="text-sm text-muted-foreground/90">{data?.total ?? 0} visible</span>}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <div className="rounded-2xl border border-border/25 bg-card/30 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="h-4 w-4 text-accent" />
            Runtime filters
          </div>
          <label className="space-y-2 text-sm max-w-xs">
            <span className="text-muted-foreground">Status</span>
            <select className="input w-full" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | ExecutionStatus)}>
              <option value="all">All statuses</option>
              <option value="running">Running</option>
              <option value="waiting_approval">Waiting approval</option>
              <option value="interrupted">Interrupted</option>
              <option value="retrying">Retrying</option>
              <option value="failed">Failed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          {[
            { label: 'Active', value: activeCount, icon: <Clock3 className="h-4 w-4" /> },
            { label: 'Interrupted', value: interruptedCount, icon: <PauseCircle className="h-4 w-4" /> },
            { label: 'Failed', value: failedCount, icon: <AlertTriangle className="h-4 w-4" /> },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-border/25 bg-card/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">{item.label}</p>
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-accent/20 bg-accent/15 text-accent">
                  {item.icon}
                </div>
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      {sortedRuns.length === 0 ? (
        <EmptyState
          title={emptyCopy.title}
          description={emptyCopy.description}
          actionLabel={emptyCopy.cta}
          actionHint="Runs track every agent execution with full step lineage, checkpoints, and outputs."
          icon={<Boxes className="h-5 w-5" />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/25 bg-card/30">
          <table className="min-w-full divide-y divide-border/60">
            <thead className="bg-background/35">
              <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground/75">
                <th className="px-4 py-3 font-medium">Run</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {sortedRuns.map((run) => {
                const agentSlug = typeof run.composite_metadata?.agent_slug === 'string' ? run.composite_metadata.agent_slug : null
                const agentId = typeof run.composite_metadata?.agent_id === 'string' ? run.composite_metadata.agent_id : null
                return (
                  <tr key={run.id} className="text-sm text-foreground">
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <Link className="font-medium transition hover:text-accent" to={runsRoute(run.id)}>
                          {truncateText(run.id, 18)}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground/80">Updated {formatRelativeTime(run.updated_at ?? run.started_at)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground/90">{run.run_type}</td>
                    <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground/90">
                      {agentId ? (
                        <Link className="transition hover:text-accent" to={agentsRoute(agentId)}>
                          {agentSlug ?? truncateText(agentId, 14)}
                        </Link>
                      ) : agentSlug ?? 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground/90">{run.started_at ? formatDateTime(run.started_at) : 'Not started'}</td>
                    <td className="px-4 py-3 text-muted-foreground/90">
                      <div className="flex items-center justify-between gap-3">
                        <span>{run.completed_at ? formatDateTime(run.completed_at) : run.started_at ? 'In progress' : '—'}</span>
                        <Link className="inline-flex items-center gap-1 text-xs text-accent transition hover:text-accent/80" to={runsRoute(run.id)}>
                          Inspect
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
