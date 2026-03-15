import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Boxes } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useRunsQuery } from '@/features/runs'
import { EMPTY_STATE_COPY, getDescription, getLabel } from '@/lib/productVocabulary'

export default function RunsPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()
  const { data, isLoading, error } = useRunsQuery({ workspaceId })

  const sortedRuns = useMemo(
    () => [...(data?.runs ?? [])].sort((left, right) => {
      const leftTime = left.started_at ? new Date(left.started_at).getTime() : 0
      const rightTime = right.started_at ? new Date(right.started_at).getTime() : 0
      return rightTime - leftTime
    }),
    [data],
  )

  if (isLoading) {
    return <LoadingState label="Loading runs…" />
  }

  if (error) {
    return <ErrorState message="Runs could not be loaded from the canonical domain API." />
  }

  const emptyCopy = EMPTY_STATE_COPY.run

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={getLabel('run', true)} description={getDescription('run')} />
      {sortedRuns.length === 0 ? (
        <EmptyState
          title={emptyCopy.title}
          description={emptyCopy.description}
          actionLabel={emptyCopy.cta}
          actionHint="Run detail UX can evolve later without going back to the legacy executions list."
          icon={<Boxes className="h-5 w-5" />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/30">
          <table className="min-w-full divide-y divide-border/60">
            <thead className="bg-background/35">
              <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground/75">
                <th className="px-4 py-3 font-medium">Run</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {sortedRuns.map((run) => (
                <tr key={run.id} className="text-sm text-foreground">
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{run.id}</p>
                      <p className="mt-1 text-xs text-muted-foreground/80">Workspace-scoped execution record</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground/90">{run.run_type}</td>
                  <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground/90">{run.started_at ? new Date(run.started_at).toLocaleString() : 'Not started'}</td>
                  <td className="px-4 py-3 text-muted-foreground/90">{run.completed_at ? new Date(run.completed_at).toLocaleString() : 'In progress'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
