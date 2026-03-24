import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Filter, GitBranch, Plus, Zap } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useAutomationsQuery, useCreateAutomation, useDeleteAutomation, usePauseAutomation, useResumeAutomation, useActivateAutomation } from '@/features/automations'
import { useAgentsQuery } from '@/features/agents'
import { formatRelativeTime } from '@/lib/formatters'
import { automationsRoute, agentsRoute } from '@/lib/routes'
import type { AutomationStatus } from '@/types/automations'

export default function AutomationsPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | AutomationStatus>('all')
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ agent_id: '', name: '', slug: '', description: '' })

  const { data, isLoading, error } = useAutomationsQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    agent_id: agentFilter === 'all' ? undefined : agentFilter,
  })
  const { data: agentsData } = useAgentsQuery({ limit: 200 })
  const createAutomation = useCreateAutomation()
  const deleteAutomation = useDeleteAutomation()
  const pauseAutomation = usePauseAutomation()
  const resumeAutomation = useResumeAutomation()
  const activateAutomation = useActivateAutomation()

  if (isLoading) return <LoadingState label="Loading automations..." />
  if (error) return <ErrorState message="Automations could not be loaded." />

  const automations = data?.automations ?? []
  const agents = agentsData?.agents ?? []

  const getAgentName = (agentId: string) => agents.find(a => a.id === agentId)?.name ?? agentId.slice(0, 12)

  const handleCreate = async () => {
    if (!createForm.name || !createForm.slug) return
    await createAutomation.mutateAsync({
      agent_id: createForm.agent_id || undefined,
      name: createForm.name,
      slug: createForm.slug,
      description: createForm.description || undefined,
    })
    setCreateForm({ agent_id: '', name: '', slug: '', description: '' })
    setShowCreate(false)
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Automations"
        description="Automated workflows that run agents on triggers and schedules."
        actions={
          <button
            className="bg-accent text-accent-foreground hover:bg-accent/90 px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Create Automation
          </button>
        }
      />

      {/* Create dialog */}
      {showCreate && (
        <div className="rounded-2xl border border-border/60 bg-card/30 p-5 space-y-4">
          <h3 className="text-sm font-semibold">New Automation</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Agent</span>
              <select id="create-agent" name="agent_id" className="input w-full" value={createForm.agent_id} onChange={e => setCreateForm(p => ({ ...p, agent_id: e.target.value }))}>
                <option value="">None (Multi-node graph)</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Name</span>
              <input id="create-automation-name" name="name" className="input w-full" value={createForm.name} onChange={e => { const name = e.target.value; setCreateForm(p => ({ ...p, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })); }} placeholder="My Automation" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Slug</span>
              <input id="create-automation-slug" name="slug" className="input w-full" value={createForm.slug} onChange={e => setCreateForm(p => ({ ...p, slug: e.target.value }))} placeholder="my-automation" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Description</span>
              <input id="create-automation-description" name="description" className="input w-full" value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" />
            </label>
          </div>
          <div className="flex gap-2">
            <button className="bg-accent text-accent-foreground hover:bg-accent/90 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors" onClick={handleCreate} disabled={createAutomation.isPending}>
              {createAutomation.isPending ? 'Creating...' : 'Create'}
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
            <select id="filter-automation-status" name="filter-status" className="input w-full" value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | AutomationStatus)}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="disabled">Disabled</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">Agent</span>
            <select id="filter-automation-agent" name="filter-agent" className="input w-full" value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
              <option value="all">All agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
      </section>

      {/* Automation list */}
      {automations.length === 0 ? (
        <EmptyState
          title="No automations yet"
          description="Create your first automation to run agents on triggers and schedules."
          actionLabel="Create Automation"
          onAction={() => setShowCreate(true)}
          icon={<Zap className="h-5 w-5" />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/30">
          <table className="min-w-full divide-y divide-border/60">
            <thead className="bg-background/35">
              <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground/75">
                <th className="px-4 py-3 font-medium">Automation</th>
                <th className="px-4 py-3 font-medium">Agents</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Health</th>
                <th className="px-4 py-3 font-medium">Last Run</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {automations.map(automation => (
                <tr key={automation.id} className="text-sm text-foreground">
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <Link className="font-medium transition hover:text-accent" to={automationsRoute(automation.id)}>
                        {automation.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground/80">{automation.slug}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {automation.graph_version > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent px-2 py-0.5">
                          <GitBranch className="w-3 h-3" /> Graph v{automation.graph_version}
                        </span>
                      </span>
                    ) : automation.agent_id ? (
                      <Link className="text-xs text-accent transition hover:text-accent/80" to={agentsRoute(automation.agent_id)}>
                        {getAgentName(automation.agent_id)}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">No agents</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={automation.status} /></td>
                  <td className="px-4 py-3"><StatusBadge status={automation.health_status} /></td>
                  <td className="px-4 py-3 text-muted-foreground/90 text-xs">
                    {automation.last_run_at ? formatRelativeTime(automation.last_run_at) : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {automation.status === 'active' && (
                        <button className="text-xs text-amber-400 hover:text-amber-300" onClick={() => pauseAutomation.mutate(automation.id)}>Pause</button>
                      )}
                      {automation.status === 'paused' && (
                        <button className="text-xs text-emerald-400 hover:text-emerald-300" onClick={() => resumeAutomation.mutate(automation.id)}>Resume</button>
                      )}
                      {automation.status === 'draft' && (
                        <button className="text-xs text-accent hover:text-accent/80" onClick={() => activateAutomation.mutate(automation.id)}>Activate</button>
                      )}
                      <Link className="inline-flex items-center gap-1 text-xs text-accent transition hover:text-accent/80" to={automationsRoute(automation.id)}>
                        View <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        className="text-xs text-red-400 hover:text-red-300 transition"
                        onClick={() => { if (confirm(`Delete automation "${automation.name}"?`)) deleteAutomation.mutate(automation.id) }}
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
