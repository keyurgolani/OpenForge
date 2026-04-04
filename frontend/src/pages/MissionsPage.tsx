import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ChevronRight,
  Clock,
  Plus,
  RefreshCw,
  Target,
  X,
} from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import StatusBadge from '@/components/shared/StatusBadge'
import {
  useMissionsQuery,
  useCreateMission,
} from '@/features/missions'
import { useQuery } from '@tanstack/react-query'
import { listAgents } from '@/lib/api'
import { formatRelativeTime } from '@/lib/formatters'
import { missionsRoute } from '@/lib/routes'
import { useUIStore } from '@/stores/uiStore'

const STATUS_FILTERS: Array<{ label: string; value: string | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Draft', value: 'draft' },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Completed', value: 'completed' },
  { label: 'Terminated', value: 'terminated' },
]

// ── Creation Dialog ──

interface RubricCriterion {
  name: string
  description: string
  target: number
  ratchet: 'strict' | 'relaxed'
  weight: number
}

interface Constraint {
  text: string
  severity: 'critical' | 'high' | 'medium' | 'low'
}

interface MissionFormData {
  name: string
  goal: string
  agent_id: string
  directives: string[]
  constraints: Constraint[]
  rubric: RubricCriterion[]
  cadence_seconds: number | ''
  budget_cost_limit: number | ''
  budget_token_limit: number | ''
  budget_cycle_limit: number | ''
  termination_conditions: string[]
}

const EMPTY_FORM: MissionFormData = {
  name: '',
  goal: '',
  agent_id: '',
  directives: [],
  constraints: [],
  rubric: [],
  cadence_seconds: '',
  budget_cost_limit: '',
  budget_token_limit: '',
  budget_cycle_limit: '',
  termination_conditions: [],
}

