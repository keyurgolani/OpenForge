import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Clock,
  GitBranch,
  Loader2,
  Play,
  RotateCcw,
  Settings,
  Timer,
  Waypoints,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import AccordionSection from '@/components/agents/sections/AccordionSection'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import { ExecutionTimeline } from '@/components/shared/execution-timeline'
import { useDeploymentTimelineAdapter } from '@/hooks/timeline/useDeploymentTimelineAdapter'
import Siderail from '@/components/shared/Siderail'
import StatusBadge from '@/components/shared/StatusBadge'
import {
  useRunCheckpointsQuery,
  useRunEventsQuery,
  useRunLineageQuery,
  useRunQuery,
  useRunStepsQuery,
} from '@/features/runs'
import { formatDateTime, formatDuration, truncateText } from '@/lib/formatters'
import { replayRun } from '@/lib/api'
import { agentsRoute, deploymentsRoute, deploymentRunRoute, runsRoute } from '@/lib/routes'
import type { Run, RuntimeEvent } from '@/types/runs'
import type { TimelineItem, NodeExecutionTimelineItem, SinkExecutionTimelineItem } from '@/types/timeline'

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2)
}

function getDurationMs(startedAt?: string | null, completedAt?: string | null): number | null {
  if (!startedAt) return null
  const startMs = new Date(startedAt).getTime()
  const endMs = completedAt ? new Date(completedAt).getTime() : Date.now()
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null
  return Math.max(endMs - startMs, 0)
}

type SiderailSection = 'lineage' | 'checkpoints' | 'events' | null

