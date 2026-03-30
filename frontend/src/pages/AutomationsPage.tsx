import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Plus, Zap } from 'lucide-react'

import MiniGraphPreview from '@/components/automations/MiniGraphPreview'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import { useAutomationsQuery, useDeleteAutomation } from '@/features/automations'
import { formatRelativeTime } from '@/lib/formatters'
import { automationsRoute, automationCreateRoute } from '@/lib/routes'
import { useUIStore } from '@/stores/uiStore'

export default function AutomationsPage() {
  const navigate = useNavigate()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const setHeaderActions = useUIStore(s => s.setHeaderActions)

  const { data, isLoading, error } = useAutomationsQuery()
  const deleteAutomation = useDeleteAutomation()

  useEffect(() => {
    setHeaderActions(
      <button
        className="bg-accent text-accent-foreground hover:bg-accent/90 px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
        onClick={() => navigate(automationCreateRoute())}
      >
        <Plus className="w-3.5 h-3.5" /> Create Automation
      </button>
    )
    return () => setHeaderActions(null)
  }, [setHeaderActions, navigate])

  if (isLoading) return <LoadingState label="Loading automations..." />
  if (error) return <ErrorState message="Automations could not be loaded." />

  const automations = data?.automations ?? []

  return (
    <div className="space-y-6 p-6">
      {automations.length === 0 ? (
        <EmptyState
          title="No automations yet"
          description="Create your first automation to define agent workflows."
          actionLabel="Create Automation"
          onAction={() => navigate(automationCreateRoute())}
          icon={<Zap className="h-5 w-5" />}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/25 bg-card/30">
          <table className="min-w-full divide-y divide-border/60">
            <thead className="bg-background/35">
              <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground/75">
                <th className="px-4 py-3 font-medium">Automation</th>
                <th className="px-4 py-3 font-medium">Graph</th>
                <th className="px-4 py-3 font-medium">Updated</th>
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
                    {automation.graph_preview ? (
                      <MiniGraphPreview
                        nodes={automation.graph_preview.nodes}
                        edges={automation.graph_preview.edges}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">No graph</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground/90 text-xs">
                    {automation.updated_at ? formatRelativeTime(automation.updated_at) : '--'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link className="inline-flex items-center gap-1 text-xs text-accent transition hover:text-accent/80" to={automationsRoute(automation.id)}>
                        View <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        className="text-xs text-red-400 hover:text-red-300 transition"
                        onClick={() => setDeleteTarget({ id: automation.id, name: automation.name })}
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

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteAutomation.mutate(deleteTarget.id, {
              onSuccess: () => setDeleteTarget(null),
            })
          }
        }}
        title="Delete Automation"
        message={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        icon="trash"
        loading={deleteAutomation.isPending}
      />
    </div>
  )
}
