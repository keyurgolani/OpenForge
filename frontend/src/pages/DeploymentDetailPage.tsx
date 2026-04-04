import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  ChevronRight,
  Clock,
  Database,
  Play,
  Pause,
  Rocket,
  Settings,
  Timer,
  Upload,
  XCircle,
  Zap,
} from 'lucide-react'

import AccordionSection from '@/components/agents/sections/AccordionSection'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import Siderail from '@/components/shared/Siderail'
import StatusBadge from '@/components/shared/StatusBadge'
import {
  useDeploymentQuery,
  usePauseDeployment,
  useResumeDeployment,
  useTeardownDeployment,
  useRunDeploymentNow,
  usePromoteDeploymentWorkspace,
} from '@/features/deployments'
import { useRunsQuery } from '@/features/runs'
import { useQuery } from '@tanstack/react-query'
import { getWorkspace } from '@/lib/api'
import { deploymentsRoute, deploymentRunRoute, automationsRoute } from '@/lib/routes'
import { formatDateTime, formatRelativeTime } from '@/lib/formatters'

type SiderailSection = 'trigger' | 'config' | 'metadata' | null

function parseInputLabel(name: string): string {
  const dotIdx = name.indexOf('.')
  if (dotIdx > 0) {
    const nodeRaw = name.slice(0, dotIdx)
    const paramRaw = name.slice(dotIdx + 1)
    const agentSlug = nodeRaw.replace(/_node_.*$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const paramLabel = paramRaw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    return `${agentSlug}: ${paramLabel}`
  }
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function DeploymentDetailPage() {
  const { deploymentId } = useParams<{ deploymentId: string }>()
  const navigate = useNavigate()
  const { data: deployment, isLoading, error } = useDeploymentQuery(deploymentId)
  const { data: runsData } = useRunsQuery({ deploymentId, limit: 20 })
  const pauseDeployment = usePauseDeployment()
  const resumeDeployment = useResumeDeployment()
  const teardownDeployment = useTeardownDeployment()
  const runNow = useRunDeploymentNow()
  const promoteWorkspace = usePromoteDeploymentWorkspace()
  const ownedWsId = deployment?.owned_workspace_id
  const { data: ownedWorkspace } = useQuery({
    queryKey: ['workspace', ownedWsId],
    queryFn: () => getWorkspace(ownedWsId!),
    enabled: !!ownedWsId,
  })

  const [teardownOpen, setTeardownOpen] = useState(false)
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [siderailSection, setSiderailSection] = useState<SiderailSection>('trigger')

  const toggleSection = (key: SiderailSection) =>
    setSiderailSection((prev) => (prev === key ? null : key))

  if (isLoading) return <LoadingState label="Loading deployment..." />
  if (error || !deployment) return <ErrorState message="Deployment not found" />

  const deploymentRuns = runsData?.runs ?? []
  const inputEntries = Object.entries(deployment.input_values)

  const triggerLabel =
    deployment.trigger_type === 'cron'
      ? 'Cron Schedule'
      : deployment.trigger_type === 'interval'
      ? `Every ${deployment.interval_seconds ? `${deployment.interval_seconds}s` : '—'}`
      : 'Manual (on-demand)'

  const triggerDetail =
    deployment.trigger_type === 'cron' && deployment.schedule_expression
      ? deployment.schedule_expression
      : deployment.trigger_type === 'interval' && deployment.interval_seconds
      ? `${deployment.interval_seconds} seconds`
      : null

  return (
    <div className="flex h-full gap-4 p-6 overflow-hidden">
      {/* Main content */}
      <div className="flex flex-1 flex-col gap-6 min-w-0 overflow-y-auto min-h-0">
        {/* Back link */}
        <Link
          to={deploymentsRoute()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Deployments
        </Link>

        {/* Header */}
        <div className="rounded-2xl border border-border/25 bg-card/35 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Rocket className="h-6 w-6 text-accent flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">
                    {deployment.automation_name ?? `Deployment ${deployment.id.slice(0, 8)}`}
                  </h1>
                  <StatusBadge status={deployment.status} />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-muted-foreground/80 font-mono">{deployment.id.slice(0, 8)}</p>
                  {deployment.automation_id && (
                    <Link
                      to={automationsRoute(deployment.automation_id)}
                      className="text-xs text-accent hover:text-accent/80 transition"
                    >
                      View automation
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {deployment.status === 'active' && (
                <>
                  <button
                    onClick={() => runNow.mutate(deployment.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-600/90"
                  >
                    <Play className="w-3.5 h-3.5" /> Run Now
                  </button>
                  <button
                    onClick={() => pauseDeployment.mutate(deployment.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Pause className="w-3.5 h-3.5" /> Pause
                  </button>
                  <button
                    onClick={() => setTeardownOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-medium text-red-400 transition-colors hover:text-red-300 hover:bg-red-500/20"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Tear Down
                  </button>
                </>
              )}
              {deployment.status === 'paused' && (
                <>
                  <button
                    onClick={() => resumeDeployment.mutate(deployment.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-600/90"
                  >
                    <Play className="w-3.5 h-3.5" /> Resume
                  </button>
                  <button
                    onClick={() => setTeardownOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-medium text-red-400 transition-colors hover:text-red-300 hover:bg-red-500/20"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Tear Down
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Torn down notice */}
        {deployment.status === 'torn_down' && deployment.torn_down_at && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
            This deployment was torn down {formatRelativeTime(deployment.torn_down_at)}.
          </div>
        )}

        {/* Input configuration (main area — this is the important content) */}
        {inputEntries.length > 0 && (
          <div className="rounded-2xl border border-border/25 bg-card/30 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">Deployment Inputs</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {inputEntries.map(([name, value]) => (
                <div key={name} className="rounded-xl border border-border/25 bg-background/35 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70 mb-1">
                    {parseInputLabel(name)}
                  </p>
                  <p className="text-sm font-medium text-foreground break-words">
                    {String(value) || '—'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shared Knowledge Workspace */}
        {deployment.owned_workspace_id && (
          <div className="rounded-2xl border border-border/25 bg-card/30 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-semibold text-foreground">Shared Knowledge</h2>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/w/${deployment.owned_workspace_id}/knowledge`}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <BookOpen className="w-3 h-3" /> Browse
                </Link>
                {deployment.status !== 'torn_down' && (
                  <button
                    onClick={() => setPromoteOpen(true)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Upload className="w-3 h-3" /> Promote to Workspace
                  </button>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-border/25 bg-card/20 p-4 text-sm text-muted-foreground/80 space-y-2">
              {ownedWorkspace?.knowledge_count != null && (
                <p className="text-foreground/70 font-medium">
                  {ownedWorkspace.knowledge_count} knowledge item{ownedWorkspace.knowledge_count === 1 ? '' : 's'}
                </p>
              )}
              <p>
                Agents in this deployment share a persistent knowledge workspace that accumulates data across runs.
                Knowledge is read-only in the UI.
              </p>
            </div>
          </div>
        )}

        {/* Run History (main area) */}
        <div className="rounded-2xl border border-border/25 bg-card/30 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Run History</h2>
            <span className="text-xs text-muted-foreground/70">({deploymentRuns.length})</span>
          </div>
          {deploymentRuns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/25 bg-card/20 p-6 text-sm text-muted-foreground/80 text-center">
              No runs yet. {deployment.status === 'active' && 'Click "Run Now" to trigger a run.'}
            </div>
          ) : (
            <div className="space-y-2">
              {deploymentRuns.map((run) => (
                <Link
                  key={run.id}
                  to={deploymentRunRoute(deployment.id, run.id)}
                  className="flex items-center justify-between rounded-xl border border-border/25 bg-background/35 p-3 hover:bg-card/50 transition group"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge status={run.status} />
                    <span className="text-sm font-mono text-foreground">
                      {run.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {run.started_at && (
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(run.started_at)}
                      </span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Siderail */}
      <Siderail
        storageKey="openforge.deployment.detail.pct"
        collapsedStorageKey="openforge.deployment.detail.collapsed"
        icon={Settings}
        label="Details"
        breakpoint="lg"
      >
        {(onCollapse) => (
          <div className="flex h-full min-h-0 flex-col px-4">
            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold tracking-tight">Details</h3>
                </div>
                <p className="text-xs text-muted-foreground/90">Deployment configuration.</p>
              </div>
              <button
                type="button"
                onClick={onCollapse}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border/70 bg-card/60 text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
                aria-label="Collapse details sidebar"
                title="Collapse details"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Sections */}
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-2">
              {/* Trigger */}
              <AccordionSection
                title="Trigger"
                summary={triggerLabel}
                icon={deployment.trigger_type === 'cron' ? CalendarClock : deployment.trigger_type === 'interval' ? Timer : Zap}
                expanded={siderailSection === 'trigger'}
                onToggle={() => toggleSection('trigger')}
              >
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground/80">Type:</span> {triggerLabel}
                  </div>
                  {triggerDetail && (
                    <div>
                      <span className="font-medium text-foreground/80">Expression:</span>{' '}
                      <span className="font-mono">{triggerDetail}</span>
                    </div>
                  )}
                </div>
              </AccordionSection>

              {/* Metadata */}
              <AccordionSection
                title="Metadata"
                summary={deployment.created_at ? formatDateTime(deployment.created_at) : '--'}
                icon={Clock}
                expanded={siderailSection === 'metadata'}
                onToggle={() => toggleSection('metadata')}
              >
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground/80">Created:</span>{' '}
                    {deployment.created_at ? formatDateTime(deployment.created_at) : '—'}
                  </div>
                  <div>
                    <span className="font-medium text-foreground/80">Last run:</span>{' '}
                    {deployment.last_run_at ? formatRelativeTime(deployment.last_run_at) : 'Never'}
                  </div>
                  {deployment.torn_down_at && (
                    <div>
                      <span className="font-medium text-foreground/80">Torn down:</span>{' '}
                      {formatRelativeTime(deployment.torn_down_at)}
                    </div>
                  )}
                </div>
              </AccordionSection>

              {/* Input Summary */}
              {inputEntries.length > 0 && (
                <AccordionSection
                  title="Inputs"
                  summary={`${inputEntries.length} parameter${inputEntries.length !== 1 ? 's' : ''}`}
                  icon={Settings}
                  expanded={siderailSection === 'config'}
                  onToggle={() => toggleSection('config')}
                >
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {inputEntries.map(([name, value]) => (
                      <div key={name} className="flex justify-between gap-2">
                        <span className="font-medium text-foreground/80 truncate">{parseInputLabel(name)}</span>
                        <span className="text-right truncate max-w-[120px]">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </AccordionSection>
              )}
            </div>
          </div>
        )}
      </Siderail>

      {/* Teardown Confirmation */}
      <ConfirmModal
        isOpen={teardownOpen}
        onClose={() => setTeardownOpen(false)}
        onConfirm={() => {
          teardownDeployment.mutate(deployment.id, {
            onSuccess: () => {
              setTeardownOpen(false)
              navigate(deploymentsRoute())
            },
          })
        }}
        title="Tear Down Deployment"
        message={`Are you sure you want to tear down this deployment of "${deployment.automation_name}"? This will permanently stop all scheduled runs. This action cannot be undone.`}
        confirmLabel="Tear Down"
        cancelLabel="Cancel"
        variant="danger"
        icon="warning"
        loading={teardownDeployment.isPending}
      />

      {/* Promote Workspace Confirmation */}
      <ConfirmModal
        isOpen={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        onConfirm={() => {
          promoteWorkspace.mutate(deployment.id, {
            onSuccess: () => setPromoteOpen(false),
          })
        }}
        title="Promote to Regular Workspace"
        message="This will convert the deployment's shared knowledge workspace into a regular user workspace. The knowledge will become editable, and the deployment will no longer have a shared workspace."
        confirmLabel="Promote"
        cancelLabel="Cancel"
        variant="info"
        icon="info"
        loading={promoteWorkspace.isPending}
      />
    </div>
  )
}
