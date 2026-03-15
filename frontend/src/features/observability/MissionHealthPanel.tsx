import { Activity, AlertTriangle, DollarSign, Heart, Loader2 } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card'
import Section from '@/components/shared/Section'
import StatusBadge from '@/components/shared/StatusBadge'
import { formatDateTime, formatNumber } from '@/lib/formatters'
import { useMissionFailuresQuery, useMissionUsageQuery } from './hooks'

function formatCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(6)}`
  return `$${usd.toFixed(4)}`
}

function severityColor(severity: string): string {
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

interface MissionHealthPanelProps {
  missionId: string
}

export default function MissionHealthPanel({ missionId }: MissionHealthPanelProps) {
  const { data: usage, isLoading: usageLoading } = useMissionUsageQuery(missionId)
  const { data: failuresData, isLoading: failuresLoading } = useMissionFailuresQuery(missionId)

  const isLoading = usageLoading || failuresLoading
  const failures = failuresData?.items ?? []
  const failureCount = failuresData?.count ?? 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasData = usage || failuresData

  if (!hasData) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-6 text-sm text-muted-foreground/80">
        No observability data available for this mission.
      </div>
    )
  }

  const healthLevel = failureCount === 0 ? 'healthy' : failureCount <= 3 ? 'degraded' : 'failing'

  return (
    <div className="space-y-6">
      <Section title="Mission health overview" description="Aggregated health and resource utilization for this mission.">
        <div className="glass-card rounded-2xl border-accent/20 bg-accent/5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
              <Heart className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-foreground">Health Status</h2>
                <StatusBadge status={healthLevel} />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {failureCount === 0
                  ? 'No failures recorded. Mission is operating normally.'
                  : `${failureCount} failure${failureCount === 1 ? '' : 's'} recorded. Review the failure details below for resolution guidance.`}
              </p>
            </div>
          </div>
        </div>
      </Section>

      {usage ? (
        <Section title="Usage summary" description="Token consumption and cost for this mission.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total tokens', value: formatNumber(usage.total_tokens), icon: <Activity className="h-4 w-4" /> },
              { label: 'Total cost', value: formatCost(usage.total_cost_usd), icon: <DollarSign className="h-4 w-4" /> },
              { label: 'LLM calls', value: formatNumber(usage.total_llm_calls), icon: <Activity className="h-4 w-4" /> },
              { label: 'Failures', value: String(usage.failure_count), icon: <AlertTriangle className="h-4 w-4" /> },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border/60 bg-card/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">{item.label}</p>
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                    {item.icon}
                  </div>
                </div>
                <div className="mt-3 text-sm font-medium text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Failure events" description="Classified failures associated with this mission.">
        <Card glass>
          <CardHeader>
            <CardTitle as="h2">Failures ({failureCount})</CardTitle>
            <CardDescription>Severity-ranked failure events for operator triage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {failures.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground/80">
                No failures recorded for this mission.
              </div>
            ) : failures.map((failure) => (
              <div key={failure.id} className={`rounded-xl border p-3 text-sm ${severityColor(failure.severity)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="font-medium">{failure.failure_class}</p>
                      <p className="mt-1 text-xs opacity-85">{failure.summary}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] uppercase tracking-wide">{failure.severity}</span>
                    <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] uppercase tracking-wide">{failure.retryability.replace('_', ' ')}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-75">
                  <span>Code: {failure.error_code}</span>
                  {failure.affected_node_key ? <span>Node: {failure.affected_node_key}</span> : null}
                  <span>{failure.created_at ? formatDateTime(failure.created_at) : ''}</span>
                  {failure.resolved ? <span className="text-emerald-400">Resolved</span> : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </Section>
    </div>
  )
}