export default function RunDetailPage() {
  const { runId = '', deploymentId } = useParams<{ runId: string; deploymentId: string }>()
  const navigate = useNavigate()
  const { data: run, isLoading, error } = useRunQuery(runId)
  const { data: stepsData } = useRunStepsQuery(runId)
  const { data: lineage } = useRunLineageQuery(runId)
  const { data: checkpointsData } = useRunCheckpointsQuery(runId)
  const { data: eventsData } = useRunEventsQuery(runId)
  const steps = useMemo(() => stepsData?.steps ?? [], [stepsData])
  const checkpoints = checkpointsData?.checkpoints ?? []
  const events = eventsData?.events ?? []
  const [selectedStepId, setSelectedStepId] = useState<string>('')
  const [replaying, setReplaying] = useState(false)
  const [siderailSection, setSiderailSection] = useState<SiderailSection>('lineage')

  const toggleSection = (key: SiderailSection) =>
    setSiderailSection((prev) => (prev === key ? null : key))

  const handleReplay = async (stepIndex: number) => {
    setReplaying(true)
    try {
      const newRun = await replayRun(runId, stepIndex)
      navigate(deploymentId ? deploymentRunRoute(deploymentId, newRun.id) : runsRoute(newRun.id))
    } catch {
      // Toast handles the error
    } finally {
      setReplaying(false)
    }
  }

  const childRuns = useMemo(() => lineage?.child_runs ?? [], [lineage])

  useEffect(() => {
    // Only auto-manage selection for step-based timelines (non-automation runs)
    if (childRuns.length > 0) return
    if (steps.length === 0) {
      setSelectedStepId('')
      return
    }
    if (!steps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(steps[steps.length - 1].id)
    }
  }, [selectedStepId, steps, childRuns.length])

  const isActive = ['pending', 'queued', 'running'].includes(run?.status ?? '')
  const { timeline: liveTimeline, phase: livePhase, connected: liveConnected } = useDeploymentTimelineAdapter(isActive ? run?.id ?? null : null)

  // Build timeline items from child runs for the at-rest (completed) view
  const completedTimeline = useMemo<TimelineItem[]>(() => {
    if (isActive || childRuns.length === 0) return []
    return childRuns.map((child: Run): TimelineItem => {
      const nodeKey = (typeof child.composite_metadata?.node_key === 'string' ? child.composite_metadata.node_key : 'Unknown') as string
      const isSink = child.run_type === 'sink'
      const status = child.status === 'completed' ? 'complete' as const
        : child.status === 'failed' ? 'error' as const
        : 'running' as const

      if (isSink) {
        return {
          type: 'sink_execution',
          id: `sink-${child.id}`,
          node_key: nodeKey,
          sink_type: (typeof child.composite_metadata?.sink_type === 'string' ? child.composite_metadata.sink_type : 'unknown').replace(/_/g, ' '),
          status,
          output_preview: typeof child.output_payload?.output === 'string' ? child.output_payload.output.slice(0, 300) : undefined,
          error: child.error_message ?? undefined,
        } satisfies SinkExecutionTimelineItem
      }
      return {
        type: 'node_execution',
        id: `node-${child.id}`,
        node_key: nodeKey,
        node_type: 'agent',
        agent_name: typeof child.composite_metadata?.agent_slug === 'string' ? child.composite_metadata.agent_slug : undefined,
        child_run_id: child.id,
        status,
        output_preview: typeof child.output_payload?.output === 'string' ? child.output_payload.output.slice(0, 300) : undefined,
        error: child.error_message ?? undefined,
        duration_ms: getDurationMs(child.started_at, child.completed_at),
        children: [],
      } satisfies NodeExecutionTimelineItem
    })
  }, [isActive, childRuns])

  // Use live timeline during active runs, completed timeline at rest
  const displayTimeline = isActive ? liveTimeline : completedTimeline
  const displayPhase = isActive ? livePhase : (run?.status === 'completed' ? 'complete' as const : run?.status === 'failed' ? 'error' as const : 'idle' as const)

  if (isLoading) return <LoadingState label="Loading run detail..." />
  if (error || !run) return <ErrorState message="Run detail could not be loaded." />

  const selectedStep = steps.find((step) => step.id === selectedStepId) ?? null
  const durationMs = getDurationMs(run.started_at, run.completed_at)
  const latestEvents = [...events].slice(-6).reverse()
  const agentSlug = typeof run.composite_metadata?.agent_slug === 'string' ? run.composite_metadata.agent_slug : null
  const agentId = typeof run.composite_metadata?.agent_id === 'string' ? run.composite_metadata.agent_id : null

  return (
    <div className="flex h-full gap-4 p-6 overflow-hidden">
      {/* Main content */}
      <div className="flex flex-1 flex-col gap-6 min-w-0 overflow-y-auto min-h-0">
        {/* Back link */}
        <Link
          to={deploymentId ? deploymentsRoute(deploymentId) : runsRoute()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          {deploymentId ? 'Back to Deployment' : 'Back to Runs'}
        </Link>

        {/* Header */}
        <div className="rounded-2xl border border-border/25 bg-card/35 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Play className="h-6 w-6 text-accent flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">
                    Run {truncateText(run.id, 12)}
                  </h1>
                  <StatusBadge status={run.status} />
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {agentSlug && (
                    <span className="text-xs text-muted-foreground/80">{agentSlug}</span>
                  )}
                  {agentId && (
                    <Link
                      to={agentsRoute(agentId)}
                      className="text-xs text-accent hover:text-accent/80 transition"
                    >
                      View agent
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Status cards */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Status', value: <StatusBadge status={run.status} />, icon: <Waypoints className="h-4 w-4" /> },
            { label: 'Run type', value: run.run_type === 'sink' ? `sink \u00b7 ${(String(run.composite_metadata?.sink_type || '')).replace(/_/g, ' ')}` : run.run_type, icon: <GitBranch className="h-4 w-4" /> },
            { label: 'Duration', value: durationMs !== null ? formatDuration(durationMs) : 'Not started', icon: <Timer className="h-4 w-4" /> },
            { label: 'Started', value: run.started_at ? formatDateTime(run.started_at) : 'Not started', icon: <Clock className="h-4 w-4" /> },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-border/25 bg-card/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">{item.label}</p>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-accent/20 bg-accent/15 text-accent">
                  {item.icon}
                </div>
              </div>
              <div className="mt-2 text-sm font-medium text-foreground">{item.value}</div>
            </div>
          ))}
        </div>

        {/* Error */}
        {run.error_message && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-medium">{run.error_code || 'Run failure'}</p>
                <p className="mt-1 text-red-100/85">{run.error_message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Output for completed runs */}
        {run.status === 'completed' && run.output_payload && Object.keys(run.output_payload).length > 0 && (
          <div className="rounded-2xl border border-border/25 bg-card/30 p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Output</h2>
            {typeof run.output_payload.output === 'string' ? (
              <pre className="whitespace-pre-wrap rounded-xl border border-border/25 bg-background/50 p-4 text-xs text-foreground/90">
                {run.output_payload.output}
              </pre>
            ) : (
              <pre className="overflow-x-auto rounded-xl border border-border/25 bg-background/50 p-4 text-xs text-foreground/90">
                {formatJson(run.output_payload)}
              </pre>
            )}
          </div>
        )}

        {/* Execution Timeline — unified for both live and completed runs */}
        {(displayTimeline.length > 0 || isActive) && (
          <div className="rounded-2xl border border-border/25 bg-background/50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/25 bg-card/30">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {isActive ? 'Live Execution' : 'Execution Timeline'}
              </span>
              {isActive && (
                <div className="flex items-center gap-1.5">
                  {liveConnected ? (
                    <>
                      <Wifi className="w-3 h-3 text-emerald-400" />
                      <span className="text-xs text-emerald-400">Connected</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3 text-amber-400" />
                      <span className="text-xs text-amber-400">Reconnecting...</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="p-4">
              {displayTimeline.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Loader2 className="w-5 h-5 text-muted-foreground/50 animate-spin mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground/60">Waiting for nodes to start...</p>
                  </div>
                </div>
              ) : (
                <ExecutionTimeline
                  items={displayTimeline}
                  phase={displayPhase}
                  connected={isActive ? liveConnected : undefined}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Siderail */}
      <Siderail
        storageKey="openforge.run.detail.pct"
        collapsedStorageKey="openforge.run.detail.collapsed"
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
                <p className="text-xs text-muted-foreground/90">Run details and lineage.</p>
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
              {/* Lineage */}
              <AccordionSection
                title="Lineage"
                summary={`${childRuns.length} child run${childRuns.length !== 1 ? 's' : ''}`}
                icon={GitBranch}
                expanded={siderailSection === 'lineage'}
                onToggle={() => toggleSection('lineage')}
              >
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground/80">Parent:</span>{' '}
                    {lineage?.parent_run ? (
                      <Link className="text-accent hover:text-accent/80 transition" to={deploymentId ? deploymentRunRoute(deploymentId, lineage.parent_run.id) : runsRoute(lineage.parent_run.id)}>
                        {truncateText(lineage.parent_run.id, 14)}
                      </Link>
                    ) : 'Root run'}
                  </div>
                  {childRuns.length > 0 && (
                    <div className="space-y-1">
                      <span className="font-medium text-foreground/80">Children:</span>
                      {childRuns.map((child: Run) => (
                        <div key={child.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/20 bg-background/50 px-2 py-1.5">
                          <div className="flex items-center gap-1.5 truncate">
                            {child.run_type === 'sink' && <span className="h-1.5 w-1.5 rounded-full bg-purple-400 flex-shrink-0" />}
                            <Link className="text-accent hover:text-accent/80 transition truncate" to={deploymentId ? deploymentRunRoute(deploymentId, child.id) : runsRoute(child.id)}>
                              {child.run_type === 'sink' ? String(child.composite_metadata?.sink_type || '').replace(/_/g, ' ') || truncateText(child.id, 12) : truncateText(child.id, 12)}
                            </Link>
                          </div>
                          <StatusBadge status={child.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionSection>

              {/* Checkpoints */}
              <AccordionSection
                title="Checkpoints"
                summary={`${checkpoints.length} checkpoint${checkpoints.length !== 1 ? 's' : ''}`}
                icon={Clock}
                expanded={siderailSection === 'checkpoints'}
                onToggle={() => toggleSection('checkpoints')}
              >
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {checkpoints.length === 0 ? (
                    <p className="italic">No checkpoints persisted.</p>
                  ) : checkpoints.map((cp) => (
                    <div key={cp.id} className="rounded-lg border border-border/20 bg-background/50 px-2 py-1.5">
                      <p className="font-medium text-foreground/80">{cp.checkpoint_type}</p>
                      <p className="text-[10px]">{cp.created_at ? formatDateTime(cp.created_at) : '—'}</p>
                    </div>
                  ))}
                </div>
              </AccordionSection>

              {/* Recent events */}
              <AccordionSection
                title="Events"
                summary={`${events.length} event${events.length !== 1 ? 's' : ''}`}
                icon={Waypoints}
                expanded={siderailSection === 'events'}
                onToggle={() => toggleSection('events')}
              >
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {latestEvents.length === 0 ? (
                    <p className="italic">No events recorded.</p>
                  ) : latestEvents.map((event: RuntimeEvent) => (
                    <div key={event.id} className="rounded-lg border border-border/20 bg-background/50 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-foreground/80 truncate">{event.event_type}</p>
                        {event.node_key && <span className="text-[10px] truncate">{event.node_key}</span>}
                      </div>
                      <p className="text-[10px]">{event.created_at ? formatDateTime(event.created_at) : '—'}</p>
                    </div>
                  ))}
                </div>
              </AccordionSection>
            </div>
          </div>
        )}
      </Siderail>
    </div>
  )
}
