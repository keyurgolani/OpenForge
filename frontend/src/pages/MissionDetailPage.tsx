import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Clock,
  Database,
  FileText,
  Pause,
  Play,
  Settings,
  Target,
  Upload,
  XCircle,
} from 'lucide-react'

import AccordionSection from '@/components/agents/sections/AccordionSection'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import Siderail from '@/components/shared/Siderail'
import StatusBadge from '@/components/shared/StatusBadge'
import {
  useMissionQuery,
  useMissionCyclesQuery,
  useActivateMission,
  usePauseMission,
  useTerminateMission,
  useUpdateMission,
  usePromoteMissionWorkspace,
} from '@/features/missions'
import { useQuery } from '@tanstack/react-query'
import { getWorkspace, listAgents } from '@/lib/api'
import { missionsRoute } from '@/lib/routes'
import { formatDateTime, formatRelativeTime, formatDuration } from '@/lib/formatters'

type SiderailSection = 'workspace' | 'budget' | 'rubric' | 'termination' | null

export default function MissionDetailPage() {
  const { missionId } = useParams<{ missionId: string }>()
  const navigate = useNavigate()
  const { data: mission, isLoading, error } = useMissionQuery(missionId)
  const { data: cyclesData } = useMissionCyclesQuery(missionId, { limit: 50 })
  const activateMission = useActivateMission()
  const pauseMission = usePauseMission()
  const terminateMission = useTerminateMission()
  const updateMission = useUpdateMission()
  const promoteWorkspace = usePromoteMissionWorkspace()

  const ownedWsId = mission?.workspace_id
  const { data: ownedWorkspace } = useQuery({
    queryKey: ['workspace', ownedWsId],
    queryFn: () => getWorkspace(ownedWsId!),
    enabled: !!ownedWsId,
  })

  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => listAgents({ limit: 200 }),
  })
  const agentName = useMemo((): string | null => {
    if (!mission?.autonomous_agent_id) return null
    const agents = agentsData?.agents ?? []
    if (!Array.isArray(agents)) return null
    const agent = agents.find((a: any) => a.id === mission.autonomous_agent_id)
    return agent?.name ?? agent?.slug ?? null
  }, [mission?.autonomous_agent_id, agentsData])

  const [terminateOpen, setTerminateOpen] = useState(false)
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [siderailSection, setSiderailSection] = useState<SiderailSection>('workspace')
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null)

  // Inline editing state
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const toggleSection = (key: SiderailSection) =>
    setSiderailSection(prev => (prev === key ? null : key))

  // These must be above early returns to avoid breaking React hooks ordering
  const cycles = cyclesData?.cycles ?? []
  const budget = mission?.budget ?? {}
  const rubric = mission?.rubric ?? []

  const latestScores: Record<string, number> = useMemo(() => {
    const completed = cycles.filter((c: any) => c.status === 'completed' && c.evaluation_scores)
    if (completed.length === 0) return {}
    const scores = completed[0].evaluation_scores ?? {}
    const safe: Record<string, number> = {}
    for (const [k, v] of Object.entries(scores)) {
      safe[k] = typeof v === 'number' ? v : Number(v) || 0
    }
    return safe
  }, [cycles])

  if (isLoading) return <LoadingState label="Loading mission..." />
  if (error || !mission) return <ErrorState message="Mission not found" />

  const isEditable = mission.status === 'draft' || mission.status === 'paused'

  const startInlineEdit = (field: string, currentValue: string) => {
    if (!isEditable) return
    setEditingField(field)
    setEditValue(currentValue)
  }

  const commitInlineEdit = (field: string) => {
    if (!missionId || editValue === '') {
      setEditingField(null)
      return
    }
    updateMission.mutate(
      { id: missionId, data: { [field]: editValue } },
      { onSuccess: () => setEditingField(null) },
    )
  }

  return (
    <div className="flex h-full gap-4 p-6 overflow-hidden" data-debug-mission={mission.id}>
      {/* Main content: left brief + center timeline */}
      <div className="flex flex-1 gap-4 min-w-0 overflow-hidden">
        {/* Left panel: Brief */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto min-h-0">
          {/* Back link */}
          <Link
            to={missionsRoute()}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            Missions
          </Link>

          {/* Header card */}
          <div className="rounded-2xl border border-border/25 bg-card/35 px-5 py-4">
            <div className="flex items-center gap-2.5 mb-3">
              <Target className="h-5 w-5 text-accent flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight text-foreground truncate">
                    {mission.name ?? `Mission ${mission.id.slice(0, 8)}`}
                  </h1>
                  <StatusBadge status={mission.status} />
                </div>
                <p className="text-xs text-muted-foreground/80 font-mono mt-0.5">{mission.id.slice(0, 8)}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {(mission.status === 'draft' || mission.status === 'paused') && (
                <button
                  onClick={() => activateMission.mutate(mission.id)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600/90"
                >
                  <Play className="w-3 h-3" /> Activate
                </button>
              )}
              {mission.status === 'active' && (
                <button
                  onClick={() => pauseMission.mutate(mission.id)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Pause className="w-3 h-3" /> Pause
                </button>
              )}
              {mission.status !== 'terminated' && mission.status !== 'completed' && (
                <button
                  onClick={() => setTerminateOpen(true)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 text-xs font-medium text-red-400 transition-colors hover:text-red-300 hover:bg-red-500/20"
                >
                  <XCircle className="w-3 h-3" /> Terminate
                </button>
              )}
            </div>
          </div>

          {/* Goal */}
          <div className="rounded-2xl border border-border/25 bg-card/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-3.5 h-3.5 text-accent" />
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-[0.12em]">Goal</h3>
            </div>
            {editingField === 'goal' ? (
              <div>
                <textarea
                  className="w-full rounded-lg border border-accent/50 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none resize-none"
                  rows={3}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => commitInlineEdit('goal')}
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) commitInlineEdit('goal') }}
                  autoFocus
                />
              </div>
            ) : (
              <p
                className={`text-sm text-muted-foreground/90 leading-relaxed ${isEditable ? 'cursor-pointer hover:text-foreground transition' : ''}`}
                onClick={() => startInlineEdit('goal', mission.goal ?? '')}
              >
                {mission.goal || '--'}
              </p>
            )}
          </div>

          {/* Directives */}
          {(mission.directives?.length > 0 || isEditable) && (
            <div className="rounded-2xl border border-border/25 bg-card/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-3.5 h-3.5 text-accent" />
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-[0.12em]">Directives</h3>
              </div>
              {mission.directives?.length > 0 ? (
                <ul className="space-y-1">
                  {mission.directives.map((d: string, i: number) => (
                    <li key={i} className="text-xs text-muted-foreground/80 flex gap-2">
                      <span className="text-accent/60 flex-shrink-0">{i + 1}.</span>
                      {d}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground/50">No directives defined.</p>
              )}
            </div>
          )}

          {/* Constraints */}
          {(mission.constraints?.length > 0 || isEditable) && (
            <div className="rounded-2xl border border-border/25 bg-card/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-3.5 h-3.5 text-accent" />
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-[0.12em]">Constraints</h3>
              </div>
              {mission.constraints?.length > 0 ? (
                <ul className="space-y-1.5">
                  {mission.constraints.map((c: any, i: number) => {
                    const severity = typeof c === 'object' && c !== null ? String(c.severity ?? 'medium') : 'medium'
                    const label = typeof c === 'string'
                      ? c
                      : typeof c === 'object' && c !== null
                        ? String(c.description ?? c.text ?? c.rule ?? JSON.stringify(c))
                        : String(c)
                    return (
                      <li key={i} className="text-xs text-muted-foreground/80 flex items-start gap-2">
                        <SeverityBadge severity={severity} />
                        <span>{label}</span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground/50">No constraints defined.</p>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="rounded-2xl border border-border/25 bg-card/30 p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground/70">Agent</span>
              <span className="text-foreground font-medium truncate ml-2">
                {agentName ?? mission.autonomous_agent_id?.slice(0, 8) ?? '--'}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground/70">Cadence</span>
              <span className="text-foreground font-medium">
                {mission.cadence?.interval_seconds
                  ? `Every ${formatDuration(mission.cadence.interval_seconds * 1000)}`
                  : '--'}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground/70">Cycles</span>
              <span className="text-foreground font-medium">
                {mission.cycle_count ?? 0}
                {budget.max_cycles != null && <span className="text-muted-foreground/50"> / {budget.max_cycles}</span>}
              </span>
            </div>
            {mission.last_cycle_at && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground/70">Last cycle</span>
                <span className="text-foreground font-medium">
                  {formatRelativeTime(mission.last_cycle_at)}
                </span>
              </div>
            )}
            {mission.next_cycle_at && mission.status === 'active' && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground/70">Next cycle</span>
                <span className="text-foreground font-medium">
                  {formatRelativeTime(mission.next_cycle_at)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground/70">Created</span>
              <span className="text-foreground font-medium">
                {mission.created_at ? formatRelativeTime(mission.created_at) : '--'}
              </span>
            </div>
          </div>
        </div>

        {/* Center panel: Cycle Timeline */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto min-h-0">
          <div className="rounded-2xl border border-border/25 bg-card/30 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">Cycle Timeline</h2>
              <span className="text-xs text-muted-foreground/70">({cycles.length})</span>
            </div>

            {cycles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/25 bg-card/20 p-6 text-sm text-muted-foreground/80 text-center">
                No cycles yet.{' '}
                {mission.status === 'draft' && 'Activate the mission to begin the first cycle.'}
                {mission.status === 'active' && 'The first cycle will start soon.'}
              </div>
            ) : (
              <div className="space-y-3">
                {cycles.map((cycle: any) => (
                  <CycleCard
                    key={cycle.id}
                    cycle={cycle}
                    isExpanded={expandedCycleId === cycle.id}
                    onToggle={() => setExpandedCycleId(prev => prev === cycle.id ? null : cycle.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right panel: Siderail */}
      <Siderail
        storageKey="openforge.mission.detail.pct"
        collapsedStorageKey="openforge.mission.detail.collapsed"
        icon={Settings}
        label="Context"
        breakpoint="lg"
      >
        {(onCollapse) => (
          <div className="flex h-full min-h-0 flex-col px-4">
            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold tracking-tight">Context</h3>
                </div>
                <p className="text-xs text-muted-foreground/90">Mission context and metrics.</p>
              </div>
              <button
                type="button"
                onClick={onCollapse}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border/70 bg-card/60 text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
                aria-label="Collapse context sidebar"
                title="Collapse context"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Sections */}
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-2">
              {/* Workspace */}
              <AccordionSection
                title="Workspace"
                summary={ownedWorkspace ? `${ownedWorkspace.knowledge_count ?? 0} items` : (mission.workspace_id ? 'Linked' : 'None')}
                icon={Database}
                expanded={siderailSection === 'workspace'}
                onToggle={() => toggleSection('workspace')}
              >
                <div className="space-y-2 text-xs text-muted-foreground">
                  {mission.workspace_id ? (
                    <>
                      {ownedWorkspace?.knowledge_count != null && (
                        <p className="text-foreground/70 font-medium">
                          {ownedWorkspace.knowledge_count} knowledge item{ownedWorkspace.knowledge_count === 1 ? '' : 's'}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/w/${mission.workspace_id}/knowledge`}
                          className="inline-flex h-6 items-center gap-1 rounded-md border border-border/25 bg-background/40 px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <BookOpen className="w-3 h-3" /> Browse Knowledge
                        </Link>
                        {mission.status !== 'terminated' && (
                          <button
                            onClick={() => setPromoteOpen(true)}
                            className="inline-flex h-6 items-center gap-1 rounded-md border border-border/25 bg-background/40 px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Upload className="w-3 h-3" /> Promote
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <p>No workspace linked to this mission.</p>
                  )}
                </div>
              </AccordionSection>

              {/* Budget */}
              <AccordionSection
                title="Budget"
                summary={budget.max_cost != null ? `$${(mission.cost_estimate ?? 0).toFixed(2)} / $${budget.max_cost}` : 'No limits'}
                icon={Settings}
                expanded={siderailSection === 'budget'}
                onToggle={() => toggleSection('budget')}
              >
                <div className="space-y-3 text-xs text-muted-foreground">
                  <BudgetRow
                    label="Cost"
                    current={mission.cost_estimate ?? 0}
                    limit={budget.max_cost}
                    format={(v: number) => `$${v.toFixed(2)}`}
                  />
                  <BudgetRow
                    label="Tokens"
                    current={mission.tokens_used ?? 0}
                    limit={budget.max_tokens}
                    format={(v: number) => v.toLocaleString()}
                  />
                  <BudgetRow
                    label="Cycles"
                    current={mission.cycle_count ?? 0}
                    limit={budget.max_cycles}
                    format={(v: number) => String(v)}
                  />
                </div>
              </AccordionSection>

              {/* Rubric */}
              {rubric.length > 0 && (
                <AccordionSection
                  title="Rubric"
                  summary={`${rubric.length} criteria`}
                  icon={Target}
                  expanded={siderailSection === 'rubric'}
                  onToggle={() => toggleSection('rubric')}
                >
                  <div className="space-y-2 text-xs text-muted-foreground">
                    {rubric.map((criterion: any, i: number) => {
                      const score = latestScores[criterion.name]
                      return (
                        <div key={i} className="flex justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium text-foreground/80 truncate block">{criterion.name}</span>
                            {criterion.description && (
                              <span className="text-[10px] text-muted-foreground/60 block truncate">{criterion.description}</span>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-foreground font-medium">
                              {score != null ? String(score) : '--'}
                            </span>
                            {criterion.target != null && (
                              <span className="text-muted-foreground/50"> / {criterion.target}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </AccordionSection>
              )}

              {/* Termination Conditions */}
              {mission.termination_conditions?.length > 0 && (
                <AccordionSection
                  title="Termination"
                  summary={`${mission.termination_conditions.length} condition${mission.termination_conditions.length !== 1 ? 's' : ''}`}
                  icon={XCircle}
                  expanded={siderailSection === 'termination'}
                  onToggle={() => toggleSection('termination')}
                >
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {mission.termination_conditions.map((tc: any, i: number) => {
                      const text = typeof tc === 'string'
                        ? tc
                        : typeof tc === 'object' && tc !== null
                          ? String(tc.condition ?? tc.description ?? JSON.stringify(tc))
                          : String(tc)
                      return (
                        <div key={i} className="flex gap-2">
                          <span className="text-muted-foreground/50 flex-shrink-0">{i + 1}.</span>
                          <span>{text}</span>
                        </div>
                      )
                    })}
                  </div>
                </AccordionSection>
              )}
            </div>
          </div>
        )}
      </Siderail>

      {/* Terminate Confirmation */}
      <ConfirmModal
        isOpen={terminateOpen}
        onClose={() => setTerminateOpen(false)}
        onConfirm={() => {
          terminateMission.mutate(mission.id, {
            onSuccess: () => {
              setTerminateOpen(false)
            },
          })
        }}
        title="Terminate Mission"
        message={`Are you sure you want to terminate "${mission.name ?? `Mission ${mission.id.slice(0, 8)}`}"? This will permanently stop all future cycles. This action cannot be undone.`}
        confirmLabel="Terminate"
        cancelLabel="Cancel"
        variant="danger"
        icon="warning"
        loading={terminateMission.isPending}
      />

      {/* Promote Workspace Confirmation */}
      <ConfirmModal
        isOpen={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        onConfirm={() => {
          promoteWorkspace.mutate(mission.id, {
            onSuccess: () => setPromoteOpen(false),
          })
        }}
        title="Promote to Regular Workspace"
        message="This will convert the mission's knowledge workspace into a regular user workspace. The knowledge will become editable, and the mission will no longer have a linked workspace."
        confirmLabel="Promote"
        cancelLabel="Cancel"
        variant="info"
        icon="info"
        loading={promoteWorkspace.isPending}
      />
    </div>
  )
}

// ── Helper Components ──

function SeverityBadge({ severity }: { severity: string }) {
  const colorMap: Record<string, string> = {
    critical: 'border-red-500/25 bg-red-500/10 text-red-300',
    high: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
    medium: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
    low: 'border-border/25 bg-muted/45 text-muted-foreground',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] flex-shrink-0 ${colorMap[severity] ?? colorMap.low}`}>
      {severity}
    </span>
  )
}

function BudgetRow({
  label,
  current,
  limit,
  format,
}: {
  label: string
  current?: number
  limit?: number
  format: (v: number) => string
}) {
  const pct = limit && current != null ? Math.min(100, (current / limit) * 100) : 0
  const colorClass = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-accent'

  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="font-medium text-foreground/80">{label}</span>
        <span>
          {current != null ? format(current) : '--'}
          {limit != null && <span className="text-muted-foreground/50"> / {format(limit)}</span>}
        </span>
      </div>
      {limit != null && (
        <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${colorClass}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

const OODA_PHASES = ['perceive', 'plan', 'act', 'evaluate', 'reflect'] as const

function CycleCard({
  cycle,
  isExpanded,
  onToggle,
}: {
  cycle: any
  isExpanded: boolean
  onToggle: () => void
}) {
  const [activePhase, setActivePhase] = useState<string>('act')

  const duration = useMemo(() => {
    if (!cycle.started_at) return null
    const start = new Date(cycle.started_at).getTime()
    const end = cycle.completed_at ? new Date(cycle.completed_at).getTime() : Date.now()
    return formatDuration(end - start)
  }, [cycle.started_at, cycle.completed_at])

  // Determine if we have structured phases vs raw_output fallback
  const phases = cycle.phase_summaries ?? {}
  const hasStructuredPhases = Object.keys(phases).length > 0 && !phases.raw_output
  const rawOutput: string | null = phases.raw_output
    ? (typeof phases.raw_output === 'string' ? phases.raw_output : JSON.stringify(phases.raw_output, null, 2))
    : null

  // Build a one-line summary
  const summary = useMemo(() => {
    if (hasStructuredPhases) {
      const perceive = typeof phases.perceive === 'string' ? phases.perceive : ''
      const act = typeof phases.act === 'string' ? phases.act : ''
      const combined = [perceive, act].filter(Boolean).join(' — ')
      return combined.length > 160 ? combined.slice(0, 157) + '...' : combined
    }
    if (rawOutput) {
      return rawOutput.length > 200 ? rawOutput.slice(0, 197) + '...' : rawOutput
    }
    return null
  }, [hasStructuredPhases, rawOutput, phases])

  const activePhaseText = useMemo(() => {
    if (!hasStructuredPhases) return null
    const val = phases[activePhase]
    if (!val) return null
    return typeof val === 'string' ? val : JSON.stringify(val, null, 2)
  }, [hasStructuredPhases, phases, activePhase])

  return (
    <div className="rounded-xl border border-border/25 bg-background/35 transition">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={cycle.status} />
          <span className="text-sm font-medium text-foreground">
            Cycle {cycle.cycle_number ?? '#'}
          </span>
          {cycle.phase && (
            <span className="text-xs text-muted-foreground/70 border border-border/25 bg-background/50 rounded-md px-1.5 py-0.5">
              {typeof cycle.phase === 'string' ? cycle.phase : String(cycle.phase)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {cycle.actions_log?.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60">
              {cycle.actions_log.length} action{cycle.actions_log.length === 1 ? '' : 's'}
            </span>
          )}
          {duration && (
            <span className="text-[10px] text-muted-foreground/60">{duration}</span>
          )}
          {cycle.started_at && (
            <span className="text-[10px] text-muted-foreground/50">
              {formatRelativeTime(cycle.started_at)}
            </span>
          )}
          <ChevronRight
            className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border/25 px-3 py-3 space-y-2.5">
          {/* 1. Summary row */}
          {summary && (
            <p className="text-xs text-muted-foreground/90 leading-relaxed line-clamp-2">{summary}</p>
          )}

          {/* 2. Score bars */}
          {cycle.evaluation_scores && Object.keys(cycle.evaluation_scores).length > 0 && (
            <div className="space-y-1.5">
              {Object.entries(cycle.evaluation_scores).map(([key, value]: [string, any]) => {
                if (typeof value !== 'number') return null
                const pct = Math.min(100, Math.max(0, value * 100))
                const barColor = value >= 0.7
                  ? 'bg-emerald-500'
                  : value >= 0.4
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground/70 truncate w-24 flex-shrink-0">{key}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-foreground font-medium w-7 text-right flex-shrink-0">{value}</span>
                  </div>
                )
              })}
              {cycle.ratchet_passed != null && (
                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${
                  cycle.ratchet_passed
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                    : 'border-red-500/25 bg-red-500/10 text-red-400'
                }`}>
                  Ratchet: {cycle.ratchet_passed ? 'Passed' : 'Failed'}
                </span>
              )}
            </div>
          )}

          {/* 3. OODA phase pills (structured only) */}
          {hasStructuredPhases && (
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                {OODA_PHASES.map((phase) => {
                  const hasContent = !!phases[phase]
                  const isActive = activePhase === phase
                  return (
                    <button
                      key={phase}
                      onClick={() => setActivePhase(phase)}
                      disabled={!hasContent}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-colors ${
                        isActive
                          ? 'bg-accent/20 text-accent border border-accent/40'
                          : hasContent
                            ? 'bg-muted/30 text-muted-foreground/80 border border-border/25 hover:text-foreground hover:border-border/50'
                            : 'bg-muted/10 text-muted-foreground/30 border border-border/15 cursor-default'
                      }`}
                    >
                      {phase}
                    </button>
                  )
                })}
              </div>
              {activePhaseText && (
                <div className="rounded-lg border border-border/25 bg-card/20 px-2.5 py-2 text-xs text-muted-foreground/80 leading-relaxed whitespace-pre-wrap max-h-[140px] overflow-y-auto">
                  {activePhaseText}
                </div>
              )}
            </div>
          )}

          {/* 6. Raw output fallback (no structured phases) */}
          {!hasStructuredPhases && rawOutput && (
            <div className="rounded-lg border-l-2 border-border/25 bg-muted/10 px-3 py-2 text-xs text-muted-foreground/70 leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {rawOutput}
            </div>
          )}

          {/* 4. Key Actions */}
          {cycle.actions_log?.length > 0 && (
            <div>
              <h4 className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium mb-1">Actions</h4>
              <ol className="space-y-0.5">
                {cycle.actions_log.map((action: any, i: number) => {
                  const label = typeof action === 'string'
                    ? action
                    : typeof action === 'object' && action !== null
                      ? String(action.action ?? action.description ?? JSON.stringify(action))
                      : String(action)
                  return (
                    <li key={i} className="text-[11px] text-muted-foreground/80 flex gap-1.5 leading-snug">
                      <span className="text-accent/50 flex-shrink-0">{i + 1}.</span>
                      <span className="truncate">{label}</span>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          {/* 5. Next cycle reason */}
          {cycle.next_cycle_reason && (
            <p className="text-[11px] text-muted-foreground/60 italic">{cycle.next_cycle_reason}</p>
          )}

          {/* Error */}
          {cycle.error_message && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-xs text-red-400">
              {cycle.error_message}
            </div>
          )}

          {/* Empty state */}
          {!hasStructuredPhases && !rawOutput && !cycle.evaluation_scores && !cycle.error_message && !cycle.actions_log?.length && (
            <p className="text-xs text-muted-foreground/50">No detailed data available for this cycle.</p>
          )}
        </div>
      )}
    </div>
  )
}
