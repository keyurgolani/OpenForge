import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gauge, Loader2, Play, Save, Search, Shield, SlidersHorizontal } from 'lucide-react'

import { listPolicies, simulatePolicy, updateToolPolicy } from '@/lib/api'
import type { PolicyRecord, PolicySimulationResult } from '@/types/trust'

const RISK_OPTIONS = [
  'harmless_read_only',
  'retrieval_search',
  'local_mutation',
  'external_mutation',
  'sensitive_data_access',
  'network_exfiltration_risk',
  'destructive',
]

function parseLines(value: string) {
  return value.split('\n').map((entry) => entry.trim()).filter(Boolean)
}

export default function PolicyManagementPanel() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [allowedDraft, setAllowedDraft] = useState('')
  const [blockedDraft, setBlockedDraft] = useState('')
  const [approvalDraft, setApprovalDraft] = useState('')
  const [rateLimitsDraft, setRateLimitsDraft] = useState('{}')
  const [defaultAction, setDefaultAction] = useState('allow')
  const [editorError, setEditorError] = useState<string | null>(null)
  const [simulation, setSimulation] = useState<PolicySimulationResult | null>(null)
  const [simulationError, setSimulationError] = useState<string | null>(null)
  const [simulationForm, setSimulationForm] = useState({
    tool_name: 'shell.execute',
    risk_category: 'external_mutation',
    workspace_id: '',
    profile_id: '',
    workflow_id: '',
    mission_id: '',
    run_id: 'preview-run',
  })

  const { data, isLoading } = useQuery<{ policies: PolicyRecord[]; total: number }>({
    queryKey: ['policies'],
    queryFn: () => listPolicies({ limit: 200 }),
  })

  const policies = data?.policies ?? []
  const filteredPolicies = policies.filter((policy) => {
    const haystack = `${policy.name} ${policy.policy_kind} ${policy.scope_type} ${policy.scope_id ?? ''}`.toLowerCase()
    return haystack.includes(search.toLowerCase())
  })
  const selectedPolicy = filteredPolicies.find((policy) => policy.id === selectedId) ?? filteredPolicies[0] ?? null
  const editable = selectedPolicy?.policy_kind === 'tool'

  useEffect(() => {
    if (!selectedPolicy) return
    setSelectedId(selectedPolicy.id)
    setAllowedDraft((selectedPolicy.allowed_tools ?? []).join('\n'))
    setBlockedDraft((selectedPolicy.blocked_tools ?? []).join('\n'))
    setApprovalDraft((selectedPolicy.approval_required_tools ?? []).join('\n'))
    setRateLimitsDraft(JSON.stringify(selectedPolicy.rate_limits ?? {}, null, 2))
    setDefaultAction(selectedPolicy.default_action ?? 'allow')
    setEditorError(null)
  }, [selectedPolicy?.id])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPolicy || !editable) return
      let rateLimits
      try {
        rateLimits = JSON.parse(rateLimitsDraft)
      } catch {
        throw new Error('Rate limits must be valid JSON.')
      }
      return updateToolPolicy(selectedPolicy.id, {
        default_action: defaultAction,
        allowed_tools: parseLines(allowedDraft),
        blocked_tools: parseLines(blockedDraft),
        approval_required_tools: parseLines(approvalDraft),
        rate_limits: rateLimits,
      })
    },
    onSuccess: async () => {
      setEditorError(null)
      await qc.invalidateQueries({ queryKey: ['policies'] })
    },
    onError: (error: Error) => {
      setEditorError(error.message)
    },
  })

  const simulateMutation = useMutation({
    mutationFn: () =>
      simulatePolicy({
        tool_name: simulationForm.tool_name,
        risk_category: simulationForm.risk_category,
        scope_context: {
          workspace_id: simulationForm.workspace_id || null,
          profile_id: simulationForm.profile_id || null,
          workflow_id: simulationForm.workflow_id || null,
          mission_id: simulationForm.mission_id || null,
        },
        run_id: simulationForm.run_id || null,
      }),
    onSuccess: (result: PolicySimulationResult) => {
      setSimulationError(null)
      setSimulation(result)
    },
    onError: (error: Error) => {
      setSimulation(null)
      setSimulationError(error.message)
    },
  })

  return (
    <div className="space-y-5">
      <div className="glass-card rounded-2xl border-accent/20 bg-accent/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
            <Shield className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Policy Controls</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Inspect the active policy set, edit tool-policy controls, and simulate how the evaluator will treat a requested action.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px,minmax(0,1fr)]">
        <section className="glass-card rounded-2xl p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input pl-9 text-sm"
              placeholder="Search policies..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="mt-4 space-y-2">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && filteredPolicies.length === 0 && (
              <div className="rounded-xl border border-border/40 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground">
                No policies matched this search.
              </div>
            )}
            {filteredPolicies.map((policy) => {
              const active = policy.id === selectedPolicy?.id
              return (
                <button
                  key={policy.id}
                  type="button"
                  onClick={() => setSelectedId(policy.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                    active
                      ? 'border-accent/35 bg-accent/10'
                      : 'border-border/40 bg-background/20 hover:border-border/70 hover:bg-background/35'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{policy.name}</p>
                      <p className="text-[11px] text-muted-foreground">{policy.scope_type}:{policy.scope_id ?? 'system'}</p>
                    </div>
                    <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {policy.policy_kind}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                    <span className="rounded-full bg-muted/40 px-2 py-0.5">{policy.status}</span>
                    <span className="rounded-full bg-muted/40 px-2 py-0.5">{policy.rule_count} rules</span>
                    <span className="rounded-full bg-muted/40 px-2 py-0.5">{policy.affected_tools.length} tools</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="space-y-5">
          {!selectedPolicy && (
            <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
              Select a policy to review its scope, tool controls, and default decision behavior.
            </div>
          )}

          {selectedPolicy && (
            <>
              <div className="glass-card rounded-2xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{selectedPolicy.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{selectedPolicy.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-border/50 px-2.5 py-1 text-muted-foreground">{selectedPolicy.scope_type}:{selectedPolicy.scope_id ?? 'system'}</span>
                    <span className="rounded-full border border-border/50 px-2.5 py-1 text-muted-foreground">{selectedPolicy.policy_kind}</span>
                    <span className="rounded-full border border-border/50 px-2.5 py-1 text-muted-foreground">{selectedPolicy.default_action ?? 'n/a'}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr),360px]">
                <div className="space-y-5">
                  <div className="glass-card rounded-2xl p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-foreground">Policy Editor</h4>
                      {editable && (
                        <button
                          type="button"
                          className="btn-primary gap-2 text-xs"
                          onClick={() => saveMutation.mutate()}
                          disabled={saveMutation.isPending}
                        >
                          {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save Policy
                        </button>
                      )}
                    </div>

                    {!editable && (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-border/40 bg-background/20 px-4 py-4 text-sm text-muted-foreground">
                          This policy kind is visible for inspection in Phase 3. Editing is currently focused on tool policies because that is where enforcement, approval routing, and rate limits are active.
                        </div>
                        {selectedPolicy.rules && selectedPolicy.rules.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">Policy rules</p>
                            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-border/40 bg-background/20 p-3 text-xs text-foreground">
                              {JSON.stringify(selectedPolicy.rules, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    {editable && (
                      <div className="space-y-4">
                        <label className="block text-xs font-medium text-muted-foreground">
                          Default action
                          <select className="input mt-1 text-sm" value={defaultAction} onChange={(event) => setDefaultAction(event.target.value)}>
                            <option value="allow">allow</option>
                            <option value="deny">deny</option>
                            <option value="requires_approval">requires_approval</option>
                          </select>
                        </label>
                        <label className="block text-xs font-medium text-muted-foreground">
                          Allowed tools
                          <textarea className="mt-1 min-h-[100px] w-full rounded-xl border border-border/50 bg-background/20 px-3 py-3 font-mono text-xs text-foreground" value={allowedDraft} onChange={(event) => setAllowedDraft(event.target.value)} />
                        </label>
                        <label className="block text-xs font-medium text-muted-foreground">
                          Blocked tools
                          <textarea className="mt-1 min-h-[100px] w-full rounded-xl border border-border/50 bg-background/20 px-3 py-3 font-mono text-xs text-foreground" value={blockedDraft} onChange={(event) => setBlockedDraft(event.target.value)} />
                        </label>
                        <label className="block text-xs font-medium text-muted-foreground">
                          Approval-required tools
                          <textarea className="mt-1 min-h-[100px] w-full rounded-xl border border-border/50 bg-background/20 px-3 py-3 font-mono text-xs text-foreground" value={approvalDraft} onChange={(event) => setApprovalDraft(event.target.value)} />
                        </label>
                        <label className="block text-xs font-medium text-muted-foreground">
                          Rate limits
                          <textarea className="mt-1 min-h-[160px] w-full rounded-xl border border-border/50 bg-background/20 px-3 py-3 font-mono text-xs text-foreground" value={rateLimitsDraft} onChange={(event) => setRateLimitsDraft(event.target.value)} />
                        </label>
                        {editorError && <p className="text-xs text-red-400">{editorError}</p>}
                      </div>
                    )}
                    {editable && selectedPolicy.rules && selectedPolicy.rules.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">Explicit rules</p>
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-border/40 bg-background/20 p-3 text-xs text-foreground">
                          {JSON.stringify(selectedPolicy.rules, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="glass-card rounded-2xl p-5">
                    <div className="mb-3 flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-accent" />
                      <h4 className="text-sm font-semibold text-foreground">Policy Simulation</h4>
                    </div>
                    <div className="space-y-3">
                      <input className="input text-sm" placeholder="Tool name" value={simulationForm.tool_name} onChange={(event) => setSimulationForm((current) => ({ ...current, tool_name: event.target.value }))} />
                      <select className="input text-sm" value={simulationForm.risk_category} onChange={(event) => setSimulationForm((current) => ({ ...current, risk_category: event.target.value }))}>
                        {RISK_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <input className="input text-sm" placeholder="Workspace ID (optional)" value={simulationForm.workspace_id} onChange={(event) => setSimulationForm((current) => ({ ...current, workspace_id: event.target.value }))} />
                      <input className="input text-sm" placeholder="Profile ID (optional)" value={simulationForm.profile_id} onChange={(event) => setSimulationForm((current) => ({ ...current, profile_id: event.target.value }))} />
                      <input className="input text-sm" placeholder="Workflow ID (optional)" value={simulationForm.workflow_id} onChange={(event) => setSimulationForm((current) => ({ ...current, workflow_id: event.target.value }))} />
                      <input className="input text-sm" placeholder="Mission ID (optional)" value={simulationForm.mission_id} onChange={(event) => setSimulationForm((current) => ({ ...current, mission_id: event.target.value }))} />
                      <input className="input text-sm" placeholder="Run ID (optional)" value={simulationForm.run_id} onChange={(event) => setSimulationForm((current) => ({ ...current, run_id: event.target.value }))} />
                      <button type="button" className="btn-primary w-full justify-center gap-2 text-xs" onClick={() => simulateMutation.mutate()} disabled={simulateMutation.isPending}>
                        {simulateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        Simulate
                      </button>
                    </div>
                    {simulationError && <p className="mt-3 text-xs text-red-400">{simulationError}</p>}
                    {simulation && (
                      <div className="mt-4 space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <SlidersHorizontal className="h-4 w-4 text-accent" />
                          Decision: {simulation.decision}
                        </div>
                        <dl className="space-y-2 text-xs text-muted-foreground">
                          <div>
                            <dt className="font-medium text-foreground">Matched scope</dt>
                            <dd>{simulation.matched_policy_scope ?? 'default risk policy'}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-foreground">Reason</dt>
                            <dd>{simulation.reason_text}</dd>
                          </div>
                          {simulation.rate_limit_state && Object.keys(simulation.rate_limit_state).length > 0 && (
                            <div>
                              <dt className="font-medium text-foreground">Rate limit state</dt>
                              <dd className="whitespace-pre-wrap font-mono">{JSON.stringify(simulation.rate_limit_state, null, 2)}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