function CreateMissionDialog({
  open,
  onClose,
  onCreate,
  isCreating,
}: {
  open: boolean
  onClose: () => void
  onCreate: (data: object) => void
  isCreating: boolean
}) {
  const [form, setForm] = useState<MissionFormData>(EMPTY_FORM)
  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => listAgents({ limit: 200 }),
    enabled: open,
  })
  const agents = agentsData?.agents ?? []

  useEffect(() => {
    if (open) setForm(EMPTY_FORM)
  }, [open])

  const handleSubmit = () => {
    const payload: Record<string, unknown> = {
      name: form.name,
      goal: form.goal,
      autonomous_agent_id: form.agent_id || undefined,
      directives: form.directives.filter(Boolean),
      constraints: form.constraints
        .filter(c => c.text.trim())
        .map(c => ({ description: c.text, severity: c.severity })),
      rubric: form.rubric
        .filter(r => r.name.trim())
        .map(r => ({
          name: r.name,
          description: r.description,
          target: r.target,
          ratchet: r.ratchet,
          weight: r.weight,
        })),
      termination_conditions: form.termination_conditions
        .filter(Boolean)
        .map(t => ({ condition: t, check: 'auto' })),
    }
    if (form.cadence_seconds !== '') payload.cadence = { interval_seconds: Number(form.cadence_seconds) }
    const budget: Record<string, number> = {}
    if (form.budget_cost_limit !== '') budget.max_cost = Number(form.budget_cost_limit)
    if (form.budget_token_limit !== '') budget.max_tokens = Number(form.budget_token_limit)
    if (form.budget_cycle_limit !== '') budget.max_cycles = Number(form.budget_cycle_limit)
    if (Object.keys(budget).length > 0) payload.budget = budget
    onCreate(payload)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border/25 bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">New Mission</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">Mission Name</label>
            <input
              className="mt-1 w-full rounded-lg border border-border/25 bg-background/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent/50"
              placeholder="e.g. AI Industry Pulse Monitor"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Goal */}
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">Goal</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-border/25 bg-background/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent/50 resize-none"
              rows={3}
              placeholder="Describe the mission goal..."
              value={form.goal}
              onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
            />
          </div>

          {/* Agent */}
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">Agent</label>
            <select
              className="mt-1 w-full rounded-lg border border-border/25 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/50"
              value={form.agent_id}
              onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
            >
              <option value="">Select an agent...</option>
              {agents.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Directives */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">Directives</label>
              <button
                onClick={() => setForm(f => ({ ...f, directives: [...f.directives, ''] }))}
                className="text-xs text-accent hover:text-accent/80 transition"
              >
                + Add
              </button>
            </div>
            <div className="mt-1 space-y-1.5">
              {form.directives.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-border/25 bg-background/40 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent/50"
                    placeholder="Directive..."
                    value={d}
                    onChange={e => {
                      const updated = [...form.directives]
                      updated[i] = e.target.value
                      setForm(f => ({ ...f, directives: updated }))
                    }}
                  />
                  <button
                    onClick={() => setForm(f => ({ ...f, directives: f.directives.filter((_, j) => j !== i) }))}
                    className="p-1 text-muted-foreground hover:text-red-400 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Constraints */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">Constraints</label>
              <button
                onClick={() => setForm(f => ({ ...f, constraints: [...f.constraints, { text: '', severity: 'medium' }] }))}
                className="text-xs text-accent hover:text-accent/80 transition"
              >
                + Add
              </button>
            </div>
            <div className="mt-1 space-y-1.5">
              {form.constraints.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-border/25 bg-background/40 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent/50"
                    placeholder="Constraint..."
                    value={c.text}
                    onChange={e => {
                      const updated = [...form.constraints]
                      updated[i] = { ...updated[i], text: e.target.value }
                      setForm(f => ({ ...f, constraints: updated }))
                    }}
                  />
                  <select
                    className="w-24 rounded-lg border border-border/25 bg-background/40 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent/50"
                    value={c.severity}
                    onChange={e => {
                      const updated = [...form.constraints]
                      updated[i] = { ...updated[i], severity: e.target.value as Constraint['severity'] }
                      setForm(f => ({ ...f, constraints: updated }))
                    }}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <button
                    onClick={() => setForm(f => ({ ...f, constraints: f.constraints.filter((_, j) => j !== i) }))}
                    className="p-1 text-muted-foreground hover:text-red-400 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Rubric */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">Rubric Criteria</label>
              <button
                onClick={() =>
                  setForm(f => ({
                    ...f,
                    rubric: [...f.rubric, { name: '', description: '', target: 0, ratchet: 'strict', weight: 1 }],
                  }))
                }
                className="text-xs text-accent hover:text-accent/80 transition"
              >
                + Add Criterion
              </button>
            </div>
            <div className="mt-1 space-y-3">
              {form.rubric.map((r, i) => (
                <div key={i} className="rounded-xl border border-border/25 bg-background/35 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <input
                      className="flex-1 rounded-lg border border-border/25 bg-background/40 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent/50"
                      placeholder="Criterion name"
                      value={r.name}
                      onChange={e => {
                        const updated = [...form.rubric]
                        updated[i] = { ...updated[i], name: e.target.value }
                        setForm(f => ({ ...f, rubric: updated }))
                      }}
                    />
                    <button
                      onClick={() => setForm(f => ({ ...f, rubric: f.rubric.filter((_, j) => j !== i) }))}
                      className="ml-2 p-1 text-muted-foreground hover:text-red-400 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    className="w-full rounded-lg border border-border/25 bg-background/40 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent/50"
                    placeholder="Description"
                    value={r.description}
                    onChange={e => {
                      const updated = [...form.rubric]
                      updated[i] = { ...updated[i], description: e.target.value }
                      setForm(f => ({ ...f, rubric: updated }))
                    }}
                  />
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground/60">Target</label>
                      <input
                        type="number"
                        className="w-full rounded-lg border border-border/25 bg-background/40 px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent/50"
                        value={r.target}
                        onChange={e => {
                          const updated = [...form.rubric]
                          updated[i] = { ...updated[i], target: Number(e.target.value) }
                          setForm(f => ({ ...f, rubric: updated }))
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground/60">Ratchet</label>
                      <select
                        className="w-full rounded-lg border border-border/25 bg-background/40 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent/50"
                        value={r.ratchet}
                        onChange={e => {
                          const updated = [...form.rubric]
                          updated[i] = { ...updated[i], ratchet: e.target.value as 'strict' | 'relaxed' }
                          setForm(f => ({ ...f, rubric: updated }))
                        }}
                      >
                        <option value="strict">Strict</option>
                        <option value="relaxed">Relaxed</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground/60">Weight: {r.weight}</label>
                      <input
                        type="range"
                        min={0}
                        max={5}
                        step={0.5}
                        className="w-full mt-1"
                        value={r.weight}
                        onChange={e => {
                          const updated = [...form.rubric]
                          updated[i] = { ...updated[i], weight: Number(e.target.value) }
                          setForm(f => ({ ...f, rubric: updated }))
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cadence */}
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">Cadence (interval seconds)</label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-border/25 bg-background/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent/50"
              placeholder="e.g., 3600"
              value={form.cadence_seconds}
              onChange={e => setForm(f => ({ ...f, cadence_seconds: e.target.value ? Number(e.target.value) : '' }))}
            />
          </div>

          {/* Budget */}
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">Budget</label>
            <div className="mt-1 grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground/60">Cost limit ($)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-lg border border-border/25 bg-background/40 px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent/50"
                  placeholder="--"
                  value={form.budget_cost_limit}
                  onChange={e => setForm(f => ({ ...f, budget_cost_limit: e.target.value ? Number(e.target.value) : '' }))}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground/60">Token limit</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-border/25 bg-background/40 px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent/50"
                  placeholder="--"
                  value={form.budget_token_limit}
                  onChange={e => setForm(f => ({ ...f, budget_token_limit: e.target.value ? Number(e.target.value) : '' }))}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground/60">Cycle limit</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-border/25 bg-background/40 px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-accent/50"
                  placeholder="--"
                  value={form.budget_cycle_limit}
                  onChange={e => setForm(f => ({ ...f, budget_cycle_limit: e.target.value ? Number(e.target.value) : '' }))}
                />
              </div>
            </div>
          </div>

          {/* Termination Conditions */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">Termination Conditions</label>
              <button
                onClick={() => setForm(f => ({ ...f, termination_conditions: [...f.termination_conditions, ''] }))}
                className="text-xs text-accent hover:text-accent/80 transition"
              >
                + Add
              </button>
            </div>
            <div className="mt-1 space-y-1.5">
              {form.termination_conditions.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-border/25 bg-background/40 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent/50"
                    placeholder="Condition..."
                    value={t}
                    onChange={e => {
                      const updated = [...form.termination_conditions]
                      updated[i] = e.target.value
                      setForm(f => ({ ...f, termination_conditions: updated }))
                    }}
                  />
                  <button
                    onClick={() => setForm(f => ({ ...f, termination_conditions: f.termination_conditions.filter((_, j) => j !== i) }))}
                    className="p-1 text-muted-foreground hover:text-red-400 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border/25">
          <button
            onClick={onClose}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.goal.trim() || isCreating}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create Mission'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──

export default function MissionsPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const { data, isLoading, error } = useMissionsQuery({ status: statusFilter })
  const createMission = useCreateMission()
  const setHeaderActions = useUIStore(s => s.setHeaderActions)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    setHeaderActions(null)
    return () => setHeaderActions(null)
  }, [setHeaderActions])

  if (error) return <ErrorState message="Failed to load missions" />

  const missions = data?.missions ?? []

  return (
    <div className="space-y-6 p-6">
      {/* Top bar: filter tabs + create button */}
      <div className="flex items-center justify-between gap-4">
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
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90"
        >
          <Plus className="w-3.5 h-3.5" /> New Mission
        </button>
      </div>

      {isLoading ? (
        <LoadingState label="Loading missions..." />
      ) : missions.length === 0 ? (
        <EmptyState
          title="No missions yet"
          description="Create a mission to define an ongoing objective for an agent to pursue across multiple cycles."
          actionLabel="Create Mission"
          onAction={() => setCreateOpen(true)}
          icon={<Target className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {missions.map((m: any) => (
            <MissionCard key={m.id} mission={m} />
          ))}
        </div>
      )}

      <CreateMissionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(data) => {
          createMission.mutate(data, {
            onSuccess: (result) => {
              setCreateOpen(false)
              navigate(missionsRoute(result.id))
            },
          })
        }}
        isCreating={createMission.isPending}
      />
    </div>
  )
}

function MissionCard({ mission }: { mission: any }) {
  return (
    <Link
      to={missionsRoute(mission.id)}
      className="group flex flex-col rounded-2xl border border-border/25 bg-card/30 p-5 transition hover:bg-card/50 hover:border-border/40"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Target className="h-4 w-4 text-accent flex-shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">
            {mission.name ?? `Mission ${mission.id.slice(0, 8)}`}
          </h3>
        </div>
        <StatusBadge status={mission.status} />
      </div>

      {mission.goal && (
        <p className="text-xs text-muted-foreground/80 line-clamp-2 mb-3">
          {mission.goal}
        </p>
      )}

      <div className="mt-auto flex items-center gap-4 text-[11px] text-muted-foreground/70">
        <span className="inline-flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          {mission.cycle_count ?? 0} cycle{(mission.cycle_count ?? 0) === 1 ? '' : 's'}
        </span>
        {mission.last_cycle_at && (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(mission.last_cycle_at)}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end opacity-0 group-hover:opacity-100 transition">
        <span className="inline-flex items-center gap-1 text-xs text-accent">
          View <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  )
}
