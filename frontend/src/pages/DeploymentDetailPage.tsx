import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Play, Pause, XCircle, Clock, Settings } from 'lucide-react'

import {
  useDeploymentQuery,
  usePauseDeployment,
  useResumeDeployment,
  useTeardownDeployment,
  useRunDeploymentNow,
} from '@/features/deployments'
import { useRunsQuery } from '@/features/runs'
import { deploymentsRoute, deploymentRunRoute } from '@/lib/routes'
import { formatDateTime, formatRelativeTime } from '@/lib/formatters'
import LoadingState from '@/components/shared/LoadingState'
import ErrorState from '@/components/shared/ErrorState'
import StatusBadge from '@/components/shared/StatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import DynamicParameterForm from '@/components/shared/DynamicParameterForm'
import type { ParameterDefinition } from '@/types/deployments'

export default function DeploymentDetailPage() {
  const { deploymentId } = useParams<{ deploymentId: string }>()
  const { data: deployment, isLoading, error } = useDeploymentQuery(deploymentId)
  const { data: runsData } = useRunsQuery({ deploymentId, limit: 20 })
  const pauseDeployment = usePauseDeployment()
  const resumeDeployment = useResumeDeployment()
  const teardownDeployment = useTeardownDeployment()
  const runNow = useRunDeploymentNow()

  if (isLoading) return <LoadingState label="Loading deployment..." />
  if (error || !deployment) return <ErrorState message="Deployment not found" />

  const deploymentRuns = runsData?.runs ?? []

  // Build a simple schema from input_values for display
  const displaySchema: ParameterDefinition[] = Object.entries(deployment.input_values).map(
    ([name, value]) => {
      // Parse composite key: "agent-slug_nodeKey.param_name" → "Agent Slug: Param Name"
      const dotIdx = name.indexOf('.')
      let label: string
      if (dotIdx > 0) {
        const nodeRaw = name.slice(0, dotIdx)
        const paramRaw = name.slice(dotIdx + 1)
        // Extract agent slug from node key (e.g., "deep-researcher_node_xxx_1" → "Deep Researcher")
        const agentSlug = nodeRaw.replace(/_node_.*$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        const paramLabel = paramRaw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        label = `${agentSlug}: ${paramLabel}`
      } else {
        label = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      }
      return {
        name,
        type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'text',
        label,
        required: false,
      }
    }
  )

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <Link
        to={deploymentsRoute()}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Deployments
      </Link>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PageHeader title={deployment.automation_name ?? `Deployment ${deployment.id.slice(0, 8)}`} description={deployment.automation_name ? `Deployment ${deployment.id.slice(0, 8)}` : ''} />
          <StatusBadge status={deployment.status} />
        </div>
        <div className="flex items-center gap-2">
          {deployment.status === 'active' && (
            <>
              <button
                onClick={() => runNow.mutate(deployment.id)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-600/90 transition flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" /> Run Now
              </button>
              <button
                onClick={() => pauseDeployment.mutate(deployment.id)}
                className="px-3 py-1.5 rounded-lg border border-border/60 text-sm text-muted-foreground hover:text-foreground transition flex items-center gap-1.5"
              >
                <Pause className="w-3.5 h-3.5" /> Pause
              </button>
              <button
                onClick={() => teardownDeployment.mutate(deployment.id)}
                className="px-3 py-1.5 rounded-lg border border-red-500/30 text-sm text-red-400 hover:text-red-300 hover:border-red-500/50 transition flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" /> Tear Down
              </button>
            </>
          )}
          {deployment.status === 'paused' && (
            <>
              <button
                onClick={() => resumeDeployment.mutate(deployment.id)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-600/90 transition flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" /> Resume
              </button>
              <button
                onClick={() => teardownDeployment.mutate(deployment.id)}
                className="px-3 py-1.5 rounded-lg border border-red-500/30 text-sm text-red-400 hover:text-red-300 hover:border-red-500/50 transition flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" /> Tear Down
              </button>
            </>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border/60 bg-card/40 p-3">
          <p className="text-xs text-muted-foreground mb-1">Created</p>
          <p className="text-sm text-foreground">{deployment.created_at ? formatDateTime(deployment.created_at) : '—'}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 p-3">
          <p className="text-xs text-muted-foreground mb-1">Last Run</p>
          <p className="text-sm text-foreground">{deployment.last_run_at ? formatRelativeTime(deployment.last_run_at) : 'Never'}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 p-3">
          <p className="text-xs text-muted-foreground mb-1">Last Success</p>
          <p className="text-sm text-foreground">{deployment.last_success_at ? formatRelativeTime(deployment.last_success_at) : '—'}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 p-3">
          <p className="text-xs text-muted-foreground mb-1">Deployed By</p>
          <p className="text-sm text-foreground">{deployment.deployed_by ?? '—'}</p>
        </div>
      </div>

      {/* Schedule */}
      {deployment.schedule_expression && (
        <div className="rounded-xl border border-border/60 bg-card/40 p-4 flex items-center gap-3">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Schedule</p>
            <p className="text-sm font-mono text-foreground">{deployment.schedule_expression}</p>
          </div>
        </div>
      )}

      {/* Input Values (read-only form) */}
      {Object.keys(deployment.input_values).length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/40 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Configuration</h3>
          </div>
          <DynamicParameterForm
            schema={displaySchema}
            values={deployment.input_values}
            onChange={() => {}}
            readOnly
          />
        </div>
      )}

      {/* Run History */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Run History</h3>
        </div>
        {deploymentRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet</p>
        ) : (
          <div className="space-y-2">
            {deploymentRuns.map((run) => (
              <Link
                key={run.id}
                to={deploymentRunRoute(deployment.id, run.id)}
                className="flex items-center justify-between rounded-lg border border-border/60 p-3 hover:bg-card/60 transition"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={run.status} />
                  <span className="text-sm font-mono text-foreground">
                    {run.id.slice(0, 8)}
                  </span>
                </div>
                {run.started_at && (
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(run.started_at)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Torn down notice */}
      {deployment.status === 'torn_down' && deployment.torn_down_at && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          Torn down {formatRelativeTime(deployment.torn_down_at)}
        </div>
      )}
    </div>
  )
}
