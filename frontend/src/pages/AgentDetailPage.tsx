import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Bot, Check, Cog, FileCode, List, Activity } from 'lucide-react'

import BlueprintEditor from '@/components/shared/BlueprintEditor'
import ErrorState from '@/components/shared/ErrorState'
import LiveTerminalLog from '@/components/shared/LiveTerminalLog'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useAgentQuery, useUpdateAgent, useCompileAgent, useAgentSpecsQuery } from '@/features/agents'
import { useRunsQuery } from '@/features/runs'
import { formatDateTime, formatRelativeTime } from '@/lib/formatters'
import { agentsRoute, runsRoute } from '@/lib/routes'
import type { AgentMode } from '@/types/agents'

type Tab = 'overview' | 'blueprint' | 'specs' | 'activity'

export default function AgentDetailPage() {
  const { agentId = '' } = useParams<{ agentId: string }>()
  const { data: agent, isLoading, error } = useAgentQuery(agentId)
  const { data: specsData } = useAgentSpecsQuery(agentId)
  const updateAgent = useUpdateAgent()
  const compileAgent = useCompileAgent()

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [blueprintDraft, setBlueprintDraft] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')

  if (isLoading) return <LoadingState label="Loading agent..." />
  if (error || !agent) return <ErrorState message="Agent could not be loaded." />

  const specs = specsData?.specs ?? []
  const currentBlueprint = blueprintDraft ?? agent.blueprint_md ?? ''

  const handleSaveBlueprint = async () => {
    await updateAgent.mutateAsync({ id: agentId, data: { blueprint_md: currentBlueprint } })
    setBlueprintDraft(null)
  }

  const handleCompile = () => compileAgent.mutate(agentId)

  const handleSaveName = async () => {
    if (nameValue.trim() && nameValue !== agent.name) {
      await updateAgent.mutateAsync({ id: agentId, data: { name: nameValue.trim() } })
    }
    setEditingName(false)
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Bot className="w-4 h-4" /> },
    { id: 'blueprint', label: 'Blueprint', icon: <FileCode className="w-4 h-4" /> },
    { id: 'specs', label: 'Specs', icon: <List className="w-4 h-4" /> },
    { id: 'activity', label: 'Activity', icon: <Activity className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={agent.name}
        description={agent.description ?? `Agent ${agent.slug}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={agentsRoute()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent text-accent-foreground px-3 text-sm font-semibold transition hover:bg-accent/90"
              onClick={handleCompile}
              disabled={compileAgent.isPending}
            >
              <Cog className="h-4 w-4" />
              {compileAgent.isPending ? 'Compiling...' : 'Compile'}
            </button>
          </div>
        }
      />

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={agent.status} />
        <span className="chip-muted text-xs capitalize">{agent.mode}</span>
        <StatusBadge status={agent.health_status} />
        {agent.compilation_status && (
          <span className={`text-xs ${agent.compilation_status === 'success' ? 'text-emerald-400' : agent.compilation_status === 'error' ? 'text-red-400' : 'text-muted-foreground'}`}>
            Compilation: {agent.compilation_status}
          </span>
        )}
        {agent.tags.length > 0 && agent.tags.map(tag => (
          <span key={tag} className="chip-muted text-xs">{tag}</span>
        ))}
      </div>

      {/* Tab nav */}
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
            { label: 'Name', value: agent.name },
            { label: 'Slug', value: agent.slug },
            { label: 'Mode', value: agent.mode },
            { label: 'Status', value: agent.status },
            { label: 'Health', value: agent.health_status },
            { label: 'Template', value: agent.is_template ? 'Yes' : 'No' },
            { label: 'System', value: agent.is_system ? 'Yes' : 'No' },
            { label: 'Last Used', value: agent.last_used_at ? formatRelativeTime(agent.last_used_at) : 'Never' },
            { label: 'Last Error', value: agent.last_error_at ? formatRelativeTime(agent.last_error_at) : 'None' },
            { label: 'Created', value: formatDateTime(agent.created_at) },
            { label: 'Updated', value: formatDateTime(agent.updated_at) },
            { label: 'Active Spec', value: agent.active_spec_id ? agent.active_spec_id.slice(0, 12) + '...' : 'None' },
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-border/60 bg-background/35 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">{item.label}</p>
              <p className="mt-1 text-sm font-medium text-foreground capitalize">{item.value}</p>
            </div>
          ))}
          {agent.compilation_error && (
            <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
              <p className="font-medium">Compilation Error</p>
              <p className="mt-1 text-red-100/85">{agent.compilation_error}</p>
            </div>
          )}
          {agent.last_error_summary && (
            <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p className="font-medium">Last Error Summary</p>
              <p className="mt-1 text-amber-100/85">{agent.last_error_summary}</p>
            </div>
          )}
          {agent.description && (
            <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-border/60 bg-background/35 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Description</p>
              <p className="mt-1 text-sm text-foreground">{agent.description}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'blueprint' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Edit the agent blueprint (Markdown)</p>
            <div className="flex gap-2">
              {blueprintDraft !== null && (
                <button
                  className="bg-accent text-accent-foreground hover:bg-accent/90 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5"
                  onClick={handleSaveBlueprint}
                  disabled={updateAgent.isPending}
                >
                  <Check className="w-3.5 h-3.5" />
                  {updateAgent.isPending ? 'Saving...' : 'Save'}
                </button>
              )}
              <button
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
                onClick={handleCompile}
                disabled={compileAgent.isPending}
              >
                <Cog className="w-3.5 h-3.5" />
                {compileAgent.isPending ? 'Compiling...' : 'Compile'}
              </button>
            </div>
          </div>
          <BlueprintEditor
            value={currentBlueprint}
            onChange={val => setBlueprintDraft(val)}
          />
        </div>
      )}

      {activeTab === 'specs' && (
        <div className="space-y-3">
          {specs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 p-6 text-sm text-muted-foreground/80">
              No compiled specs yet. Compile the agent to generate specs.
            </div>
          ) : (
            specs.map(spec => (
              <div
                key={spec.id}
                className={`rounded-xl border px-4 py-3 ${
                  spec.id === agent.active_spec_id
                    ? 'border-accent/40 bg-accent/10'
                    : 'border-border/60 bg-background/35'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Version {spec.version}
                      {spec.id === agent.active_spec_id && (
                        <span className="ml-2 text-xs text-accent">(Active)</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground/80">
                      {spec.compiler_version} &middot; {formatDateTime(spec.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${spec.is_valid ? 'text-emerald-400' : 'text-red-400'}`}>
                      {spec.is_valid ? 'Valid' : 'Invalid'}
                    </span>
                  </div>
                </div>
                {spec.validation_errors.length > 0 && (
                  <div className="mt-2 text-xs text-red-400">
                    {spec.validation_errors.length} validation error{spec.validation_errors.length === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <AgentActivityTab agentId={agentId} />
      )}
    </div>
  )
}

function AgentActivityTab({ agentId }: { agentId: string }) {
  const { data: runsData, isLoading } = useRunsQuery({ agentId, limit: 1 })
  const latestRun = runsData?.runs?.[0]

  if (isLoading) return <LoadingState label="Loading activity..." />

  if (!latestRun) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 p-6 text-sm text-muted-foreground/80">
        No runs found for this agent. Start a run to see activity here.
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
      <p>No active run. Start a new run to see live output.</p>
    </div>
  )
}
