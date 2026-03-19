import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot, Filter, Plus } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useAgentsQuery, useCreateAgent, useDeleteAgent } from '@/features/agents'
import { formatRelativeTime } from '@/lib/formatters'
import { agentsRoute } from '@/lib/routes'
import type { AgentMode, AgentStatus } from '@/types/agents'

export default function AgentsPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | AgentStatus>('all')
  const [modeFilter, setModeFilter] = useState<'all' | AgentMode>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', slug: '', description: '', mode: 'interactive' as AgentMode })

  const { data, isLoading, error } = useAgentsQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    mode: modeFilter === 'all' ? undefined : modeFilter,
  })
  const createAgent = useCreateAgent()
  const deleteAgent = useDeleteAgent()

  if (isLoading) return <LoadingState label="Loading agents..." />
  if (error) return <ErrorState message="Agents could not be loaded." />

  const agents = data?.agents ?? []

  const handleCreate = async () => {
    if (!createForm.name || !createForm.slug) return
    await createAgent.mutateAsync({
      name: createForm.name,
      slug: createForm.slug,
      description: createForm.description || undefined,
      mode: createForm.mode,
    })
    setCreateForm({ name: '', slug: '', description: '', mode: 'interactive' })
    setShowCreate(false)
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Agents"
        description="Agent definitions that power interactive and autonomous workflows."
        actions={
          <button
            className="bg-accent text-accent-foreground hover:bg-accent/90 px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Create Agent
          </button>
        }
      />

      {/* Create dialog */}
      {showCreate && (
        <div className="rounded-2xl border border-border/60 bg-card/30 p-5 space-y-4">
          <h3 className="text-sm font-semibold">New Agent</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Name</span>
              <input className="input w-full" value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} placeholder="My Agent" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Slug</span>
              <input className="input w-full" value={createForm.slug} onChange={e => setCreateForm(p => ({ ...p, slug: e.target.value }))} placeholder="my-agent" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Description</span>
              <input className="input w-full" value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Mode</span>
              <select className="input w-full" value={createForm.mode} onChange={e => setCreateForm(p => ({ ...p, mode: e.target.value as AgentMode }))}>
                <option value="interactive">Interactive</option>
                <option value="background">Background</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button className="bg-accent text-accent-foreground hover:bg-accent/90 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors" onClick={handleCreate} disabled={createAgent.isPending}>
              {createAgent.isPending ? 'Creating...' : 'Create'}
            </button>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <section className="rounded-2xl border border-border/60 bg-card/30 p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
          <Filter className="h-4 w-4 text-accent" /> Filters
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">Status</span>
            <select className="input w-full" value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | AgentStatus)}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">Mode</span>
            <select className="input w-full" value={modeFilter} onChange={e => setModeFilter(e.target.value as 'all' | AgentMode)}>
              <option value="all">All modes</option>
              <option value="interactive">Interactive</option>
              <option value="background">Background</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
        </div>
      </section>

      {/* Agent list */}
      {agents.length === 0 ? (
        <EmptyState
          title="No agents yet"
          description="Create your first agent to define capabilities and behaviors."
          actionLabel="Create Agent"
          icon={<Bot className="h-5 w-5" />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/30">
          <table className="min-w-full divide-y divide-border/60">
            <thead className="bg-background/35">
              <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground/75">
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Mode</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Health</th>
                <th className="px-4 py-3 font-medium">Compilation</th>
                <th className="px-4 py-3 font-medium">Last Used</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {agents.map(agent => (
                <tr key={agent.id} className="text-sm text-foreground">
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <Link className="font-medium transition hover:text-accent" to={agentsRoute(agent.id)}>
                        {agent.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground/80">{agent.slug}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="chip-muted text-xs capitalize">{agent.mode}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={agent.status} /></td>
                  <td className="px-4 py-3"><StatusBadge status={agent.health_status} /></td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${agent.compilation_status === 'success' ? 'text-emerald-400' : agent.compilation_status === 'error' ? 'text-red-400' : 'text-muted-foreground'}`}>
                      {agent.compilation_status || 'Not compiled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground/90 text-xs">
                    {agent.last_used_at ? formatRelativeTime(agent.last_used_at) : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link className="inline-flex items-center gap-1 text-xs text-accent transition hover:text-accent/80" to={agentsRoute(agent.id)}>
                        View <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        className="text-xs text-red-400 hover:text-red-300 transition"
                        onClick={() => { if (confirm(`Delete agent "${agent.name}"?`)) deleteAgent.mutate(agent.id) }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
