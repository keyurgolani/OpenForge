import { Fragment, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarClock, ChevronDown, Pause, Play, Rocket, Timer, Zap } from 'lucide-react'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import StatusBadge from '@/components/shared/StatusBadge'
import {
  useDeploymentsQuery,
  usePauseDeployment,
  useResumeDeployment,
  useTeardownDeployment,
  useRunDeploymentNow,
} from '@/features/deployments'
import { formatRelativeTime } from '@/lib/formatters'
import { deploymentsRoute } from '@/lib/routes'
import { useUIStore } from '@/stores/uiStore'
import type { Deployment } from '@/types/deployments'

const STATUS_FILTERS: Array<{ label: string; value: string | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Torn Down', value: 'torn_down' },
]

function TriggerBadge({ deployment }: { deployment: Deployment }) {
  if (deployment.trigger_type === 'cron') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border border-border/25 bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
        title={deployment.schedule_expression ?? 'Cron schedule'}
      >
        <CalendarClock className="w-3 h-3" /> Cron
      </span>
    )
  }
  if (deployment.trigger_type === 'interval') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border border-border/25 bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
        title={`Every ${deployment.interval_seconds ?? 0}s`}
      >
        <Timer className="w-3 h-3" /> {deployment.interval_seconds ?? 0}s
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/25 bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <Zap className="w-3 h-3" /> Manual
    </span>
  )
}

function parseInputLabel(key: string): string {
  const dotIdx = key.indexOf('.')
  return dotIdx > 0
    ? key.slice(dotIdx + 1).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function InputChips({ inputValues }: { inputValues: Record<string, unknown> }) {
  const entries = Object.entries(inputValues)
  if (entries.length === 0) return <span className="text-muted-foreground/60">--</span>
  const visible = entries.slice(0, 3)
  const remaining = entries.length - visible.length
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex items-center gap-1 rounded-md border border-border/25 bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground max-w-[180px]"
          title={`${parseInputLabel(k)}: ${String(v)}`}
        >
          <span className="font-medium text-foreground/70 truncate">{parseInputLabel(k)}:</span>
          <span className="truncate">{String(v)}</span>
        </span>
      ))}
      {remaining > 0 && (
        <span className="inline-flex items-center rounded-md border border-border/25 bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground/60">
          +{remaining} more
        </span>
      )}
    </div>
  )
}

function ExpandedInputs({ inputValues }: { inputValues: Record<string, unknown> }) {
  const entries = Object.entries(inputValues)
  if (entries.length === 0) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([k, v]) => (
        <div key={k} className="rounded-lg border border-border/25 bg-background/35 p-2.5">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 mb-0.5">
            {parseInputLabel(k)}
          </p>
          <p className="text-xs font-medium text-foreground break-words">
            {String(v) || '—'}
          </p>
        </div>
      ))}
    </div>
  )
}

