import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  Rocket,
  Pause,
  Play,
  Trash2,
  MoreHorizontal,
  Inbox,
  Calendar,
  Clock,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  listDeployments,
  pauseDeployment,
  resumeDeployment,
  teardownDeployment,
  runDeploymentNow,
} from '@/lib/api'
import { deploymentsRoute } from '@/lib/routes'
import type { Deployment, DeploymentStatus } from '@/types/deployments'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmModal from '@/components/shared/ConfirmModal'
import LoadingSpinner from '@/components/shared/LoadingSpinner'

/* -------------------------------------------------------------------------- */
/* Filter tabs                                                                */
/* -------------------------------------------------------------------------- */

type FilterTab = 'all' | 'active' | 'paused' | 'torn_down'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'torn_down', label: 'Torn Down' },
]

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function DeploymentsPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<FilterTab>('all')
  const [teardownTarget, setTeardownTarget] = useState<string | null>(null)

  const deploymentsQuery = useQuery({
    queryKey: ['deployments', filter],
    queryFn: () =>
      listDeployments(filter === 'all' ? undefined : { status: filter }),
  })

  const deployments: Deployment[] = deploymentsQuery.data?.deployments ?? []

  const pauseMutation = useMutation({
    mutationFn: (id: string) => pauseDeployment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployments'] }),
  })

  const resumeMutation = useMutation({
    mutationFn: (id: string) => resumeDeployment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployments'] }),
  })

  const teardownMutation = useMutation({
    mutationFn: (id: string) => teardownDeployment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      setTeardownTarget(null)
    },
  })

  const runNowMutation = useMutation({
    mutationFn: (id: string) => runDeploymentNow(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployments'] }),
  })

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Deployments"
        description="Active automation deployments and their run history"
      />

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-bg-elevated p-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'rounded-md px-4 py-1.5 font-label text-sm font-medium transition-colors',
              filter === tab.key
                ? 'bg-primary text-fg-on-primary'
                : 'text-fg-muted hover:text-fg hover:bg-bg-sunken',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {deploymentsQuery.isLoading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* Empty state */}
      {!deploymentsQuery.isLoading && deployments.length === 0 && (
        <EmptyState
          icon={Rocket}
          title="No deployments"
          description="Deploy an automation to see it listed here. Deployments run automations on a schedule."
        />
      )}

      {/* Table */}
      {!deploymentsQuery.isLoading && deployments.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border/40 bg-bg-elevated">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/30">
                <th className="px-5 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                  Automation
                </th>
                <th className="px-5 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                  Status
                </th>
                <th className="hidden px-5 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted md:table-cell">
                  Schedule
                </th>
                <th className="hidden px-5 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted lg:table-cell">
                  Last Run
                </th>
                <th className="hidden px-5 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted lg:table-cell">
                  Last Success
                </th>
                <th className="px-5 py-3 text-right font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {deployments.map((dep) => (
                <DeploymentRow
                  key={dep.id}
                  deployment={dep}
                  onPause={() => pauseMutation.mutate(dep.id)}
                  onResume={() => resumeMutation.mutate(dep.id)}
                  onRunNow={() => runNowMutation.mutate(dep.id)}
                  onTeardown={() => setTeardownTarget(dep.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Teardown confirmation */}
      <ConfirmModal
        open={teardownTarget !== null}
        onOpenChange={(open) => {
          if (!open) setTeardownTarget(null)
        }}
        title="Teardown Deployment"
        description="Are you sure you want to tear down this deployment? This will stop all future scheduled runs. This action cannot be undone."
        confirmLabel="Teardown"
        variant="danger"
        onConfirm={() => {
          if (teardownTarget) teardownMutation.mutate(teardownTarget)
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Deployment row                                                             */
/* -------------------------------------------------------------------------- */

interface DeploymentRowProps {
  deployment: Deployment
  onPause: () => void
  onResume: () => void
  onRunNow: () => void
  onTeardown: () => void
}

function DeploymentRow({ deployment, onPause, onResume, onRunNow, onTeardown }: DeploymentRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const status = deployment.status as DeploymentStatus

  const statusVariant =
    status === 'active' ? 'success' : status === 'paused' ? 'warning' : 'default'

  return (
    <tr className="group transition-colors hover:bg-bg-sunken/40">
      <td className="px-5 py-4">
        <Link
          to={deploymentsRoute(deployment.id)}
          className="font-body text-sm font-medium text-fg hover:text-primary transition-colors"
        >
          {deployment.automation_name ?? 'Unnamed Automation'}
        </Link>
      </td>
      <td className="px-5 py-4">
        <StatusBadge status={status} variant={statusVariant} />
      </td>
      <td className="hidden px-5 py-4 md:table-cell">
        <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
          <Calendar className="h-3.5 w-3.5" />
          {deployment.schedule_expression ?? 'Manual'}
        </span>
      </td>
      <td className="hidden px-5 py-4 lg:table-cell">
        <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
          <Clock className="h-3.5 w-3.5" />
          {deployment.last_run_at
            ? formatDistanceToNow(new Date(deployment.last_run_at), { addSuffix: true })
            : 'Never'}
        </span>
      </td>
      <td className="hidden px-5 py-4 lg:table-cell">
        <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {deployment.last_success_at
            ? formatDistanceToNow(new Date(deployment.last_success_at), { addSuffix: true })
            : 'Never'}
        </span>
      </td>
      <td className="px-5 py-4 text-right">
        <div className="relative inline-block">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-md p-1.5 text-fg-subtle hover:text-fg hover:bg-bg-sunken transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-bg-elevated py-1 shadow-lg">
                {status === 'active' && (
                  <button
                    onClick={() => {
                      onPause()
                      setMenuOpen(false)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-bg-sunken transition-colors"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    Pause
                  </button>
                )}
                {status === 'paused' && (
                  <button
                    onClick={() => {
                      onResume()
                      setMenuOpen(false)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-bg-sunken transition-colors"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Resume
                  </button>
                )}
                {status !== 'torn_down' && (
                  <>
                    <button
                      onClick={() => {
                        onRunNow()
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-bg-sunken transition-colors"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Run Now
                    </button>
                    <button
                      onClick={() => {
                        onTeardown()
                        setMenuOpen(false)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-bg-sunken transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Teardown
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}
