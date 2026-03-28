import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Bot, Plus } from 'lucide-react'

import { ConfirmModal } from '@/components/shared/ConfirmModal'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import { useAgentsQuery, useDeleteAgent } from '@/features/agents'
import { formatRelativeTime } from '@/lib/formatters'
import { agentsRoute } from '@/lib/routes'
import { useUIStore } from '@/stores/uiStore'

export default function AgentsPage() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useAgentsQuery()
  const deleteAgent = useDeleteAgent()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const setHeaderActions = useUIStore(s => s.setHeaderActions)

  useEffect(() => {
    setHeaderActions(
      <button
        className="bg-accent text-accent-foreground hover:bg-accent/90 px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
        onClick={() => navigate('/agents/new')}
      >
        <Plus className="w-3.5 h-3.5" /> Create Agent
      </button>
    )
    return () => setHeaderActions(null)
  }, [navigate, setHeaderActions])

  if (isLoading) return <LoadingState label="Loading agents..." />
  if (error) return <ErrorState message="Agents could not be loaded." />

  const agents = data?.agents ?? []

  return (
    <div className="space-y-6 p-6">

      {/* Agent list */}
      {agents.length === 0 ? (
        <EmptyState
          title="No agents yet"
          description="Create your first agent to define capabilities and behaviors."
          actionLabel="Create Agent"
          onAction={() => navigate('/agents/new')}
          icon={<Bot className="h-5 w-5" />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/25 bg-card/30">
          <table className="min-w-full divide-y divide-border/60">
            <thead className="bg-background/35">
              <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground/75">
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {agents.map(agent => (
                <tr key={agent.id} className="text-sm text-foreground">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Bot className="h-4 w-4 text-accent flex-shrink-0" />
                      <div className="min-w-0">
                        <Link className="font-medium transition hover:text-accent" to={agentsRoute(agent.id)}>
                          {agent.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground/80">{agent.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground/90 max-w-xs truncate">
                    {agent.description || <span className="text-muted-foreground/70">--</span>}
                  </td>
                  <td className="px-4 py-3">
                    {agent.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {agent.tags.map(tag => (
                          <span key={tag} className="chip-muted text-xs">{tag}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground/90 text-xs">
                    {formatRelativeTime(agent.updated_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link className="inline-flex items-center gap-1 text-xs text-accent transition hover:text-accent/80" to={agentsRoute(agent.id)}>
                        View <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        className="text-xs text-red-400 hover:text-red-300 transition"
                        onClick={() => setDeleteTarget({ id: agent.id, name: agent.name })}
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

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteAgent.mutate(deleteTarget.id, {
              onSuccess: () => setDeleteTarget(null),
            })
          }
        }}
        title="Delete Agent"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        icon="trash"
        loading={deleteAgent.isPending}
      />
    </div>
  )
}
