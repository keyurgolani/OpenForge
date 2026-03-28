import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, format, differenceInSeconds } from 'date-fns'
import {
  ArrowLeft,
  ListOrdered,
  GitBranch,
  Radio,
  Archive,
  Layers,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
  Hash,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  getRun,
  listRunSteps,
  getRunLineage,
  listRunEvents,
  listRunCheckpoints,
  getRunCompositeDebug,
} from '@/lib/api'
import { runsRoute } from '@/lib/routes'
import type { Run, RunStep, RunLineage, RuntimeEvent, Checkpoint, RunCompositeDebug } from '@/types/runs'
import StatusBadge from '@/components/shared/StatusBadge'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import EmptyState from '@/components/shared/EmptyState'

/* -------------------------------------------------------------------------- */
/* Tab types                                                                  */
/* -------------------------------------------------------------------------- */

type Tab = 'steps' | 'lineage' | 'events' | 'checkpoints' | 'composite'

const TABS: { key: Tab; label: string; icon: typeof ListOrdered }[] = [
  { key: 'steps', label: 'Steps', icon: ListOrdered },
  { key: 'lineage', label: 'Lineage', icon: GitBranch },
  { key: 'events', label: 'Events', icon: Radio },
  { key: 'checkpoints', label: 'Checkpoints', icon: Archive },
  { key: 'composite', label: 'Composite', icon: Layers },
]

/* -------------------------------------------------------------------------- */
/* Duration helper                                                            */
/* -------------------------------------------------------------------------- */

