import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, FileOutput, GitBranch, PauseCircle, RotateCcw, Timer, Waypoints } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import Section from '@/components/shared/Section'
import StatusBadge from '@/components/shared/StatusBadge'
import {
  useRunCheckpointsQuery,
  useRunCompositeDebugQuery,
  useRunEventsQuery,
  useRunLineageQuery,
  useRunQuery,
  useRunStepsQuery,
} from '@/features/runs'
import { formatDateTime, formatDuration, truncateText } from '@/lib/formatters'
import { replayRun } from '@/lib/api'
import { agentsRoute, outputsRoute, runsRoute } from '@/lib/routes'
import type { Run, RuntimeEvent } from '@/types/runs'

function formatJson(value: unknown): string {
  const normalized = value ?? {}
  return JSON.stringify(normalized, null, 2)
}

function getDurationMs(startedAt?: string | null, completedAt?: string | null): number | null {
  if (!startedAt) {
    return null
  }
  const startMs = new Date(startedAt).getTime()
  const endMs = completedAt ? new Date(completedAt).getTime() : Date.now()
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return null
  }
  return Math.max(endMs - startMs, 0)
}

function collectArtifactIds(events: RuntimeEvent[]): string[] {
  const ids = new Set<string>()
  for (const event of events) {
    if (event.event_type !== 'artifact_emitted') {
      continue
    }
    const payloadIds = Array.isArray(event.payload.artifact_ids) ? event.payload.artifact_ids : []
    for (const rawId of payloadIds) {
      if (typeof rawId === 'string') {
        ids.add(rawId)
      }
    }
  }
  return [...ids]
}

export function groupRunsByJoinGroup(runs: Run[]): Array<{ joinGroupId: string; runs: Run[] }> {
  const grouped = new Map<string, Run[]>()
  for (const run of runs) {
    if (!run.join_group_id) {
      continue
    }
    const existing = grouped.get(run.join_group_id) ?? []
    existing.push(run)
    grouped.set(run.join_group_id, existing)
  }
  return [...grouped.entries()].map(([joinGroupId, branchRuns]) => ({ joinGroupId, runs: branchRuns }))
}

