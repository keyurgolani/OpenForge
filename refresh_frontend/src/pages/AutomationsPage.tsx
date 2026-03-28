import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Trash2,
  Cog,
  MoreVertical,
  Rocket,
  HeartPulse,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/cn'
import {
  listAutomations,
  compileAutomation,
  pauseAutomation,
  resumeAutomation,
  deleteAutomation,
  createAutomation,
  listAgents,
} from '@/lib/api'
import { automationsRoute } from '@/lib/routes'
import type { Automation, AutomationStatus } from '@/types/automations'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmModal from '@/components/shared/ConfirmModal'
import { useToast } from '@/components/shared/ToastProvider'

// ---------------------------------------------------------------------------
// Status filter tabs
// ---------------------------------------------------------------------------

type FilterTab = 'all' | AutomationStatus

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'disabled', label: 'Disabled' },
]

// ---------------------------------------------------------------------------
// Health indicator
// ---------------------------------------------------------------------------

function HealthIndicator({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-success',
    degraded: 'bg-warning',
    unhealthy: 'bg-danger',
    unknown: 'bg-fg-subtle',
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn('h-2 w-2 rounded-full', colors[status] ?? colors.unknown)}
      />
      <span className="text-xs text-fg-muted capitalize">{status}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <tr className="border-b border-border/50">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div
            className="h-4 animate-pulse rounded bg-bg-sunken"
            style={{ width: `${40 + i * 10}%` }}
          />
        </td>
      ))}
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Actions dropdown
// ---------------------------------------------------------------------------

