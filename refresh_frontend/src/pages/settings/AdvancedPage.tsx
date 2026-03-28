import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Clock,
  Terminal,
  ShieldCheck,
  Play,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Check,
  X as XIcon,
  AlertTriangle,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  listSchedules,
  updateSchedule,
  runTaskNow,
  getTaskHistory,
  getToolCallLogs,
  getHITLHistory,
} from '@/lib/api'
import { useToast } from '@/components/shared/ToastProvider'
import StatusBadge from '@/components/shared/StatusBadge'
import EmptyState from '@/components/shared/EmptyState'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Schedule {
  id: string
  task_type: string
  enabled: boolean
  interval_hours: number
  last_run_at?: string | null
  next_run_at?: string | null
}

interface TaskHistoryEntry {
  id: string
  task_type: string
  status: string
  started_at?: string
  completed_at?: string
  error?: string | null
}

interface ToolCallLog {
  id: string
  tool_name: string
  workspace_id?: string
  status?: string
  created_at?: string
  duration_ms?: number
  input_preview?: string
}

interface HITLEntry {
  id: string
  tool_id: string
  action_summary: string
  risk_level?: string
  status: string
  created_at: string
  resolved_at?: string | null
}

/* -------------------------------------------------------------------------- */
/* Jobs Tab                                                                   */
/* -------------------------------------------------------------------------- */