export default function DeploymentsPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<string | undefined>('active')
  const { data, isLoading, error } = useDeploymentsQuery({ status: statusFilter })
  const pauseDeployment = usePauseDeployment()
  const resumeDeployment = useResumeDeployment()
  const teardownDeployment = useTeardownDeployment()
  const runNow = useRunDeploymentNow()
  const setHeaderActions = useUIStore(s => s.setHeaderActions)
  const [teardownTarget, setTeardownTarget] = useState<{ id: string; name: string } | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    setHeaderActions(null)
    return () => setHeaderActions(null)
  }, [setHeaderActions])

  if (error) return <ErrorState message="Failed to load deployments" />

  const deployments = data?.deployments ?? []

  return (
    <div className="space-y-6 p-6">
      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-lg bg-background/50 border border-border/25 p-1 w-fit">
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={label}
            onClick={() => setStatusFilter(value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
              statusFilter === value
                ? 'bg-accent/25 text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState label="Loading deployments..." />
      ) : deployments.length === 0 ? (
        <EmptyState
          title="No deployments yet"
          description="Deploy an automation to create a live instance with a trigger."
          actionLabel="View Automations"
          onAction={() => navigate('/automations')}
          icon={<Rocket className="h-5 w-5" />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/25 bg-card/30">
          <table className="min-w-full divide-y divide-border/60">
            <thead className="bg-background/35">
              <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground/75">
                <th className="w-10 px-2 py-3"></th>
                <th className="px-4 py-3 font-medium">Deployment</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Trigger</th>
                <th className="px-4 py-3 font-medium">Inputs</th>
                <th className="px-4 py-3 font-medium">Last Run</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {deployments.map((d: Deployment) => {
                const isExpanded = expandedId === d.id
                const hasInputs = Object.keys(d.input_values).length > 0
                return (
                  <Fragment key={d.id}>
                  <tr className="text-sm text-foreground">
                    {/* Run CTA — leftmost */}
                    <td className="px-2 py-3">
                      {d.status === 'active' && (
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-600/90"
                          onClick={() => runNow.mutate(d.id)}
                          title="Run now"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {d.status === 'paused' && (
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-600/90"
                          onClick={() => resumeDeployment.mutate(d.id)}
                          title="Resume"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                    {/* Name */}
                    <td className="px-4 py-3">
                      <button
                        className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                        onClick={() => hasInputs ? setExpandedId(isExpanded ? null : d.id) : undefined}
                      >
                        <Rocket className="h-4 w-4 text-accent flex-shrink-0" />
                        <div className="min-w-0">
                          <span className="font-medium text-foreground">
                            {d.automation_name ?? `Deployment ${d.id.slice(0, 8)}`}
                          </span>
                          <p className="mt-0.5 text-xs text-muted-foreground/80">{d.id.slice(0, 8)}</p>
                        </div>
                        {hasInputs && (
                          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        )}
                      </button>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    {/* Trigger */}
                    <td className="px-4 py-3">
                      <TriggerBadge deployment={d} />
                    </td>
                    {/* Inputs preview */}
                    <td className="px-4 py-3">
                      {!isExpanded ? (
                        <InputChips inputValues={d.input_values} />
                      ) : (
                        <span className="text-[10px] text-muted-foreground/60 italic">expanded below</span>
                      )}
                    </td>
                    {/* Last Run */}
                    <td className="px-4 py-3 text-muted-foreground/90 text-xs">
                      {d.last_run_at ? formatRelativeTime(d.last_run_at) : <span className="text-muted-foreground/60">Never</span>}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link className="inline-flex items-center gap-1 text-xs text-accent transition hover:text-accent/80" to={deploymentsRoute(d.id)}>
                          View <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                        {d.status === 'active' && (
                          <button
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition"
                            onClick={() => pauseDeployment.mutate(d.id)}
                            title="Pause"
                          >
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {d.status !== 'torn_down' && (
                          <button
                            className="text-xs text-red-400 hover:text-red-300 transition"
                            onClick={() => setTeardownTarget({ id: d.id, name: d.automation_name ?? `Deployment ${d.id.slice(0, 8)}` })}
                          >
                            Tear Down
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && hasInputs && (
                    <tr className="bg-card/20">
                      <td colSpan={7} className="px-6 py-4">
                        <ExpandedInputs inputValues={d.input_values} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        isOpen={teardownTarget !== null}
        onClose={() => setTeardownTarget(null)}
        onConfirm={() => {
          if (teardownTarget) {
            teardownDeployment.mutate(teardownTarget.id, {
              onSuccess: () => setTeardownTarget(null),
            })
          }
        }}
        title="Tear Down Deployment"
        message={`Are you sure you want to tear down "${teardownTarget?.name}"? This will permanently stop the deployment. This action cannot be undone.`}
        confirmLabel="Tear Down"
        cancelLabel="Cancel"
        variant="danger"
        icon="warning"
        loading={teardownDeployment.isPending}
      />
    </div>
  )
}