function ActionsMenu({
  automation,
  onCompile,
  onTogglePause,
  onDeploy,
  onDelete,
}: {
  automation: Automation
  onCompile: () => void
  onTogglePause: () => void
  onDeploy: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        className={cn(
          'rounded-md p-1.5 text-fg-subtle',
          'hover:text-fg hover:bg-bg-sunken transition-colors',
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop to close */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'absolute right-0 top-8 z-20 w-44 rounded-lg',
                'border border-border bg-bg-elevated shadow-lg overflow-hidden',
              )}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCompile()
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-fg hover:bg-bg-sunken transition-colors"
              >
                <Cog className="h-3.5 w-3.5" />
                Compile
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onTogglePause()
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-fg hover:bg-bg-sunken transition-colors"
              >
                {automation.status === 'paused' ? (
                  <Play className="h-3.5 w-3.5" />
                ) : (
                  <Pause className="h-3.5 w-3.5" />
                )}
                {automation.status === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeploy()
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-fg hover:bg-bg-sunken transition-colors"
              >
                <Rocket className="h-3.5 w-3.5" />
                Deploy
              </button>
              <div className="border-t border-border" />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-danger hover:bg-danger/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Automation Row
// ---------------------------------------------------------------------------

function AutomationRow({
  automation,
  agentName,
  index,
  onCompile,
  onTogglePause,
  onDeploy,
  onDelete,
}: {
  automation: Automation
  agentName: string
  index: number
  onCompile: () => void
  onTogglePause: () => void
  onDeploy: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      onClick={() => navigate(automationsRoute(automation.id))}
      className={cn(
        'group cursor-pointer border-b border-border/50',
        'transition-colors hover:bg-primary-50/40 dark:hover:bg-primary-900/10',
      )}
    >
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/10">
            <Workflow className="h-4 w-4 text-secondary" />
          </div>
          <span className="font-label text-sm font-medium text-fg group-hover:text-primary transition-colors">
            {automation.name}
          </span>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge status={automation.status} />
      </td>
      <td className="px-4 py-3.5 text-sm text-fg-muted">
        {agentName || '\u2014'}
      </td>
      <td className="px-4 py-3.5">
        <HealthIndicator status={automation.health_status} />
      </td>
      <td className="px-4 py-3.5 text-sm text-fg-muted">
        {automation.last_run_at
          ? formatDistanceToNow(new Date(automation.last_run_at), { addSuffix: true })
          : '\u2014'}
      </td>
      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
        <ActionsMenu
          automation={automation}
          onCompile={onCompile}
          onTogglePause={onTogglePause}
          onDeploy={onDeploy}
          onDelete={onDelete}
        />
      </td>
    </motion.tr>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AutomationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [filter, setFilter] = useState<FilterTab>('all')
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['automations', filter === 'all' ? undefined : filter],
    queryFn: () =>
      listAutomations({
        status: filter === 'all' ? undefined : filter,
        limit: 200,
      }),
  })

  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => listAgents({ limit: 200 }),
  })

  const agentMap = new Map(
    (agentsData?.agents ?? []).map((a) => [a.id, a.name]),
  )

  const automations: Automation[] = data?.automations ?? []

  // Mutations
  const compileMut = useMutation({
    mutationFn: compileAutomation,
    onSuccess: () => {
      toast.success('Compilation started')
      queryClient.invalidateQueries({ queryKey: ['automations'] })
    },
    onError: (err: any) => toast.error('Compile failed', err?.response?.data?.detail ?? err.message),
  })

  const pauseMut = useMutation({
    mutationFn: (a: Automation) =>
      a.status === 'paused' ? resumeAutomation(a.id) : pauseAutomation(a.id),
    onSuccess: () => {
      toast.success('Status updated')
      queryClient.invalidateQueries({ queryKey: ['automations'] })
    },
    onError: (err: any) => toast.error('Action failed', err?.response?.data?.detail ?? err.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAutomation(id),
    onSuccess: () => {
      toast.success('Automation deleted')
      queryClient.invalidateQueries({ queryKey: ['automations'] })
    },
    onError: (err: any) => toast.error('Delete failed', err?.response?.data?.detail ?? err.message),
  })

  const createMut = useMutation({
    mutationFn: () =>
      createAutomation({
        name: 'Untitled Automation',
        slug: `automation-${Date.now()}`,
        status: 'draft',
      }),
    onSuccess: (data) => {
      toast.success('Automation created')
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      navigate(automationsRoute(data.id))
    },
    onError: (err: any) => toast.error('Create failed', err?.response?.data?.detail ?? err.message),
  })

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Automations"
        description="Build and manage automated workflows powered by your agents."
      >
        <button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
            'text-sm font-medium text-fg-on-primary',
            'hover:bg-primary-hover transition-colors focus-ring',
            'disabled:opacity-50',
          )}
        >
          <Plus className="h-4 w-4" />
          Create Automation
        </button>
      </PageHeader>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-bg-sunken/50 p-1 w-fit">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              filter === tab.value
                ? 'bg-bg-elevated text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-bg-sunken/50">
              <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Name
              </th>
              <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Status
              </th>
              <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Agent
              </th>
              <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Health
              </th>
              <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Last Run
              </th>
              <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </>
            )}
            {!isLoading && automations.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={Workflow}
                    title={filter !== 'all' ? `No ${filter} automations` : 'No automations yet'}
                    description={
                      filter !== 'all'
                        ? 'Try switching to a different filter.'
                        : 'Create your first automation to get started.'
                    }
                    action={
                      filter === 'all' ? (
                        <button
                          onClick={() => createMut.mutate()}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
                            'text-sm font-medium text-fg-on-primary',
                            'hover:bg-primary-hover transition-colors focus-ring',
                          )}
                        >
                          <Plus className="h-4 w-4" />
                          Create Automation
                        </button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            )}
            <AnimatePresence>
              {!isLoading &&
                automations.map((automation, i) => (
                  <AutomationRow
                    key={automation.id}
                    automation={automation}
                    agentName={
                      automation.agent_id ? (agentMap.get(automation.agent_id) ?? 'Unknown') : ''
                    }
                    index={i}
                    onCompile={() => compileMut.mutate(automation.id)}
                    onTogglePause={() => pauseMut.mutate(automation)}
                    onDeploy={() => navigate(automationsRoute(automation.id))}
                    onDelete={() => setDeleteTarget(automation)}
                  />
                ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Delete confirm modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete Automation"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            deleteMut.mutate(deleteTarget.id)
            setDeleteTarget(null)
          }
        }}
      />
    </div>
  )
}
