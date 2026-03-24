import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Rocket, Play, Pause, XCircle, ChevronRight } from 'lucide-react'

import { useDeploymentsQuery, usePauseDeployment, useResumeDeployment, useTeardownDeployment, useRunDeploymentNow } from '@/features/deployments'
import { deploymentsRoute } from '@/lib/routes'
import LoadingState from '@/components/shared/LoadingState'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import { formatRelativeTime } from '@/lib/formatters'
import type { Deployment, DeploymentStatus } from '@/types/deployments'

const STATUS_FILTERS: Array<{ label: string; value: string | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Torn Down', value: 'torn_down' },
]

export default function DeploymentsPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const { data, isLoading, error } = useDeploymentsQuery({ status: statusFilter })
  const pauseDeployment = usePauseDeployment()
  const resumeDeployment = useResumeDeployment()
  const teardownDeployment = useTeardownDeployment()
  const runNow = useRunDeploymentNow()

  if (error) return <ErrorState message="Failed to load deployments" />

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <PageHeader title="Deployments" description="Live automation instances" />

      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-lg bg-background/50 border border-border/40 p-1 w-fit">
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={label}
            onClick={() => setStatusFilter(value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
              statusFilter === value
                ? 'bg-accent/20 text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState label="Loading deployments..." />
      ) : !data?.deployments?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Rocket className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No deployments yet</p>
          <p className="text-sm mt-1">Deploy an automation to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.deployments.map((d: Deployment) => (
            <Link
              key={d.id}
              to={deploymentsRoute(d.id)}
              className="block rounded-xl border border-border/60 bg-card/40 p-4 hover:bg-card/60 transition group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <StatusBadge status={d.status} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {d.automation_name ?? `Deployment ${d.id.slice(0, 8)}`}
                    </p>
                    {Object.keys(d.input_values).length > 0 && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {Object.entries(d.input_values)
                          .slice(0, 3)
                          .map(([k, v]) => {
                            // Parse composite key to human-friendly label
                            const dotIdx = k.indexOf('.')
                            const label = dotIdx > 0
                              ? k.slice(dotIdx + 1).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                              : k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                            return `${label}: ${String(v)}`
                          })
                          .join(', ')}
                        {Object.keys(d.input_values).length > 3 && ` +${Object.keys(d.input_values).length - 3} more`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {d.last_run_at && (
                    <span className="text-xs text-muted-foreground">
                      Last run {formatRelativeTime(d.last_run_at)}
                    </span>
                  )}
                  {d.status === 'active' && (
                    <>
                      <button
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.preventDefault(); runNow.mutate(d.id) }}
                        title="Run now"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.preventDefault(); pauseDeployment.mutate(d.id) }}
                        title="Pause"
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.preventDefault(); teardownDeployment.mutate(d.id) }}
                        title="Tear Down"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {d.status === 'paused' && (
                    <>
                      <button
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.preventDefault(); resumeDeployment.mutate(d.id) }}
                        title="Resume"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="p-1.5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.preventDefault(); teardownDeployment.mutate(d.id) }}
                        title="Tear Down"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
