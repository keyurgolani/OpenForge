import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Cog, Play, Pause, Zap, List, Activity, Settings } from 'lucide-react'

import ErrorState from '@/components/shared/ErrorState'
import LiveTerminalLog from '@/components/shared/LiveTerminalLog'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import {
  useAutomationQuery,
  useUpdateAutomation,
  useCompileAutomation,
  usePauseAutomation,
  useResumeAutomation,
  useActivateAutomation,
  useRunAutomation,
} from '@/features/automations'
import { useRunsQuery } from '@/features/runs'
import { formatDateTime, formatRelativeTime, truncateText } from '@/lib/formatters'
import { automationsRoute, agentsRoute, runsRoute } from '@/lib/routes'

type Tab = 'overview' | 'config' | 'runs' | 'activity'

export default function AutomationDetailPage() {
  const { automationId = '' } = useParams<{ automationId: string }>()
  const { data: automation, isLoading, error } = useAutomationQuery(automationId)
  const updateAutomation = useUpdateAutomation()
  const compileAutomation = useCompileAutomation()
  const pauseAutomation = usePauseAutomation()
  const resumeAutomation = useResumeAutomation()
  const activateAutomation = useActivateAutomation()
  const runAutomation = useRunAutomation()
  const { data: runsData } = useRunsQuery({ limit: 20 })

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [triggerDraft, setTriggerDraft] = useState<string | null>(null)
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null)
  const [outputDraft, setOutputDraft] = useState<string | null>(null)

  if (isLoading) return <LoadingState label="Loading automation..." />
  if (error || !automation) return <ErrorState message="Automation could not be loaded." />

  const runs = (runsData?.runs ?? []).filter(r =>
    r.composite_metadata?.automation_id === automationId
  )

  const handleSaveConfig = async () => {
    const updates: Record<string, unknown> = {}
    if (triggerDraft !== null) {
      try { updates.trigger_config = JSON.parse(triggerDraft) } catch { return }
    }
    if (budgetDraft !== null) {
      try { updates.budget_config = JSON.parse(budgetDraft) } catch { return }
    }
    if (outputDraft !== null) {
      try { updates.output_config = JSON.parse(outputDraft) } catch { return }
    }
    await updateAutomation.mutateAsync({ id: automationId, data: updates })
    setTriggerDraft(null)
    setBudgetDraft(null)
    setOutputDraft(null)
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Zap className="w-4 h-4" /> },
    { id: 'config', label: 'Config', icon: <Settings className="w-4 h-4" /> },
    { id: 'runs', label: 'Runs', icon: <List className="w-4 h-4" /> },
    { id: 'activity', label: 'Activity', icon: <Activity className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={automation.name}
        description={automation.description ?? `Automation ${automation.slug}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={automationsRoute()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 text-sm text-muted-foreground transition hover:text-foreground"
              onClick={() => compileAutomation.mutate(automationId)}
              disabled={compileAutomation.isPending}
            >
              <Cog className="h-4 w-4" />
              {compileAutomation.isPending ? 'Compiling...' : 'Compile'}
            </button>
            {automation.status === 'active' && (
              <button
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-sm text-amber-400 transition hover:bg-amber-500/20"
                onClick={() => pauseAutomation.mutate(automationId)}
              >
                <Pause className="h-4 w-4" /> Pause
              </button>
            )}
            {automation.status === 'paused' && (
              <button
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm text-emerald-400 transition hover:bg-emerald-500/20"
                onClick={() => resumeAutomation.mutate(automationId)}
              >
                <Play className="h-4 w-4" /> Resume
              </button>
            )}
            {automation.status === 'draft' && (
              <button
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent text-accent-foreground px-3 text-sm font-semibold transition hover:bg-accent/90"
                onClick={() => activateAutomation.mutate(automationId)}
              >
                <Zap className="h-4 w-4" /> Activate
              </button>
            )}
          </div>
        }
      />

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={automation.status} />
        <StatusBadge status={automation.health_status} />
        {automation.compilation_status && (
          <span className={`text-xs ${automation.compilation_status === 'success' ? 'text-emerald-400' : automation.compilation_status === 'error' ? 'text-red-400' : 'text-muted-foreground'}`}>
            Compilation: {automation.compilation_status}
          </span>
        )}
        {automation.tags.length > 0 && automation.tags.map(tag => (
          <span key={tag} className="chip-muted text-xs">{tag}</span>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/40">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition border-b-2 ${
              activeTab === tab.id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            { label: 'Name', value: automation.name },
            { label: 'Slug', value: automation.slug },
            { label: 'Status', value: automation.status },
            { label: 'Health', value: automation.health_status },
            { label: 'Agent', value: automation.agent_id.slice(0, 12) + '...', link: agentsRoute(automation.agent_id) },
            { label: 'Last Run', value: automation.last_run_at ? formatRelativeTime(automation.last_run_at) : 'Never' },
            { label: 'Last Success', value: automation.last_success_at ? formatRelativeTime(automation.last_success_at) : 'None' },
            { label: 'Last Failure', value: automation.last_failure_at ? formatRelativeTime(automation.last_failure_at) : 'None' },
            { label: 'Last Triggered', value: automation.last_triggered_at ? formatRelativeTime(automation.last_triggered_at) : 'Never' },
            { label: 'Created', value: formatDateTime(automation.created_at) },
            { label: 'Updated', value: formatDateTime(automation.updated_at) },
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-border/60 bg-background/35 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">{item.label}</p>
              {'link' in item && item.link ? (
                <Link to={item.link} className="mt-1 text-sm font-medium text-accent hover:text-accent/80 transition">{item.value}</Link>
              ) : (
                <p className="mt-1 text-sm font-medium text-foreground capitalize">{item.value}</p>
              )}
            </div>
          ))}
          {automation.compilation_error && (
            <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
              <p className="font-medium">Compilation Error</p>
              <p className="mt-1 text-red-100/85">{automation.compilation_error}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'config' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Edit automation configuration (JSON)</p>
            {(triggerDraft !== null || budgetDraft !== null || outputDraft !== null) && (
              <button
                className="bg-accent text-accent-foreground hover:bg-accent/90 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                onClick={handleSaveConfig}
                disabled={updateAutomation.isPending}
              >
                {updateAutomation.isPending ? 'Saving...' : 'Save All'}
              </button>
            )}
          </div>
          {[
            { label: 'Trigger Config', value: automation.trigger_config, draft: triggerDraft, setDraft: setTriggerDraft },
            { label: 'Budget Config', value: automation.budget_config, draft: budgetDraft, setDraft: setBudgetDraft },
            { label: 'Output Config', value: automation.output_config, draft: outputDraft, setDraft: setOutputDraft },
          ].map(({ label, value, draft, setDraft }) => (
            <div key={label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">{label}</p>
              <textarea
                className="w-full min-h-[150px] rounded-xl border border-border/60 bg-background/50 p-4 font-mono text-xs text-foreground/90 resize-y focus:outline-none focus:border-accent/40"
                value={draft ?? JSON.stringify(value, null, 2)}
                onChange={e => setDraft(e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      {activeTab === 'runs' && (
        <div className="space-y-3">
          {runs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 p-6 text-sm text-muted-foreground/80">
              No runs found for this automation.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/30">
              <table className="min-w-full divide-y divide-border/60">
                <thead className="bg-background/35">
                  <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground/75">
                    <th className="px-4 py-3 font-medium">Run</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Started</th>
                    <th className="px-4 py-3 font-medium">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {runs.map(run => (
                    <tr key={run.id} className="text-sm text-foreground">
                      <td className="px-4 py-3">
                        <Link className="font-medium transition hover:text-accent" to={runsRoute(run.id)}>
                          {truncateText(run.id, 18)}
                        </Link>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground/90">
                        {run.started_at ? formatDateTime(run.started_at) : 'Not started'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground/90">
                        {run.completed_at ? formatDateTime(run.completed_at) : 'In progress'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <AutomationActivityTab automationId={automationId} />
      )}
    </div>
  )
}

function AutomationActivityTab({ automationId }: { automationId: string }) {
  const { data: runsData, isLoading } = useRunsQuery({ automationId, limit: 1 })
  const latestRun = runsData?.runs?.[0]

  if (isLoading) return <LoadingState label="Loading activity..." />

  if (!latestRun) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 p-6 text-sm text-muted-foreground/80">
        No runs found for this automation. Run this automation to see activity here.
      </div>
    )
  }

  if (latestRun.status === 'running' || latestRun.status === 'pending') {
    return (
      <div className="h-[500px]">
        <LiveTerminalLog runId={latestRun.id} />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/20 p-6 text-sm text-muted-foreground/80 space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-foreground font-medium">Latest run:</span>
        <a href={runsRoute(latestRun.id)} className="text-accent hover:text-accent/80 transition font-mono text-xs">
          {latestRun.id.slice(0, 12)}...
        </a>
        <StatusBadge status={latestRun.status} />
      </div>
      <p>No active run. Trigger the automation to see live output.</p>
    </div>
  )
}
