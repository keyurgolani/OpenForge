import { AlertTriangle, BarChart3, Cpu, DollarSign, Loader2, Wrench } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card'
import Section from '@/components/shared/Section'
import { formatDateTime, formatNumber } from '@/lib/formatters'
import { useRunFailuresQuery, useRunUsageQuery } from './hooks'

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

interface RunTelemetryPanelProps {
  runId: string
}

export default function RunTelemetryPanel({ runId }: RunTelemetryPanelProps) {
  const { data: usage, isLoading: usageLoading } = useRunUsageQuery(runId)
  const { data: failuresData, isLoading: failuresLoading } = useRunFailuresQuery(runId)

  const isLoading = usageLoading || failuresLoading
  const failures = failuresData?.items ?? []
  const modelEntries = usage ? Object.entries(usage.model_breakdown) : []
  const toolEntries = usage ? Object.entries(usage.tool_breakdown) : []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!usage) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-6 text-sm text-muted-foreground/80">
        No telemetry data available for this run.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Section title="Token and cost summary" description="Aggregated token usage and cost for this run.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Input tokens', value: formatNumber(usage.total_input_tokens), icon: <Cpu className="h-4 w-4" /> },
            { label: 'Output tokens', value: formatNumber(usage.total_output_tokens), icon: <Cpu className="h-4 w-4" /> },
            { label: 'Reasoning tokens', value: formatNumber(usage.total_reasoning_tokens), icon: <Cpu className="h-4 w-4" /> },
            { label: 'Total cost', value: formatCost(usage.total_cost_usd), icon: <DollarSign className="h-4 w-4" /> },
            { label: 'Total tokens', value: formatNumber(usage.total_tokens), icon: <BarChart3 className="h-4 w-4" /> },
            { label: 'LLM calls', value: formatNumber(usage.total_llm_calls), icon: <Cpu className="h-4 w-4" /> },
            { label: 'Tool calls', value: formatNumber(usage.total_tool_calls), icon: <Wrench className="h-4 w-4" /> },
            { label: 'Avg latency', value: usage.avg_latency_ms !== null ? `${usage.avg_latency_ms.toFixed(0)}ms` : 'N/A', icon: <BarChart3 className="h-4 w-4" /> },
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

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Model breakdown" description="Per-model token and cost distribution.">
          <Card glass>
            <CardContent className="space-y-2 pt-6">
              {modelEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground/80">
                  No model usage recorded.
                </div>
              ) : modelEntries.map(([model, stats]) => (
                <div key={model} className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-foreground">{model}</p>
                    <span className="text-xs text-muted-foreground/80">{formatCost(stats.cost)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    {formatNumber(stats.requests)} requests -- {formatNumber(stats.tokens)} tokens
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </Section>

        <Section title="Tool breakdown" description="Per-tool invocation counts and latency.">
          <Card glass>
            <CardContent className="space-y-2 pt-6">
              {toolEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground/80">
                  No tool usage recorded.
                </div>
              ) : toolEntries.map(([tool, stats]) => (
                <div key={tool} className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-foreground">{tool}</p>
                    <span className="text-xs text-muted-foreground/80">{stats.avg_latency_ms.toFixed(0)}ms avg</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    {formatNumber(stats.invocations)} invocations -- {stats.failures} failures
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </Section>
      </div>

      <Section title="Failures" description="Failure events recorded during this run.">
        <Card glass>
          <CardHeader>
            <CardTitle as="h2">Failure events ({failures.length})</CardTitle>
            <CardDescription>Classified failures with severity and retryability annotations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {failures.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-4 text-sm text-muted-foreground/80">
                No failures recorded for this run.
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
