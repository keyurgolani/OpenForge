import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Play, Pause, Zap, Activity, Settings, Rocket, GitBranch, AlertTriangle, CheckCircle } from 'lucide-react'

import AutomationGraphEditor from '@/components/automations/AutomationGraphEditor'
import ErrorState from '@/components/shared/ErrorState'
import DynamicParameterForm from '@/components/shared/DynamicParameterForm'
import LiveTerminalLog from '@/components/shared/LiveTerminalLog'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import {
  useAutomationQuery,
  useUpdateAutomation,
  usePauseAutomation,
  useResumeAutomation,
  useActivateAutomation,
  useAutomationGraphQuery,
  useDeploymentSchemaQuery,
} from '@/features/automations'
import { useDeployAutomation, useDeploymentsQuery } from '@/features/deployments'
import { useAgentQuery } from '@/features/agents'
import { useRunsQuery } from '@/features/runs'
import { useWorkspaces } from '@/hooks/useWorkspace'
import { formatDateTime, formatRelativeTime } from '@/lib/formatters'
import { automationsRoute, agentsRoute, deploymentsRoute, runsRoute } from '@/lib/routes'
import type { ParameterDefinition } from '@/types/deployments'

type Tab = 'overview' | 'graph' | 'config' | 'deployments' | 'activity'

