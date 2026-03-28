import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FolderOpen,
  Plus,
  Pencil,
  Trash2,
  Merge,
  X,
  Check,
  Inbox,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  listWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  mergeWorkspaces,
} from '@/lib/api'
import ConfirmModal from '@/components/shared/ConfirmModal'
import EmptyState from '@/components/shared/EmptyState'
import LoadingSpinner from '@/components/shared/LoadingSpinner'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Workspace {
  id: string
  name: string
  description?: string | null
  created_at?: string
  updated_at?: string
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function WorkspacesPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeSource, setMergeSource] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')

  const workspacesQuery = useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  })

  const workspaces: Workspace[] = workspacesQuery.data?.workspaces ?? workspacesQuery.data ?? []

  const createMutation = useMutation({
    mutationFn: () => createWorkspace({ name: formName, description: formDescription }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setShowCreate(false)
      setFormName('')
      setFormDescription('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      updateWorkspace(id, { name: formName, description: formDescription }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setEditingId(null)
      setFormName('')
      setFormDescription('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWorkspace(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setDeleteTarget(null)
    },
  })

  const mergeMutation = useMutation({
    mutationFn: () => mergeWorkspaces(mergeTarget, mergeSource, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setMergeOpen(false)
      setMergeSource('')
      setMergeTarget('')
    },
  })

  const startEdit = (ws: Workspace) => {
    setEditingId(ws.id)
    setFormName(ws.name)
    setFormDescription(ws.description ?? '')
    setShowCreate(false)
  }

  const startCreate = () => {
    setShowCreate(true)
    setEditingId(null)
    setFormName('')
    setFormDescription('')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-fg">Workspaces</h2>
          <p className="text-sm text-fg-muted">Manage workspaces for organizing knowledge and conversations</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMergeOpen(true)}
            disabled={workspaces.length < 2}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 font-label text-sm font-medium text-fg hover:bg-bg-sunken disabled:opacity-40 transition-colors"
          >
            <Merge className="h-4 w-4" />
            Merge
          </button>
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label text-sm font-medium text-fg-on-primary hover:bg-primary-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Workspace
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-primary/30 bg-bg-elevated p-5 space-y-4">
          <h3 className="font-display text-sm font-semibold text-fg">New Workspace</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Workspace name"
              autoFocus
              className="w-full rounded-lg border border-border bg-bg py-2 px-3 font-body text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-border bg-bg py-2 px-3 font-body text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !formName.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label text-sm font-medium text-fg-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              <Check className="h-4 w-4" />
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 font-label text-sm font-medium text-fg hover:bg-bg-sunken transition-colors"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {workspacesQuery.isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* Empty state */}
      {!workspacesQuery.isLoading && workspaces.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="No workspaces"
          description="Create your first workspace to start organizing knowledge and conversations."
          action={
            <button
              onClick={startCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label text-sm font-medium text-fg-on-primary hover:bg-primary-hover transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Workspace
            </button>
          }
        />
      )}

      {/* Workspace list */}
      {!workspacesQuery.isLoading && workspaces.length > 0 && (
        <div className="space-y-3">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className="rounded-lg border border-border/40 bg-bg-elevated p-5"
            >
              {editingId === ws.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-bg py-2 px-3 font-body text-sm text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-bg py-2 px-3 font-body text-sm text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateMutation.mutate(ws.id)}
                      disabled={updateMutation.isPending || !formName.trim()}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 font-label text-sm font-medium text-fg-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 font-label text-sm font-medium text-fg hover:bg-bg-sunken transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FolderOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-display text-sm font-semibold text-fg">{ws.name}</p>
                      {ws.description && (
                        <p className="text-xs text-fg-muted">{ws.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(ws)}
                      className="rounded-md p-1.5 text-fg-subtle hover:text-fg hover:bg-bg-sunken transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(ws.id)}
                      className="rounded-md p-1.5 text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Merge modal */}
      {mergeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMergeOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-bg-elevated p-6 shadow-2xl">
            <h3 className="font-display text-lg font-semibold text-fg">Merge Workspaces</h3>
            <p className="mt-2 text-sm text-fg-muted">
              Merge one workspace into another. The source workspace will be deleted.
            </p>
            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <label className="font-label text-sm font-medium text-fg">Source (will be deleted)</label>
                <select
                  value={mergeSource}
                  onChange={(e) => setMergeSource(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-body text-sm text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select source...</option>
                  {workspaces
                    .filter((ws) => ws.id !== mergeTarget)
                    .map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="font-label text-sm font-medium text-fg">Target (receives data)</label>
                <select
                  value={mergeTarget}
                  onChange={(e) => setMergeTarget(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-body text-sm text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select target...</option>
                  {workspaces
                    .filter((ws) => ws.id !== mergeSource)
                    .map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setMergeOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-bg-sunken transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => mergeMutation.mutate()}
                disabled={!mergeSource || !mergeTarget || mergeMutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-fg-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                Merge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete Workspace"
        description="Are you sure you want to delete this workspace? All knowledge, conversations, and data within it will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget)
        }}
      />
    </div>
  )
}
