import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import {
  ArrowLeft,
  Pause,
  Play,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Settings,
  ListOrdered,
  LayoutDashboard,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  getDeployment,
  listRuns,
  pauseDeployment,
  resumeDeployment,
  runDeploymentNow,
  teardownDeployment,
} from '@/lib/api'
import { deploymentsRoute, runsRoute } from '@/lib/routes'
import type { Deployment, DeploymentStatus } from '@/types/deployments'
import type { Run } from '@/types/runs'
import StatusBadge from '@/components/shared/StatusBadge'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import ConfirmModal from '@/components/shared/ConfirmModal'
import EmptyState from '@/components/shared/EmptyState'

/* -------------------------------------------------------------------------- */
/* Tab types                                                                  */
/* -------------------------------------------------------------------------- */

type Tab = 'overview' | 'runs' | 'configuration'

const TABS: { key: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'runs', label: 'Runs', icon: ListOrdered },
  { key: 'configuration', label: 'Configuration', icon: Settings },
]

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function DeploymentDetailPage() {
  const { deploymentId } = useParams<{ deploymentId: string }>()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [teardownOpen, setTeardownOpen] = useState(false)
  const [runsPage, setRunsPage] = useState(0)
  const pageSize = 20

  const deploymentQuery = useQuery({
    queryKey: ['deployment', deploymentId],
    queryFn: () => getDeployment(deploymentId!),
    enabled: !!deploymentId,
  })

  const runsQuery = useQuery({
    queryKey: ['deployment-runs', deploymentId, runsPage],
    queryFn: () =>
      listRuns({ deployment_id: deploymentId!, skip: runsPage * pageSize, limit: pageSize }),
    enabled: !!deploymentId && activeTab === 'runs',
  })

  const deployment: Deployment | null = deploymentQuery.data ?? null
  const runs: Run[] = runsQuery.data?.runs ?? []
  const runsTotal = runsQuery.data?.total ?? 0

  const pauseMutation = useMutation({
    mutationFn: () => pauseDeployment(deploymentId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployment', deploymentId] }),
  })

  const resumeMutation = useMutation({
    mutationFn: () => resumeDeployment(deploymentId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployment', deploymentId] }),
  })

  const runNowMutation = useMutation({
    mutationFn: () => runDeploymentNow(deploymentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment', deploymentId] })
      queryClient.invalidateQueries({ queryKey: ['deployment-runs', deploymentId] })
    },
  })

  const teardownMutation = useMutation({
    mutationFn: () => teardownDeployment(deploymentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment', deploymentId] })
      setTeardownOpen(false)
    },
  })

  if (deploymentQuery.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!deployment) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={AlertTriangle}
          title="Deployment not found"
          description="The deployment you are looking for does not exist or has been removed."
        />
      </div>
    )
  }

  const status = deployment.status as DeploymentStatus
  const statusVariant =
    status === 'active' ? 'success' : status === 'paused' ? 'warning' : 'default'

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <Link
        to={deploymentsRoute()}
        className="inline-flex items-center gap-1.5 font-label text-sm text-fg-muted hover:text-fg transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Deployments
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
              {deployment.automation_name ?? 'Unnamed Deployment'}
            </h1>
            <StatusBadge status={status} variant={statusVariant} />
          </div>
          <div className="flex items-center gap-4 text-sm text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {deployment.schedule_expression ?? 'Manual trigger'}
            </span>
            {deployment.created_at && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Created {formatDistanceToNow(new Date(deployment.created_at), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {status === 'active' && (
            <button
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 font-label text-sm font-medium text-fg hover:bg-bg-sunken transition-colors"
            >
              <Pause className="h-4 w-4" />
              Pause
            </button>
          )}
          {status === 'paused' && (
            <button
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 font-label text-sm font-medium text-fg hover:bg-bg-sunken transition-colors"
            >
              <Play className="h-4 w-4" />
              Resume
            </button>
          )}
          {status !== 'torn_down' && (
            <>
              <button
                onClick={() => runNowMutation.mutate()}
                disabled={runNowMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label text-sm font-medium text-fg-on-primary hover:bg-primary-hover transition-colors"
              >
                <Play className="h-4 w-4" />
                Run Now
              </button>
              <button
                onClick={() => setTeardownOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-danger/30 px-4 py-2 font-label text-sm font-medium text-danger hover:bg-danger/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Teardown
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/40">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'inline-flex items-center gap-2 border-b-2 px-4 py-2.5 font-label text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-fg-muted hover:text-fg hover:border-border',
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab deployment={deployment} />}
      {activeTab === 'runs' && (
        <RunsTab
          runs={runs}
          total={runsTotal}
          page={runsPage}
          pageSize={pageSize}
          onPageChange={setRunsPage}
          isLoading={runsQuery.isLoading}
        />
      )}
      {activeTab === 'configuration' && <ConfigurationTab deployment={deployment} />}

      {/* Teardown confirmation */}
      <ConfirmModal
        open={teardownOpen}
        onOpenChange={setTeardownOpen}
        title="Teardown Deployment"
        description="Are you sure you want to tear down this deployment? This will stop all future scheduled runs. This action cannot be undone."
        confirmLabel="Teardown"
        variant="danger"
        onConfirm={() => teardownMutation.mutate()}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Overview tab                                                               */
/* -------------------------------------------------------------------------- */

function OverviewTab({ deployment }: { deployment: Deployment }) {
  const infoItems = [
    { label: 'Deployment ID', value: deployment.id },
    { label: 'Automation ID', value: deployment.automation_id },
    { label: 'Workspace ID', value: deployment.workspace_id },
    { label: 'Status', value: deployment.status },
    {
      label: 'Schedule',
      value: deployment.schedule_expression ?? 'Manual trigger',
    },
    {
      label: 'Last Run',
      value: deployment.last_run_at
        ? format(new Date(deployment.last_run_at), 'PPpp')
        : 'Never',
    },
    {
      label: 'Last Success',
      value: deployment.last_success_at
        ? format(new Date(deployment.last_success_at), 'PPpp')
        : 'Never',
    },
    {
      label: 'Last Failure',
      value: deployment.last_failure_at
        ? format(new Date(deployment.last_failure_at), 'PPpp')
        : 'None',
    },
    {
      label: 'Created',
      value: deployment.created_at
        ? format(new Date(deployment.created_at), 'PPpp')
        : 'Unknown',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border/40 bg-bg-elevated">
        <div className="border-b border-border/30 px-5 py-4">
          <h3 className="font-display text-base font-semibold text-fg">Deployment Info</h3>
        </div>
        <div className="divide-y divide-border/20">
          {infoItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between px-5 py-3">
              <span className="font-label text-sm text-fg-muted">{item.label}</span>
              <span className="font-mono text-sm text-fg">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Input values */}
      {Object.keys(deployment.input_values).length > 0 && (
        <div className="rounded-lg border border-border/40 bg-bg-elevated">
          <div className="border-b border-border/30 px-5 py-4">
            <h3 className="font-display text-base font-semibold text-fg">Input Values</h3>
          </div>
          <div className="p-5">
            <pre className="overflow-x-auto rounded-md bg-bg-sunken p-4 font-mono text-xs text-fg">
              {JSON.stringify(deployment.input_values, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Runs tab                                                                   */
/* -------------------------------------------------------------------------- */

interface RunsTabProps {
  runs: Run[]
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  isLoading: boolean
}

function RunsTab({ runs, total, page, pageSize, onPageChange, isLoading }: RunsTabProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={ListOrdered}
        title="No runs yet"
        description="This deployment has not been executed yet. Click 'Run Now' to trigger a run."
      />
    )
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border/40 bg-bg-elevated">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border/30">
              <th className="px-5 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Run ID
              </th>
              <th className="px-5 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Status
              </th>
              <th className="hidden px-5 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted md:table-cell">
                Type
              </th>
              <th className="px-5 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Started
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {runs.map((run) => (
              <tr key={run.id} className="transition-colors hover:bg-bg-sunken/40">
                <td className="px-5 py-3">
                  <Link
                    to={runsRoute(run.id)}
                    className="font-mono text-sm text-primary hover:underline"
                  >
                    {run.id.slice(0, 8)}...
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={run.status} />
                </td>
                <td className="hidden px-5 py-3 md:table-cell">
                  <span className="font-label text-sm text-fg-muted">{run.run_type}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="text-sm text-fg-muted">
                    {run.started_at
                      ? formatDistanceToNow(new Date(run.started_at), { addSuffix: true })
                      : 'Pending'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="font-label text-sm text-fg-muted">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-fg disabled:opacity-40 hover:bg-bg-sunken transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-fg disabled:opacity-40 hover:bg-bg-sunken transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Configuration tab                                                          */
/* -------------------------------------------------------------------------- */

function ConfigurationTab({ deployment }: { deployment: Deployment }) {
  return (
    <div className="space-y-6">
      {/* Input values */}
      <div className="rounded-lg border border-border/40 bg-bg-elevated">
        <div className="border-b border-border/30 px-5 py-4">
          <h3 className="font-display text-base font-semibold text-fg">Input Values</h3>
        </div>
        <div className="p-5">
          {Object.keys(deployment.input_values).length > 0 ? (
            <pre className="overflow-x-auto rounded-md bg-bg-sunken p-4 font-mono text-xs text-fg">
              {JSON.stringify(deployment.input_values, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-fg-muted">No input values configured.</p>
          )}
        </div>
      </div>

      {/* Schedule */}
      <div className="rounded-lg border border-border/40 bg-bg-elevated">
        <div className="border-b border-border/30 px-5 py-4">
          <h3 className="font-display text-base font-semibold text-fg">Schedule</h3>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-mono text-sm font-medium text-fg">
                {deployment.schedule_expression ?? 'No schedule'}
              </p>
              <p className="text-xs text-fg-muted">
                {deployment.schedule_expression
                  ? 'Runs on the above schedule expression'
                  : 'This deployment runs on manual trigger only'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* IDs */}
      <div className="rounded-lg border border-border/40 bg-bg-elevated">
        <div className="border-b border-border/30 px-5 py-4">
          <h3 className="font-display text-base font-semibold text-fg">Identifiers</h3>
        </div>
        <div className="divide-y divide-border/20">
          {[
            { label: 'Deployment ID', value: deployment.id },
            { label: 'Automation ID', value: deployment.automation_id },
            { label: 'Workspace ID', value: deployment.workspace_id },
            { label: 'Trigger ID', value: deployment.trigger_id ?? 'N/A' },
            { label: 'Agent Spec ID', value: deployment.agent_spec_id ?? 'N/A' },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between px-5 py-3">
              <span className="font-label text-sm text-fg-muted">{item.label}</span>
              <span className="font-mono text-xs text-fg">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