export default function AutomationDetailPage() {
  const { automationId = '' } = useParams<{ automationId: string }>()
  const { data: automation, isLoading, error } = useAutomationQuery(automationId)
  const updateAutomation = useUpdateAutomation()
  const pauseAutomation = usePauseAutomation()
  const resumeAutomation = useResumeAutomation()
  const activateAutomation = useActivateAutomation()
  const deployAutomation = useDeployAutomation()
  const { data: agentData, isLoading: isAgentLoading } = useAgentQuery(automation?.agent_id ?? undefined)
  const { data: workspaces } = useWorkspaces()
  const defaultWorkspaceId = (workspaces as { id: string }[] | undefined)?.[0]?.id
  const { data: deploymentsData } = useDeploymentsQuery({ automation_id: automationId })
  const { data: graphData } = useAutomationGraphQuery(automationId)
  const { data: deploySchemaData } = useDeploymentSchemaQuery(automationId)

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [triggerDraft, setTriggerDraft] = useState<string | null>(null)
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null)
  const [outputDraft, setOutputDraft] = useState<string | null>(null)
  const [showDeployDialog, setShowDeployDialog] = useState(false)
  const [deployInputValues, setDeployInputValues] = useState<Record<string, unknown>>({})
  const [deploySchedule, setDeploySchedule] = useState('')

  if (isLoading) return <LoadingState label="Loading automation..." />
  if (error || !automation) return <ErrorState message="Automation could not be loaded." />

  // Use deployment schema if available, fall back to agent's input_schema
  const deploymentSchema: ParameterDefinition[] = (deploySchemaData?.deployment_input_schema ?? []).map((item: Record<string, unknown>) => ({
    name: item.node_key ? `${item.node_key}.${item.input_key}` : item.input_key ?? item.name,
    type: item.type ?? 'text',
    label: item.label ?? item.input_key ?? item.name,
    description: item.description,
    required: item.required ?? true,
    default: item.default,
    options: item.options as string[] | undefined,
  })) as ParameterDefinition[]

  const inputSchema: ParameterDefinition[] = deploymentSchema

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
    { id: 'graph', label: 'Graph', icon: <GitBranch className="w-4 h-4" /> },
    { id: 'config', label: 'Config', icon: <Settings className="w-4 h-4" /> },
    { id: 'deployments', label: 'Deployments', icon: <Rocket className="w-4 h-4" /> },
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
            {automation.active_spec_id && defaultWorkspaceId && (
              <button
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 text-sm font-semibold transition hover:bg-emerald-600/90"
                onClick={() => {
                  // Pre-populate form values with schema defaults
                  const defaults: Record<string, unknown> = {}
                  for (const p of inputSchema) {
                    if (p.default !== undefined && p.default !== null) {
                      defaults[p.name] = p.default
                    }
                  }
                  setDeployInputValues(defaults)
                  setDeploySchedule(String(automation.trigger_config?.cron ?? ''))
                  setShowDeployDialog(true)
                }}
                disabled={deployAutomation.isPending}
              >
                <Rocket className="h-4 w-4" />
                {deployAutomation.isPending ? 'Deploying...' : 'Deploy'}
              </button>
            )}
          </div>
        }
      />

      {/* Compilation status banner */}
      {automation.compilation_status === 'failed' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Compilation failed</p>
            <p className="text-xs text-red-300/80 mt-0.5">{automation.compilation_error || 'The last save produced a compilation error. Update the configuration or graph and save again to retry.'}</p>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={automation.status} />
        <StatusBadge status={automation.health_status} />
        {automation.compilation_status && automation.compilation_status !== 'failed' && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5" /> Compiled
          </span>
        )}
        {automation.tags.length > 0 && automation.tags.map(tag => (
          <span key={tag} className="chip-muted text-xs">{tag}</span>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/60">
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
            ...(automation.graph_version > 0
              ? [{ label: 'Agents', value: `${graphData?.nodes?.length ?? '...'} node${(graphData?.nodes?.length ?? 0) !== 1 ? 's' : ''} (Graph v${automation.graph_version})` }]
              : automation.agent_id
                ? [{ label: 'Agent', value: isAgentLoading ? 'Loading...' : (agentData?.name ?? automation.agent_id.slice(0, 12) + '...'), link: agentsRoute(automation.agent_id) }]
                : []),
            { label: 'Graph Version', value: String(automation.graph_version ?? 0) },
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
        </div>
      )}

      {activeTab === 'graph' && (
        <AutomationGraphEditor automationId={automationId} graph={graphData ?? null} />
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

      {activeTab === 'deployments' && (
        <div className="space-y-3">
          {!deploymentsData?.deployments?.length ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 p-6 text-sm text-muted-foreground/80">
              No deployments yet. Deploy this automation to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {deploymentsData.deployments.map(d => (
                <Link
                  key={d.id}
                  to={deploymentsRoute(d.id)}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 p-3 hover:bg-card/60 transition"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge status={d.status} />
                    <span className="text-sm font-mono">{d.id.slice(0, 8)}</span>
                    {Object.keys(d.input_values).length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {Object.entries(d.input_values).slice(0, 3).map(([k, v]) => {
                          const dotIdx = k.indexOf('.')
                          const label = dotIdx > 0
                            ? k.slice(dotIdx + 1).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                            : k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                          return `${label}: ${String(v)}`
                        }).join(', ')}
                        {Object.keys(d.input_values).length > 3 && ` +${Object.keys(d.input_values).length - 3} more`}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {d.created_at ? formatRelativeTime(d.created_at) : ''}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <AutomationActivityTab automationId={automationId} />
      )}

      {/* Deploy dialog */}
      {showDeployDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border/60 bg-background p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Deploy {automation.name}</h3>
            {inputSchema.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground">Configure the deployment inputs.</p>
                <DynamicParameterForm
                  schema={inputSchema}
                  values={deployInputValues}
                  onChange={setDeployInputValues}
                />
              </>
            )}

            {/* Schedule section */}
            <div className="border-t border-border/60 pt-4">
              <label className="block text-sm font-medium text-foreground mb-1">Schedule</label>
              <p className="text-xs text-muted-foreground mb-2">
                Cron expression for recurring runs. Leave empty for manual-only.
              </p>
              <input
                type="text"
                value={deploySchedule}
                onChange={(e) => setDeploySchedule(e.target.value)}
                placeholder={String(automation.trigger_config?.cron ?? 'e.g. 0 7 * * *')}
                className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-accent/40"
              />
              {automation.trigger_config?.cron && !deploySchedule && (
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Default: <code className="font-mono text-accent/70">{String(automation.trigger_config.cron)}</code>
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg border border-border/60 text-sm text-muted-foreground hover:text-foreground transition"
                onClick={() => { setShowDeployDialog(false); setDeployInputValues({}); setDeploySchedule('') }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold transition hover:bg-emerald-600/90"
                disabled={deployAutomation.isPending}
                onClick={() => {
                  if (!defaultWorkspaceId) return
                  deployAutomation.mutate({
                    automationId,
                    data: {
                      workspace_id: defaultWorkspaceId,
                      input_values: deployInputValues,
                      ...(deploySchedule ? { schedule_expression: deploySchedule } : {}),
                    },
                  }, {
                    onSuccess: () => {
                      setShowDeployDialog(false)
                      setDeployInputValues({})
                      setDeploySchedule('')
                    },
                  })
                }}
              >
                {deployAutomation.isPending ? 'Deploying...' : 'Deploy'}
              </button>
            </div>
          </div>
        </div>
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
        <Link to={runsRoute(latestRun.id)} className="text-accent hover:text-accent/80 transition font-mono text-xs">
          {latestRun.id.slice(0, 12)}...
        </Link>
        <StatusBadge status={latestRun.status} />
      </div>
      <p>No active run. Trigger the automation to see live output.</p>
    </div>
  )
}
