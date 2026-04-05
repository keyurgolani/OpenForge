import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Bot,
  ChevronRight,
  Clock,
  Database,
  FileText,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Target,
  Upload,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react'

import AccordionSection from '@/components/agents/sections/AccordionSection'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import ErrorState from '@/components/shared/ErrorState'
import { ExecutionTimeline } from '@/components/shared/execution-timeline'
import LoadingState from '@/components/shared/LoadingState'
import Siderail from '@/components/shared/Siderail'
import StatusBadge from '@/components/shared/StatusBadge'
import { useMissionTimelineAdapter } from '@/hooks/timeline/useMissionTimelineAdapter'
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
import { formatRelativeTime, formatDuration } from '@/lib/formatters'

type SiderailSection = 'workspace' | 'budget' | 'rubric' | 'termination' | 'directives' | 'constraints' | null

export default function MissionDetailPage() {
  const { missionId } = useParams<{ missionId: string }>()
  const { data: mission, isLoading, error } = useMissionQuery(missionId)
  const { data: cyclesData } = useMissionCyclesQuery(missionId, { limit: 50 })
  const activateMission = useActivateMission()
  const pauseMission = usePauseMission()
  const terminateMission = useTerminateMission()
  const updateMission = useUpdateMission()
  const promoteWorkspace = usePromoteMissionWorkspace()

  const ownedWsId = mission?.owned_workspace_id
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

  // Inline editing state
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const toggleSection = (key: SiderailSection) =>
    setSiderailSection(prev => (prev === key ? null : key))

  // These must be above early returns to avoid breaking React hooks ordering
  const cycles = cyclesData?.cycles ?? []
  const isActive = mission?.status === 'active'
  const { timeline: missionTimeline, phase: missionPhase, connected: missionConnected } = useMissionTimelineAdapter(
    isActive ? missionId ?? null : null,
    cycles,
  )
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

  const cadenceLabel = mission.cadence?.interval_seconds
    ? `Every ${formatDuration(mission.cadence.interval_seconds * 1000)}`
    : '--'

  return (
    <div className="flex h-full gap-4 p-6 overflow-hidden" data-debug-mission={mission.id}>
      {/* Main content */}
      <div className="flex flex-1 flex-col gap-6 min-w-0 overflow-y-auto min-h-0">
        {/* Header card — matches agent page pattern */}
        <div className="rounded-2xl border border-border/25 bg-card/35 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <Target className="h-6 w-6 text-accent flex-shrink-0" />
                <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">
                  {mission.name ?? `Mission ${mission.id.slice(0, 8)}`}
                </h1>
                <StatusBadge status={mission.status} />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {(mission.status === 'draft' || mission.status === 'paused') && (
                <button
                  onClick={() => activateMission.mutate(mission.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-600/90"
                >
                  <Play className="w-3.5 h-3.5" /> Activate
                </button>
              )}
              {mission.status === 'active' && (
                <button
                  onClick={() => pauseMission.mutate(mission.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Pause className="w-3.5 h-3.5" /> Pause
                </button>
              )}
              {mission.status !== 'terminated' && mission.status !== 'completed' && (
                <button
                  onClick={() => setTerminateOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-medium text-red-400 transition-colors hover:text-red-300 hover:bg-red-500/20"
                >
                  <XCircle className="w-3.5 h-3.5" /> Terminate
                </button>
              )}
              <Link
                to={missionsRoute()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Link>
            </div>
          </div>

          {/* Goal below title, inside the same card */}
          <div className="mt-3">
            {editingField === 'goal' ? (
              <textarea
                className="w-full rounded-lg border border-accent/50 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none resize-none"
                rows={2}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitInlineEdit('goal')}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) commitInlineEdit('goal') }}
                autoFocus
              />
            ) : (
              <p
                className={`text-sm text-muted-foreground leading-relaxed ${isEditable ? 'cursor-pointer hover:text-foreground transition' : ''}`}
                onClick={() => startInlineEdit('goal', mission.goal ?? '')}
              >
                {mission.goal || 'No goal set'}
              </p>
            )}
          </div>
        </div>

        {/* Compact metadata row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground px-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs uppercase tracking-wider text-muted-foreground/60">Status</span>
            <StatusBadge status={mission.status} />
          </div>
          <div className="flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span>{agentName || 'No agent'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span>{cadenceLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span>{mission.cycle_count ?? 0} / {budget.max_cycles ?? '\u221E'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span>{mission.created_at ? formatRelativeTime(mission.created_at) : '--'}</span>
          </div>
        </div>

        {/* Cycle Timeline */}
        <div className="rounded-2xl border border-border/25 bg-card/30 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">Cycle Timeline</h2>
              <span className="text-xs text-muted-foreground/70">({cycles.length})</span>
            </div>
            {isActive && (
              <div className="flex items-center gap-1.5">
                {missionConnected ? (
                  <>
                    <Wifi className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] text-emerald-400">Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] text-amber-400">Connecting...</span>
                  </>
                )}
              </div>
            )}
          </div>

          {missionTimeline.length > 0 ? (
            <ExecutionTimeline
              items={missionTimeline}
              phase={missionPhase}
              connected={missionConnected}
            />
          ) : (
            <p className="text-xs text-muted-foreground/60 text-center py-6">
              No cycles yet. Activate the mission to begin.
            </p>
          )}
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
                summary={ownedWorkspace ? `${ownedWorkspace.knowledge_count ?? 0} items` : (mission.owned_workspace_id ? 'Linked' : 'None')}
                icon={Database}
                expanded={siderailSection === 'workspace'}
                onToggle={() => toggleSection('workspace')}
              >
                <div className="space-y-2 text-xs text-muted-foreground">
                  {mission.owned_workspace_id ? (
                    <>
                      {ownedWorkspace?.knowledge_count != null && (
                        <p className="text-foreground/70 font-medium">
                          {ownedWorkspace.knowledge_count} knowledge item{ownedWorkspace.knowledge_count === 1 ? '' : 's'}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/w/${mission.owned_workspace_id}/knowledge`}
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

              {/* Directives */}
              {(mission.directives?.length > 0 || isEditable) && (
                <AccordionSection
                  title="Directives"
                  summary={mission.directives?.length > 0 ? `${mission.directives.length} directive${mission.directives.length !== 1 ? 's' : ''}` : 'None'}
                  icon={FileText}
                  expanded={siderailSection === 'directives'}
                  onToggle={() => toggleSection('directives')}
                >
                  <div className="text-xs text-muted-foreground">
                    {mission.directives?.length > 0 ? (
                      <ul className="space-y-1">
                        {mission.directives.map((d: string, i: number) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-accent/60 flex-shrink-0">{i + 1}.</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground/50">No directives defined.</p>
                    )}
                  </div>
                </AccordionSection>
              )}

              {/* Constraints */}
              {(mission.constraints?.length > 0 || isEditable) && (
                <AccordionSection
                  title="Constraints"
                  summary={mission.constraints?.length > 0 ? `${mission.constraints.length} constraint${mission.constraints.length !== 1 ? 's' : ''}` : 'None'}
                  icon={Settings}
                  expanded={siderailSection === 'constraints'}
                  onToggle={() => toggleSection('constraints')}
                >
                  <div className="text-xs text-muted-foreground">
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
                            <li key={i} className="flex items-start gap-2">
                              <SeverityBadge severity={severity} />
                              <span>{label}</span>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground/50">No constraints defined.</p>
                    )}
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