function formatDuration(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) return '--'
  const start = new Date(startedAt)
  const end = completedAt ? new Date(completedAt) : new Date()
  const seconds = differenceInSeconds(end, start)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const [activeTab, setActiveTab] = useState<Tab>('steps')

  const runQuery = useQuery({
    queryKey: ['run', runId],
    queryFn: () => getRun(runId!),
    enabled: !!runId,
  })

  const stepsQuery = useQuery({
    queryKey: ['run-steps', runId],
    queryFn: () => listRunSteps(runId!),
    enabled: !!runId && activeTab === 'steps',
  })

  const lineageQuery = useQuery({
    queryKey: ['run-lineage', runId],
    queryFn: () => getRunLineage(runId!),
    enabled: !!runId && activeTab === 'lineage',
  })

  const eventsQuery = useQuery({
    queryKey: ['run-events', runId],
    queryFn: () => listRunEvents(runId!),
    enabled: !!runId && activeTab === 'events',
  })

  const checkpointsQuery = useQuery({
    queryKey: ['run-checkpoints', runId],
    queryFn: () => listRunCheckpoints(runId!),
    enabled: !!runId && activeTab === 'checkpoints',
  })

  const compositeQuery = useQuery({
    queryKey: ['run-composite', runId],
    queryFn: () => getRunCompositeDebug(runId!),
    enabled: !!runId && activeTab === 'composite',
  })

  const run: Run | null = runQuery.data ?? null

  if (runQuery.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!run) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={AlertTriangle}
          title="Run not found"
          description="The run you are looking for does not exist or has been removed."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <Link
        to={runsRoute()}
        className="inline-flex items-center gap-1.5 font-label text-sm text-fg-muted hover:text-fg transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Runs
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
            Run {run.id.slice(0, 8)}
          </h1>
          <StatusBadge status={run.status} />
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5" />
            Type: {run.run_type}
          </span>
          {run.started_at && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Started {format(new Date(run.started_at), 'PPpp')}
            </span>
          )}
          {run.completed_at && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Completed {format(new Date(run.completed_at), 'PPpp')}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Duration: {formatDuration(run.started_at, run.completed_at)}
          </span>
        </div>

        {run.error_message && (
          <div className="rounded-md border border-danger/30 bg-danger/5 p-3">
            <p className="text-sm text-danger">
              <strong>Error:</strong> {run.error_message}
              {run.error_code && <span className="ml-2 font-mono text-xs">({run.error_code})</span>}
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/40">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 font-label text-sm font-medium transition-colors',
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
      {activeTab === 'steps' && (
        <StepsTab steps={stepsQuery.data?.steps ?? []} isLoading={stepsQuery.isLoading} />
      )}
      {activeTab === 'lineage' && (
        <LineageTab lineage={lineageQuery.data ?? null} isLoading={lineageQuery.isLoading} />
      )}
      {activeTab === 'events' && (
        <EventsTab events={eventsQuery.data?.events ?? []} isLoading={eventsQuery.isLoading} />
      )}
      {activeTab === 'checkpoints' && (
        <CheckpointsTab
          checkpoints={checkpointsQuery.data?.checkpoints ?? []}
          isLoading={checkpointsQuery.isLoading}
        />
      )}
      {activeTab === 'composite' && (
        <CompositeTab
          debug={compositeQuery.data ?? null}
          isLoading={compositeQuery.isLoading}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Collapsible JSON component                                                 */
/* -------------------------------------------------------------------------- */

function CollapsibleJSON({ label, data }: { label: string; data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  const hasData = Object.keys(data).length > 0

  if (!hasData) return null

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {label}
      </button>
      {open && (
        <pre className="mt-2 overflow-x-auto rounded-md bg-bg-sunken p-3 font-mono text-xs text-fg">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Steps tab                                                                  */
/* -------------------------------------------------------------------------- */

function StepsTab({ steps, isLoading }: { steps: RunStep[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (steps.length === 0) {
    return (
      <EmptyState
        icon={ListOrdered}
        title="No steps recorded"
        description="This run has no recorded execution steps yet."
      />
    )
  }

  const sorted = [...steps].sort((a, b) => a.step_index - b.step_index)

  return (
    <div className="space-y-3">
      {sorted.map((step) => (
        <div
          key={step.id}
          className="rounded-lg border border-border/40 bg-bg-elevated p-5"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">
                {step.step_index}
              </span>
              <div>
                <p className="font-label text-sm font-medium text-fg">
                  {step.node_key ?? `Step ${step.step_index}`}
                </p>
                <div className="flex items-center gap-3 text-xs text-fg-muted">
                  {step.started_at && (
                    <span>
                      {formatDistanceToNow(new Date(step.started_at), { addSuffix: true })}
                    </span>
                  )}
                  <span>Duration: {formatDuration(step.started_at, step.completed_at)}</span>
                  {step.retry_count > 0 && <span>Retries: {step.retry_count}</span>}
                </div>
              </div>
            </div>
            <StatusBadge status={step.status} />
          </div>

          {step.error_message && (
            <div className="mt-3 rounded-md border border-danger/30 bg-danger/5 p-2">
              <p className="text-xs text-danger">{step.error_message}</p>
            </div>
          )}

          <div className="mt-3 space-y-2">
            <CollapsibleJSON label="Input" data={step.input_snapshot} />
            <CollapsibleJSON label="Output" data={step.output_snapshot} />
            <CollapsibleJSON label="Composite Metadata" data={step.composite_metadata} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Lineage tab                                                                */
/* -------------------------------------------------------------------------- */

function LineageTab({ lineage, isLoading }: { lineage: RunLineage | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!lineage) {
    return (
      <EmptyState
        icon={GitBranch}
        title="No lineage data"
        description="Lineage information is not available for this run."
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Parent run */}
      {lineage.parent_run && (
        <div className="rounded-lg border border-border/40 bg-bg-elevated p-5">
          <h3 className="mb-3 font-display text-sm font-semibold text-fg">Parent Run</h3>
          <RunCard run={lineage.parent_run} />
        </div>
      )}

      {/* Current run marker */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border/40" />
        <span className="font-label text-xs font-medium text-fg-muted">Current Run</span>
        <div className="h-px flex-1 bg-border/40" />
      </div>

      {/* Child runs */}
      {lineage.child_runs.length > 0 ? (
        <div className="rounded-lg border border-border/40 bg-bg-elevated p-5">
          <h3 className="mb-3 font-display text-sm font-semibold text-fg">
            Child Runs ({lineage.child_runs.length})
          </h3>
          <div className="space-y-3">
            {lineage.child_runs.map((child) => (
              <RunCard key={child.id} run={child} />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-fg-muted">No child runs spawned.</p>
      )}

      {/* Tree */}
      {Object.keys(lineage.tree).length > 0 && (
        <div className="rounded-lg border border-border/40 bg-bg-elevated p-5">
          <h3 className="mb-3 font-display text-sm font-semibold text-fg">Tree</h3>
          <pre className="overflow-x-auto rounded-md bg-bg-sunken p-4 font-mono text-xs text-fg">
            {JSON.stringify(lineage.tree, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function RunCard({ run }: { run: Run }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/20 bg-bg-sunken/40 p-3">
      <div className="flex items-center gap-3">
        <Link
          to={runsRoute(run.id)}
          className="font-mono text-sm text-primary hover:underline"
        >
          {run.id.slice(0, 8)}...
        </Link>
        <span className="font-label text-xs text-fg-muted">{run.run_type}</span>
      </div>
      <StatusBadge status={run.status} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Events tab                                                                 */
/* -------------------------------------------------------------------------- */

function EventsTab({ events, isLoading }: { events: RuntimeEvent[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Radio}
        title="No events"
        description="No runtime events have been recorded for this run."
      />
    )
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div
          key={event.id}
          className="rounded-lg border border-border/40 bg-bg-elevated p-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-secondary/10 px-2.5 py-0.5 font-label text-xs font-medium text-secondary">
                {event.event_type}
              </span>
              {event.node_key && (
                <span className="font-mono text-xs text-fg-muted">node: {event.node_key}</span>
              )}
            </div>
            {event.created_at && (
              <span className="text-xs text-fg-muted">
                {format(new Date(event.created_at), 'HH:mm:ss.SSS')}
              </span>
            )}
          </div>
          {Object.keys(event.payload).length > 0 && (
            <pre className="mt-2 overflow-x-auto rounded-md bg-bg-sunken p-3 font-mono text-xs text-fg">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Checkpoints tab                                                            */
/* -------------------------------------------------------------------------- */

function CheckpointsTab({
  checkpoints,
  isLoading,
}: {
  checkpoints: Checkpoint[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (checkpoints.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        title="No checkpoints"
        description="No checkpoints have been saved for this run."
      />
    )
  }

  return (
    <div className="space-y-3">
      {checkpoints.map((cp) => (
        <div
          key={cp.id}
          className="rounded-lg border border-border/40 bg-bg-elevated p-5"
        >
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <p className="font-label text-sm font-medium text-fg">{cp.checkpoint_type}</p>
              <p className="font-mono text-xs text-fg-muted">{cp.id.slice(0, 12)}...</p>
            </div>
            {cp.created_at && (
              <span className="text-xs text-fg-muted">
                {format(new Date(cp.created_at), 'PPpp')}
              </span>
            )}
          </div>
          <CollapsibleJSON label="State Snapshot" data={cp.state_snapshot} />
          <CollapsibleJSON label="Metadata" data={cp.metadata} />
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Composite tab                                                              */
/* -------------------------------------------------------------------------- */

function CompositeTab({
  debug,
  isLoading,
}: {
  debug: RunCompositeDebug | null
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!debug) {
    return (
      <EmptyState
        icon={Layers}
        title="No composite data"
        description="Composite debug information is not available for this run."
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Delegation history */}
      <div className="rounded-lg border border-border/40 bg-bg-elevated p-5">
        <h3 className="mb-3 font-display text-sm font-semibold text-fg">
          Delegation History ({debug.delegation_history.length})
        </h3>
        {debug.delegation_history.length > 0 ? (
          <pre className="overflow-x-auto rounded-md bg-bg-sunken p-4 font-mono text-xs text-fg">
            {JSON.stringify(debug.delegation_history, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-fg-muted">No delegation history.</p>
        )}
      </div>

      {/* Branch groups */}
      <div className="rounded-lg border border-border/40 bg-bg-elevated p-5">
        <h3 className="mb-3 font-display text-sm font-semibold text-fg">
          Branch Groups ({debug.branch_groups.length})
        </h3>
        {debug.branch_groups.length > 0 ? (
          <pre className="overflow-x-auto rounded-md bg-bg-sunken p-4 font-mono text-xs text-fg">
            {JSON.stringify(debug.branch_groups, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-fg-muted">No branch groups.</p>
        )}
      </div>

      {/* Merge outcomes */}
      <div className="rounded-lg border border-border/40 bg-bg-elevated p-5">
        <h3 className="mb-3 font-display text-sm font-semibold text-fg">
          Merge Outcomes ({debug.merge_outcomes.length})
        </h3>
        {debug.merge_outcomes.length > 0 ? (
          <pre className="overflow-x-auto rounded-md bg-bg-sunken p-4 font-mono text-xs text-fg">
            {JSON.stringify(debug.merge_outcomes, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-fg-muted">No merge outcomes.</p>
        )}
      </div>
    </div>
  )
}
