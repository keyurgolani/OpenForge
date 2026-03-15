import { useState } from 'react'
import { AlertTriangle, DollarSign, Flame, Loader2, ShieldCheck, TestTube2 } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card'
import PageHeader from '@/components/shared/PageHeader'
import Section from '@/components/shared/Section'
import StatusBadge from '@/components/shared/StatusBadge'
import { ApprovalInboxPanel } from '@/features/approvals'
import { useEvaluationRunsQuery } from '@/features/evaluation'
import { useCostHotspotsQuery, useFailureRollupQuery } from '@/features/observability'
import { formatDateTime, formatNumber } from '@/lib/formatters'

function formatCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(6)}`
  return `$${usd.toFixed(4)}`
}

function severityColor(severity: string | null): string {
  switch (severity) {
    case 'critical':
      return 'border-red-500/30 bg-red-500/10 text-red-300'
    case 'error':
      return 'border-red-500/20 bg-red-500/8 text-red-400'
    case 'warning':
      return 'border-amber-500/20 bg-amber-500/8 text-amber-400'
    default:
      return 'border-border/60 bg-background/35 text-muted-foreground'
  }
}

export default function OperatorDashboardPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()
  const [rollupGroupBy, setRollupGroupBy] = useState('failure_class')

  const { data: hotspotsData, isLoading: hotspotsLoading } = useCostHotspotsQuery(workspaceId)
  const { data: rollupData, isLoading: rollupLoading } = useFailureRollupQuery(workspaceId, rollupGroupBy)
  const { data: evalRunsData, isLoading: evalRunsLoading } = useEvaluationRunsQuery()

  const hotspots = hotspotsData?.items ?? []
  const rollupItems = rollupData?.items ?? []
  const evalRuns = evalRunsData?.items ?? []

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Operator Dashboard"
        description="Consolidated view of approvals, cost hotspots, failure patterns, and evaluation results for this workspace."
      />

      {/* Approval Inbox */}
      <Section title="Approval inbox" description="Pending approval requests requiring operator action.">
        <ApprovalInboxPanel />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Cost Hotspots */}
        <Section title="Cost hotspots" description="Objects with the highest token and cost consumption.">
          <Card glass>
            <CardHeader>
              <CardTitle as="h2">
                <span className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-amber-400" />
                  Top cost consumers
                </span>
              </CardTitle>
              <CardDescription>Ranked by total cost in USD.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {hotspotsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : hotspots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground/80">
                  No cost data available yet.
                </div>
              ) : hotspots.map((hotspot) => (
                <div key={`${hotspot.object_type}-${hotspot.object_id}`} className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{hotspot.object_name ?? hotspot.object_id}</p>
                      <p className="mt-1 text-xs text-muted-foreground/80">
                        {hotspot.object_type} -- {formatNumber(hotspot.request_count)} requests
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="flex items-center gap-1 font-medium text-foreground">
                        <DollarSign className="h-3.5 w-3.5 text-amber-400" />
                        {formatCost(hotspot.total_cost_usd)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/80">{formatNumber(hotspot.total_tokens)} tokens</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </Section>

        {/* Failure Rollup */}
        <Section title="Failure rollup" description="Aggregated failure patterns grouped for triage.">
          <Card glass>
            <CardHeader>
              <CardTitle as="h2">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  Failure patterns
                </span>
              </CardTitle>
              <CardDescription>
                <span className="flex items-center gap-2">
                  Group by:
                  <span className="flex gap-1 rounded-xl border border-border/40 bg-background/20 p-0.5">
                    {['failure_class', 'error_code', 'severity'].map((groupKey) => (
                      <button
                        key={groupKey}
                        type="button"
                        onClick={() => setRollupGroupBy(groupKey)}
                        className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                          rollupGroupBy === groupKey ? 'bg-accent/20 text-accent' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                      >
                        {groupKey.replace('_', ' ')}
                      </button>
                    ))}
                  </span>
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {rollupLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : rollupItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground/80">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    No failures recorded. All clear.
                  </div>
                </div>
              ) : rollupItems.map((item) => (
                <div key={item.group_key} className={`rounded-xl border p-3 text-sm ${severityColor(item.severity)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.group_key}</p>
                      <p className="mt-1 text-xs opacity-80">
                        {item.latest_at ? `Latest: ${formatDateTime(item.latest_at)}` : ''}
                        {item.retryability ? ` -- ${item.retryability.replace('_', ' ')}` : ''}
                      </p>
                    </div>
                    <span className="rounded-full border border-current/20 bg-current/5 px-2.5 py-1 text-xs font-semibold">
                      {item.count}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </Section>
      </div>

      {/* Evaluation Runs */}
      <Section title="Recent evaluation runs" description="Latest evaluation suite executions and their pass/fail results.">
        <Card glass>
          <CardHeader>
            <CardTitle as="h2">
              <span className="flex items-center gap-2">
                <TestTube2 className="h-4 w-4 text-accent" />
                Evaluation runs
              </span>
            </CardTitle>
            <CardDescription>Evaluation suite results showing scenario pass rates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {evalRunsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : evalRuns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground/80">
                No evaluation runs recorded yet.
              </div>
            ) : evalRuns.slice(0, 10).map((evalRun) => {
              const passRate = evalRun.scenario_count > 0
                ? ((evalRun.passed_count / evalRun.scenario_count) * 100).toFixed(1)
                : null

              return (
                <div key={evalRun.id} className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{evalRun.suite_name ?? 'Unnamed suite'}</p>
                      <p className="mt-1 text-xs text-muted-foreground/80">
                        {evalRun.scenario_count} scenarios -- {evalRun.created_at ? formatDateTime(evalRun.created_at) : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {passRate !== null ? (
                        <span className={`text-xs font-medium ${
                          Number(passRate) >= 90 ? 'text-emerald-400' :
                          Number(passRate) >= 70 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {passRate}% pass
                        </span>
                      ) : null}
                      <StatusBadge status={evalRun.status} />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground/80">
                    <span className="text-emerald-400">{evalRun.passed_count} passed</span>
                    <span className="text-red-400">{evalRun.failed_count} failed</span>
                    {evalRun.skipped_count > 0 ? <span>{evalRun.skipped_count} skipped</span> : null}
                    {evalRun.total_cost_usd !== null ? <span>Cost: {formatCost(evalRun.total_cost_usd)}</span> : null}
                    {evalRun.total_tokens > 0 ? <span>{formatNumber(evalRun.total_tokens)} tokens</span> : null}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </Section>
    </div>
  )
}