export default function RunDetailPage() {
  const { runId = '' } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const { data: run, isLoading, error } = useRunQuery(runId)
  const { data: stepsData } = useRunStepsQuery(runId)
  const { data: lineage } = useRunLineageQuery(runId)
  const { data: compositeDebug } = useRunCompositeDebugQuery(runId)
  const { data: checkpointsData } = useRunCheckpointsQuery(runId)
  const { data: eventsData } = useRunEventsQuery(runId)
  const steps = useMemo(() => stepsData?.steps ?? [], [stepsData])
  const checkpoints = checkpointsData?.checkpoints ?? []
  const events = eventsData?.events ?? []
  const [selectedStepId, setSelectedStepId] = useState<string>('')
  const [replaying, setReplaying] = useState(false)

  const handleReplay = async (stepIndex: number) => {
    setReplaying(true)
    try {
      const newRun = await replayRun(runId, stepIndex)
      navigate(runsRoute(newRun.id))
    } catch {
      // Toast will handle the error via interceptor
    } finally {
      setReplaying(false)
    }
  }

  useEffect(() => {
    if (steps.length === 0) {
      setSelectedStepId('')
      return
    }
    if (!steps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(steps[steps.length - 1].id)
    }
  }, [selectedStepId, steps])

  if (isLoading) {
    return <LoadingState label="Loading run detail…" />
  }

  if (error || !run) {
    return <ErrorState message="Run detail could not be loaded from the canonical runtime APIs." />
  }

  const selectedStep = steps.find((step) => step.id === selectedStepId) ?? null
  const durationMs = getDurationMs(run.started_at, run.completed_at)
  const childRuns = lineage?.child_runs ?? []
  const groupedChildRuns = groupRunsByJoinGroup(childRuns)
  const approvalEvents = events.filter((event) => event.event_type === 'approval_requested' || event.event_type === 'run_interrupted')
  const artifactIds = collectArtifactIds(events)
  const latestEvents = [...events].slice(-8).reverse()

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={`Run ${truncateText(run.id, 16)}`}
        description="Inspect durable execution state, follow step lineage, and review interrupts, checkpoints, and emitted outputs."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={runsRoute()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Runs
            </Link>
            {typeof run.composite_metadata?.agent_id === 'string' ? (
              <Link
                to={agentsRoute(run.composite_metadata.agent_id as string)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 text-sm text-muted-foreground transition hover:text-foreground"
              >
                <GitBranch className="h-4 w-4" />
                Agent
              </Link>
            ) : null}
          </div>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Status', value: <StatusBadge status={run.status} />, icon: <Waypoints className="h-4 w-4" /> },
          { label: 'Run type', value: <span className="text-foreground">{run.run_type}</span>, icon: <GitBranch className="h-4 w-4" /> },
          { label: 'Current node', value: <span className="text-foreground">{run.current_node_id ? truncateText(run.current_node_id, 18) : 'None'}</span>, icon: <PauseCircle className="h-4 w-4" /> },
          { label: 'Duration', value: <span className="text-foreground">{durationMs !== null ? formatDuration(durationMs) : 'Not started'}</span>, icon: <Timer className="h-4 w-4" /> },
          { label: 'Delegation mode', value: <span className="text-foreground">{run.delegation_mode ?? 'None'}</span>, icon: <GitBranch className="h-4 w-4" /> },
          { label: 'Join group', value: <span className="text-foreground">{run.join_group_id ?? 'None'}</span>, icon: <PauseCircle className="h-4 w-4" /> },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/60 bg-card/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">{item.label}</p>
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                {item.icon}
              </div>
            </div>
            <div className="mt-3 text-sm font-medium">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <Section title="Run summary" description="The top-level durable record that anchors steps, checkpoints, and child runs.">
          <Card glass padding="lg">
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Agent</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {typeof run.composite_metadata?.agent_slug === 'string' ? run.composite_metadata.agent_slug : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Strategy</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {typeof run.composite_metadata?.strategy === 'string' ? run.composite_metadata.strategy : 'Unspecified'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Started</p>
                <p className="mt-1 text-sm font-medium text-foreground">{run.started_at ? formatDateTime(run.started_at) : 'Not started'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Completed</p>
                <p className="mt-1 text-sm font-medium text-foreground">{run.completed_at ? formatDateTime(run.completed_at) : 'In progress'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Merge strategy</p>
                <p className="mt-1 text-sm font-medium text-foreground">{run.merge_strategy ?? 'None'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Composite pattern</p>
                <p className="mt-1 text-sm font-medium text-foreground">{typeof run.composite_metadata?.pattern === 'string' ? run.composite_metadata.pattern : 'None'}</p>
              </div>
              {run.error_message ? (
                <div className="md:col-span-2 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="font-medium">{run.error_code || 'Run failure'}</p>
                      <p className="mt-1 text-red-100/85">{run.error_message}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Section title="Step timeline" description="Ordered run steps make the execution path inspectable without backend spelunking.">
            <div className="space-y-3">
              {steps.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 p-6 text-sm text-muted-foreground/80">
                  This run does not have any persisted steps yet.
                </div>
              ) : steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setSelectedStepId(step.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    selectedStepId === step.id
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-border/60 bg-card/30 hover:border-border/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{step.node_key ?? step.node_id ?? 'Unknown step'}</p>
                      <p className="mt-1 text-xs text-muted-foreground/80">
                        Step {step.step_index} • started {step.started_at ? formatDateTime(step.started_at) : 'not recorded'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {step.checkpoint_id && (
                        <span
                          role="button"
                          tabIndex={0}
                          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[10px] text-muted-foreground transition hover:text-accent hover:border-accent/40"
                          onClick={(e) => { e.stopPropagation(); handleReplay(step.step_index) }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleReplay(step.step_index) } }}
                        >
                          <RotateCcw className="h-3 w-3" />
                          {replaying ? 'Replaying...' : 'Replay'}
                        </span>
                      )}
                      <StatusBadge status={step.status} />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground/85 sm:grid-cols-3">
                    <div>
                      <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Checkpoint</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{step.checkpoint_id ? truncateText(step.checkpoint_id, 14) : 'None'}</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Retry count</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{step.retry_count}</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Completed</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{step.completed_at ? formatDateTime(step.completed_at) : 'In progress'}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Section>
        </Section>

        <Section title="Selected step" description="Input and output snapshots stay visible so runtime state can be explained node by node.">
          <div className="space-y-4">
            <Card glass>
              <CardHeader>
                <CardTitle as="h2">{selectedStep?.node_key ?? 'No step selected'}</CardTitle>
                <CardDescription>
                  {selectedStep ? `Step ${selectedStep.step_index} with status ${selectedStep.status}.` : 'Choose a step from the timeline to inspect its snapshots and outcome.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedStep ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">Input snapshot</p>
                        <pre className="overflow-x-auto rounded-xl border border-border/60 bg-background/50 p-4 text-xs text-foreground/90">
                          {formatJson(selectedStep.input_snapshot)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">Output snapshot</p>
                        <pre className="overflow-x-auto rounded-xl border border-border/60 bg-background/50 p-4 text-xs text-foreground/90">
                          {formatJson(selectedStep.output_snapshot)}
                        </pre>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border/60 bg-background/35 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Delegation mode</p>
                        <p className="mt-1 text-sm font-medium text-foreground">{selectedStep.delegation_mode ?? 'None'}</p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/35 p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Join or merge</p>
                        <p className="mt-1 text-sm font-medium text-foreground">{selectedStep.join_group_id ?? selectedStep.merge_strategy ?? 'None'}</p>
                      </div>
                    </div>
                    {selectedStep.error_message ? (
                      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
                        <p className="font-medium">{selectedStep.error_code || 'Step failure'}</p>
                        <p className="mt-1 text-red-100/85">{selectedStep.error_message}</p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-6 text-sm text-muted-foreground/80">
                    No step has been selected.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card glass>
              <CardHeader>
                <CardTitle as="h2">Lineage</CardTitle>
                <CardDescription>Parent and child runs stay explicit so subworkflow execution can be followed.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-xl border border-border/60 bg-background/35 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Parent run</p>
                  <p className="mt-1 text-foreground">
                    {lineage?.parent_run ? (
                      <Link className="transition hover:text-accent" to={runsRoute(lineage.parent_run.id)}>
                        {truncateText(lineage.parent_run.id, 18)}
                      </Link>
                    ) : 'This run is a root run.'}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/35 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Child runs</p>
                  <div className="mt-2 space-y-2">
                    {childRuns.length === 0 ? (
                      <p className="text-muted-foreground/80">No child runs have been spawned.</p>
                    ) : childRuns.map((childRun) => (
                      <div key={childRun.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/50 px-3 py-2">
                        <Link className="transition hover:text-accent" to={runsRoute(childRun.id)}>
                          {truncateText(childRun.id, 18)}
                        </Link>
                        <StatusBadge status={childRun.status} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/35 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Branch groups</p>
                  <div className="mt-2 space-y-2">
                    {groupedChildRuns.length === 0 ? (
                      <p className="text-muted-foreground/80">No branch grouping recorded.</p>
                    ) : groupedChildRuns.map((group) => (
                      <div key={group.joinGroupId} className="rounded-lg border border-border/50 bg-background/50 px-3 py-2">
                        <p className="font-medium text-foreground">{group.joinGroupId}</p>
                        <p className="mt-1 text-xs text-muted-foreground/80">{group.runs.length} branch run{group.runs.length === 1 ? '' : 's'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Delegation timeline" description="Composite execution history should be understandable without reading raw runtime rows.">
          <Card glass>
            <CardContent className="space-y-3 pt-6">
              {(compositeDebug?.delegation_history ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground/80">
                  No delegation events recorded for this run.
                </div>
              ) : (compositeDebug?.delegation_history ?? []).map((entry, index) => (
                <div key={`${index}-${String(entry.delegation_mode)}`} className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
                  <p className="font-medium text-foreground">{String(entry.delegation_mode ?? 'unknown')}</p>
                  <p className="mt-1 text-xs text-muted-foreground/80">Join group: {String(entry.join_group_id ?? 'none')} • Merge: {String(entry.merge_strategy ?? 'none')}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </Section>

        <Section title="Branch groups and merge outcomes" description="Fan-out, join, and reduce behavior should stay visible to operators.">
          <div className="space-y-4">
            <Card glass>
              <CardHeader>
                <CardTitle as="h2">Branch groups</CardTitle>
                <CardDescription>Tracked join groups surfaced by the runtime inspection API.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(compositeDebug?.branch_groups ?? []).length === 0 ? (
                  <p className="text-muted-foreground/80">No branch groups recorded.</p>
                ) : (compositeDebug?.branch_groups ?? []).map((group, index) => (
                  <div key={`${index}-${String(group.join_group_id)}`} className="rounded-xl border border-border/60 bg-background/35 p-3">
                    <p className="font-medium text-foreground">{String(group.join_group_id)}</p>
                    <p className="mt-1 text-xs text-muted-foreground/80">Branches: {String(group.branch_count ?? (Array.isArray(group.runs) ? group.runs.length : 0))}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card glass>
              <CardHeader>
                <CardTitle as="h2">Merge outcomes</CardTitle>
                <CardDescription>Reducer or merge behavior applied to child outputs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(compositeDebug?.merge_outcomes ?? []).length === 0 ? (
                  <p className="text-muted-foreground/80">No merge outcomes recorded.</p>
                ) : (compositeDebug?.merge_outcomes ?? []).map((outcome, index) => (
                  <div key={`${index}-${String(outcome.strategy)}`} className="rounded-xl border border-border/60 bg-background/35 p-3">
                    <p className="font-medium text-foreground">{String(outcome.strategy ?? 'unknown')}</p>
                    <p className="mt-1 text-xs text-muted-foreground/80">Join group: {String(outcome.join_group_id ?? 'none')}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Interrupts and approvals" description="Approval blocks and runtime interrupts should be visible without reading raw logs.">
          <Card glass>
            <CardContent className="space-y-3 pt-6">
              {approvalEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground/80">
                  No approval or interrupt events recorded for this run.
                </div>
              ) : approvalEvents.map((event) => (
                <div key={event.id} className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{event.event_type}</p>
                      <p className="mt-1 text-xs text-muted-foreground/80">{event.created_at ? formatDateTime(event.created_at) : 'Timestamp unavailable'}</p>
                    </div>
                    <StatusBadge status={event.event_type === 'approval_requested' ? 'waiting_approval' : 'interrupted'} />
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-border/50 bg-background/60 p-3 text-xs text-foreground/90">
                    {formatJson(event.payload)}
                  </pre>
                </div>
              ))}
            </CardContent>
          </Card>
        </Section>

        <Section title="Checkpoints" description="Persisted snapshots mark safe inspection and resume boundaries.">
          <Card glass>
            <CardContent className="space-y-3 pt-6">
              {checkpoints.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground/80">
                  No checkpoints have been persisted for this run.
                </div>
              ) : checkpoints.map((checkpoint) => (
                <div key={checkpoint.id} className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{checkpoint.checkpoint_type}</p>
                      <p className="mt-1 text-xs text-muted-foreground/80">{checkpoint.created_at ? formatDateTime(checkpoint.created_at) : 'Timestamp unavailable'}</p>
                    </div>
                    <span className="text-xs text-muted-foreground/80">{checkpoint.step_id ? truncateText(checkpoint.step_id, 12) : 'Run-level'}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </Section>

        <Section title="Outputs and events" description="Output emission and runtime events feed later observability and operator UX.">
          <div className="space-y-4">
            <Card glass>
              <CardHeader>
                <CardTitle as="h2">Outputs</CardTitle>
                <CardDescription>Output IDs emitted by this run.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {artifactIds.length === 0 ? (
                  <p className="text-muted-foreground/80">No output emission recorded.</p>
                ) : artifactIds.map((artifactId) => (
                  <Link
                    key={artifactId}
                    className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/35 px-3 py-2 transition hover:border-accent/35 hover:text-accent"
                    to={outputsRoute(artifactId)}
                  >
                    <FileOutput className="h-4 w-4" />
                    {truncateText(artifactId, 20)}
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card glass>
              <CardHeader>
                <CardTitle as="h2">Recent events</CardTitle>
                <CardDescription>The latest persisted runtime events for this run.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {latestEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground/80">No runtime events persisted yet.</p>
                ) : latestEvents.map((event) => (
                  <div key={event.id} className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{event.event_type}</p>
                        <p className="mt-1 text-xs text-muted-foreground/80">{event.created_at ? formatDateTime(event.created_at) : 'Timestamp unavailable'}</p>
                      </div>
                      {event.node_key ? <span className="text-xs text-muted-foreground/80">{event.node_key}</span> : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </Section>
      </div>
    </div>
  )
}