function JobsTab() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const schedulesQuery = useQuery({
    queryKey: ['schedules'],
    queryFn: listSchedules,
  })

  const historyQuery = useQuery({
    queryKey: ['task-history'],
    queryFn: () => getTaskHistory({ limit: 50 }),
  })

  const schedules: Schedule[] = schedulesQuery.data?.schedules ?? schedulesQuery.data ?? []
  const history: TaskHistoryEntry[] = historyQuery.data?.history ?? historyQuery.data ?? []

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateSchedule(id, { enabled }),
    onSuccess: () => {
      toast.success('Schedule updated')
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
    },
    onError: (err: any) => toast.error('Update failed', err?.response?.data?.detail ?? err.message),
  })

  const runNowMut = useMutation({
    mutationFn: (id: string) => runTaskNow(id),
    onSuccess: () => {
      toast.success('Task started')
      queryClient.invalidateQueries({ queryKey: ['task-history'] })
    },
    onError: (err: any) => toast.error('Run failed', err?.response?.data?.detail ?? err.message),
  })

  return (
    <div className="space-y-6">
      {/* Schedules */}
      <div>
        <h4 className="font-label text-sm font-medium text-fg mb-3">Scheduled Tasks</h4>

        {schedulesQuery.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-bg-sunken" />
            ))}
          </div>
        )}

        {!schedulesQuery.isLoading && schedules.length === 0 && (
          <EmptyState
            icon={Clock}
            title="No scheduled tasks"
            description="System tasks will appear here when configured."
          />
        )}

        {!schedulesQuery.isLoading && schedules.length > 0 && (
          <div className="space-y-2">
            <AnimatePresence>
              {schedules.map((schedule, i) => (
                <motion.div
                  key={schedule.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                  className="flex items-center gap-4 rounded-lg border border-border/40 bg-bg-elevated p-4"
                >
                  <button
                    onClick={() =>
                      toggleMut.mutate({ id: schedule.id, enabled: !schedule.enabled })
                    }
                    className="shrink-0"
                    title={schedule.enabled ? 'Disable' : 'Enable'}
                  >
                    {schedule.enabled ? (
                      <ToggleRight className="h-6 w-6 text-success" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-fg-subtle" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <h5 className="font-label text-sm font-medium text-fg capitalize">
                      {schedule.task_type.replace(/_/g, ' ')}
                    </h5>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      Every {schedule.interval_hours}h
                      {schedule.last_run_at && (
                        <> &middot; Last run{' '}
                          {formatDistanceToNow(new Date(schedule.last_run_at), { addSuffix: true })}
                        </>
                      )}
                    </p>
                  </div>

                  <button
                    onClick={() => runNowMut.mutate(schedule.id)}
                    disabled={runNowMut.isPending}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5',
                      'text-xs font-medium text-fg',
                      'hover:bg-bg-sunken disabled:opacity-50 transition-colors',
                    )}
                  >
                    {runNowMut.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    Run Now
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Task history */}
      <div>
        <h4 className="font-label text-sm font-medium text-fg mb-3">Recent Task History</h4>

        {historyQuery.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-bg-sunken" />
            ))}
          </div>
        )}

        {!historyQuery.isLoading && history.length === 0 && (
          <p className="rounded-lg border border-border/40 bg-bg-elevated p-4 text-sm text-fg-muted">
            No task history yet.
          </p>
        )}

        {!historyQuery.isLoading && history.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-bg-sunken/50">
                  <th className="px-4 py-2.5 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                    Task
                  </th>
                  <th className="px-4 py-2.5 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                    Status
                  </th>
                  <th className="px-4 py-2.5 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 20).map((entry) => (
                  <tr key={entry.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-label text-sm text-fg capitalize">
                      {entry.task_type.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={entry.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-fg-muted">
                      {entry.started_at
                        ? formatDistanceToNow(new Date(entry.started_at), { addSuffix: true })
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Tool Logs Tab                                                              */
/* -------------------------------------------------------------------------- */

function ToolLogsTab() {
  const logsQuery = useQuery({
    queryKey: ['tool-call-logs'],
    queryFn: () => getToolCallLogs({ limit: 100 }),
  })

  const logs: ToolCallLog[] = logsQuery.data?.logs ?? logsQuery.data ?? []

  if (logsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-bg-sunken" />
        ))}
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <EmptyState
        icon={Terminal}
        title="No tool call logs"
        description="Tool execution logs will appear here when agents use tools."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-bg-sunken/50">
            <th className="px-4 py-2.5 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
              Tool
            </th>
            <th className="px-4 py-2.5 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
              Status
            </th>
            <th className="px-4 py-2.5 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
              Duration
            </th>
            <th className="px-4 py-2.5 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
              Time
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.slice(0, 50).map((log) => (
            <tr key={log.id} className="border-b border-border/50 last:border-0">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5 text-fg-subtle shrink-0" />
                  <span className="font-mono text-sm text-fg">{log.tool_name}</span>
                </div>
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={log.status ?? 'unknown'} />
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">
                {log.duration_ms != null ? `${log.duration_ms}ms` : '-'}
              </td>
              <td className="px-4 py-2.5 text-xs text-fg-muted">
                {log.created_at
                  ? formatDistanceToNow(new Date(log.created_at), { addSuffix: true })
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* HITL History Tab                                                           */
/* -------------------------------------------------------------------------- */

function HITLHistoryTab() {
  const historyQuery = useQuery({
    queryKey: ['hitl-history'],
    queryFn: () => getHITLHistory({ limit: 100 }),
  })

  const entries: HITLEntry[] = historyQuery.data ?? []

  if (historyQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-bg-sunken" />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No HITL history"
        description="Human-in-the-loop approval requests will appear here."
      />
    )
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <Check className="h-3.5 w-3.5 text-success" />
      case 'rejected':
      case 'denied':
        return <XIcon className="h-3.5 w-3.5 text-danger" />
      default:
        return <AlertTriangle className="h-3.5 w-3.5 text-warning" />
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-bg-sunken/50">
            <th className="px-4 py-2.5 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
              Tool
            </th>
            <th className="px-4 py-2.5 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
              Action
            </th>
            <th className="px-4 py-2.5 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
              Risk
            </th>
            <th className="px-4 py-2.5 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
              Status
            </th>
            <th className="px-4 py-2.5 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
              Requested
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.slice(0, 50).map((entry) => (
            <tr key={entry.id} className="border-b border-border/50 last:border-0">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-fg-subtle shrink-0" />
                  <span className="font-mono text-sm text-fg">{entry.tool_id}</span>
                </div>
              </td>
              <td className="px-4 py-2.5 text-sm text-fg-muted max-w-xs truncate">
                {entry.action_summary || '-'}
              </td>
              <td className="px-4 py-2.5">
                {entry.risk_level ? (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                      entry.risk_level === 'high'
                        ? 'bg-danger/10 text-danger'
                        : entry.risk_level === 'medium'
                          ? 'bg-warning/10 text-warning'
                          : 'bg-bg-sunken text-fg-muted',
                    )}
                  >
                    {entry.risk_level}
                  </span>
                ) : (
                  <span className="text-xs text-fg-subtle">-</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  {statusIcon(entry.status)}
                  <span className="text-sm text-fg capitalize">{entry.status}</span>
                </div>
              </td>
              <td className="px-4 py-2.5 text-xs text-fg-muted">
                {entry.created_at
                  ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

const TABS = ['Jobs', 'Tool Logs', 'HITL History'] as const
type Tab = (typeof TABS)[number]

const TAB_ICONS: Record<Tab, typeof Clock> = {
  Jobs: Clock,
  'Tool Logs': Terminal,
  'HITL History': ShieldCheck,
}

export default function AdvancedPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Jobs')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">Advanced</h2>
        <p className="text-sm text-fg-muted">
          Scheduled jobs, tool execution logs, and human-in-the-loop history
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-lg bg-bg-sunken p-0.5">
        {TABS.map((tab) => {
          const Icon = TAB_ICONS[tab]
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-4 py-2 font-label text-xs font-medium transition-colors',
                activeTab === tab
                  ? 'bg-bg-elevated text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'Jobs' && <JobsTab />}
      {activeTab === 'Tool Logs' && <ToolLogsTab />}
      {activeTab === 'HITL History' && <HITLHistoryTab />}
    </div>
  )
}
