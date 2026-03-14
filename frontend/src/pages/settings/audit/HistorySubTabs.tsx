import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp, ChevronRight, RefreshCw,
    Wrench, History, AlertCircle, Circle,
} from 'lucide-react'
import { getTaskHistory, getToolCallLogs, getHITLHistory } from '@/lib/api'
import type { TaskLogEntry, HITLRequest, ToolCallLogEntry } from '../types'
import { TASK_LABELS, RISK_STYLES } from '../constants'
import { WorkspaceFilterSelect, StatusIcon } from '../components'

// ── HITL History ─────────────────────────────────────────────────────────────

export function HITLHistorySubTab() {
    const [filterWorkspace, setFilterWorkspace] = useState('')
    const { data: historyData, isLoading } = useQuery({
        queryKey: ['hitl-history', filterWorkspace],
        queryFn: () => getHITLHistory({ workspace_id: filterWorkspace || undefined, limit: 200 }),
    })
    const history: HITLRequest[] = historyData ?? []
    const [expandedId, setExpandedId] = useState<string | null>(null)

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-sm">Resolved HITL Requests</h3>
                <WorkspaceFilterSelect value={filterWorkspace} onChange={setFilterWorkspace} />
            </div>
            {isLoading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {!isLoading && history.length === 0 && (
                <div className="text-center py-16 text-muted-foreground glass-card rounded-xl">
                    <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No HITL history yet.</p>
                </div>
            )}

            {history.map(req => {
                const isExpanded = expandedId === req.id
                return (
                    <div key={req.id} className="glass-card rounded-xl overflow-hidden">
                        <button
                            type="button"
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                            onClick={() => setExpandedId(isExpanded ? null : req.id)}
                        >
                            {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                            {req.status === 'approved' && <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                            {req.status === 'denied' && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                            {req.status !== 'approved' && req.status !== 'denied' && <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-mono font-medium">{req.tool_id}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${RISK_STYLES[req.risk_level] ?? RISK_STYLES.medium}`}>
                                        {req.risk_level}
                                    </span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                                        req.status === 'approved'
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : req.status === 'denied'
                                                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                                : 'bg-muted/30 text-muted-foreground border-border/40'
                                    }`}>
                                        {req.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-0.5">
                                    <span className="text-[10px] text-muted-foreground/60">
                                        {new Date(req.created_at).toLocaleString()}
                                    </span>
                                    {req.resolved_at && (
                                        <span className="text-[10px] text-muted-foreground/60">
                                            Resolved: {new Date(req.resolved_at).toLocaleString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </button>

                        {isExpanded && (
                            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/40">
                                {req.action_summary && (
                                    <div>
                                        <p className="text-[10px] text-muted-foreground/70 font-medium mb-1 uppercase tracking-wide">Action Summary</p>
                                        <p className="text-xs text-foreground/80">{req.action_summary}</p>
                                    </div>
                                )}

                                {req.tool_input && Object.keys(req.tool_input).length > 0 && (
                                    <div>
                                        <p className="text-[10px] text-muted-foreground/70 font-medium mb-1 uppercase tracking-wide">Input Parameters</p>
                                        <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-foreground/60 bg-muted/30 rounded-lg p-3 border border-border/40 max-h-48 overflow-y-auto">
                                            {JSON.stringify(req.tool_input, null, 2)}
                                        </pre>
                                    </div>
                                )}

                                {req.resolution_note && (
                                    <div>
                                        <p className="text-[10px] text-muted-foreground/70 font-medium mb-1 uppercase tracking-wide">User Note</p>
                                        <p className="text-xs text-foreground/70 bg-muted/20 rounded-lg px-3 py-2 border border-border/30">{req.resolution_note}</p>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3 text-[10px]">
                                    <div>
                                        <span className="text-muted-foreground/70 font-medium uppercase tracking-wide">Conversation</span>
                                        <p className="font-mono text-foreground/60 mt-0.5">{req.conversation_id}</p>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground/70 font-medium uppercase tracking-wide">Workspace</span>
                                        <p className="font-mono text-foreground/60 mt-0.5">{req.workspace_id}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// ── Job History ──────────────────────────────────────────────────────────────

export function JobHistorySubTab() {
    const [filterType, setFilterType] = useState('')
    const [filterWorkspace, setFilterWorkspace] = useState('')
    const { data: history = [], isLoading, refetch } = useQuery<TaskLogEntry[]>({
        queryKey: ['task-history', filterType, filterWorkspace],
        queryFn: () => getTaskHistory({ task_type: filterType || undefined, workspace_id: filterWorkspace || undefined, limit: 100 }),
        refetchInterval: (query) => {
            const d = query.state.data as TaskLogEntry[] | undefined
            const active = d?.some(l => l.status === 'running')
            return active ? 5000 : false
        },
    })

    const formatDuration = (ms: number | null) => {
        if (!ms) return '\u2014'
        if (ms < 1000) return `${ms}ms`
        return `${(ms / 1000).toFixed(1)}s`
    }
    const isExternalTarget = (value: string) => /^https?:\/\//i.test(value)

    return (
        <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">Background Task Executions</h3>
                </div>
                <div className="flex items-center gap-2">
                    <WorkspaceFilterSelect value={filterWorkspace} onChange={setFilterWorkspace} />
                    <select
                        className="input text-xs py-1.5 pr-7 w-auto"
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                    >
                        <option value="">All tasks</option>
                        {Object.entries(TASK_LABELS).map(([id, label]) => (
                            <option key={id} value={id}>{label}</option>
                        ))}
                    </select>
                    <button
                        className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5"
                        onClick={() => refetch()}
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                </div>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {!isLoading && (history as TaskLogEntry[]).length === 0 && (
                <div className="text-center py-14 text-muted-foreground glass-card rounded-xl">
                    <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No task history yet. Run a task to see it here.</p>
                </div>
            )}

            {!isLoading && (history as TaskLogEntry[]).length > 0 && (
                <div className="space-y-2">
                    {(history as TaskLogEntry[]).map(log => (
                        <div key={log.id} className="glass-card px-4 py-3 flex items-start gap-3 rounded-xl border-border/50">
                            <StatusIcon status={log.status} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium">{TASK_LABELS[log.task_type] ?? log.task_type}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${log.status === 'done' ? 'bg-emerald-500/10 text-emerald-400' :
                                        log.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                                            log.status === 'running' ? 'bg-blue-500/10 text-blue-400' :
                                                'bg-muted text-muted-foreground'
                                        }`}>
                                        {log.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                                    <span>{new Date(log.started_at).toLocaleString()}</span>
                                    {log.duration_ms !== null && <span>Duration: {formatDuration(log.duration_ms)}</span>}
                                    {log.item_count !== null && <span>{log.item_count} items</span>}
                                </div>
                                {log.target_link && (
                                    <div className="mt-1 text-[10px] text-muted-foreground">
                                        <span className="mr-1">Target:</span>
                                        <a
                                            href={log.target_link}
                                            target={isExternalTarget(log.target_link) ? '_blank' : undefined}
                                            rel={isExternalTarget(log.target_link) ? 'noreferrer' : undefined}
                                            className="text-accent hover:underline break-all"
                                            title={log.target_link}
                                        >
                                            {log.target_link}
                                        </a>
                                    </div>
                                )}
                                {log.error_message && (
                                    <p className="text-[10px] text-red-400 mt-1 font-mono truncate" title={log.error_message}>
                                        {log.error_message}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Tool Call Logs ───────────────────────────────────────────────────────────

export function ToolCallLogsSubTab() {
    const [filterTool, setFilterTool] = useState('')
    const [filterWorkspace, setFilterWorkspace] = useState('')
    const [expanded, setExpanded] = useState<string | null>(null)

    const { data: logs = [], isLoading, refetch } = useQuery<ToolCallLogEntry[]>({
        queryKey: ['tool-call-logs', filterTool, filterWorkspace],
        queryFn: () => getToolCallLogs({ tool_name: filterTool || undefined, workspace_id: filterWorkspace || undefined, limit: 100 }),
        refetchInterval: false,
    })

    const formatDuration = (ms: number | null) => {
        if (!ms) return '\u2014'
        if (ms < 1000) return `${ms}ms`
        return `${(ms / 1000).toFixed(1)}s`
    }

    const toolNames = Array.from(new Set((logs as ToolCallLogEntry[]).map(l => l.tool_name))).sort()

    return (
        <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-sm">Agent Tool Call Executions</h3>
                <div className="flex items-center gap-2">
                    <WorkspaceFilterSelect value={filterWorkspace} onChange={setFilterWorkspace} />
                    <select
                        className="input text-xs py-1.5 pr-7 w-auto"
                        value={filterTool}
                        onChange={e => setFilterTool(e.target.value)}
                    >
                        <option value="">All tools</option>
                        {toolNames.map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                    <button className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5" onClick={() => refetch()}>
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                </div>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {!isLoading && (logs as ToolCallLogEntry[]).length === 0 && (
                <div className="text-center py-14 text-muted-foreground glass-card rounded-xl">
                    <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No tool calls logged yet. Enable agent mode and run a chat to see logs here.</p>
                </div>
            )}

            {!isLoading && (logs as ToolCallLogEntry[]).length > 0 && (
                <div className="space-y-2">
                    {(logs as ToolCallLogEntry[]).map(log => {
                        const isOpen = expanded === log.id
                        const category = log.tool_name.split('.')[0] ?? log.tool_name
                        const action = log.tool_name.split('.').slice(1).join('.')
                        return (
                            <div key={log.id} className="glass-card rounded-xl border-border/50 overflow-hidden">
                                <button
                                    type="button"
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                                    onClick={() => setExpanded(isOpen ? null : log.id)}
                                >
                                    {isOpen
                                        ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                                    {log.success === true
                                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                        : log.success === false
                                            ? <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                            : <Circle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium">
                                            <span className="text-muted-foreground">{category}</span>
                                            {action && <><span className="text-muted-foreground/50">.</span><span>{action}</span></>}
                                        </span>
                                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                                            <span>{new Date(log.started_at).toLocaleString()}</span>
                                            {log.duration_ms !== null && <span>{formatDuration(log.duration_ms)}</span>}
                                            <span className="font-mono truncate max-w-[180px]" title={log.conversation_id}>
                                                conv: {log.conversation_id.slice(0, 8)}…
                                            </span>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${log.success === true ? 'bg-emerald-500/10 text-emerald-400' : log.success === false ? 'bg-red-500/10 text-red-400' : 'bg-muted text-muted-foreground'}`}>
                                        {log.success === true ? 'success' : log.success === false ? 'failed' : 'unknown'}
                                    </span>
                                </button>

                                {isOpen && (
                                    <div className="border-t border-border/40 px-4 py-3 space-y-3 animate-fade-in">
                                        <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                                            <div><span className="text-foreground/60">Call ID:</span> <span className="font-mono">{log.call_id}</span></div>
                                            <div><span className="text-foreground/60">Conversation:</span> <span className="font-mono">{log.conversation_id}</span></div>
                                            {log.started_at && <div><span className="text-foreground/60">Started:</span> {new Date(log.started_at).toLocaleString()}</div>}
                                            {log.finished_at && <div><span className="text-foreground/60">Finished:</span> {new Date(log.finished_at).toLocaleString()}</div>}
                                            {log.duration_ms !== null && <div><span className="text-foreground/60">Duration:</span> {formatDuration(log.duration_ms)}</div>}
                                        </div>

                                        {log.arguments && Object.keys(log.arguments).length > 0 && (
                                            <div>
                                                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">Request (Arguments)</div>
                                                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-foreground/70 bg-muted/30 rounded-lg p-3 max-h-48 border border-border/40">
                                                    {JSON.stringify(log.arguments, null, 2)}
                                                </pre>
                                            </div>
                                        )}

                                        {log.success && log.output !== null && (
                                            <div>
                                                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">Response (Output)</div>
                                                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-foreground/70 bg-muted/30 rounded-lg p-3 max-h-64 border border-border/40">
                                                    {log.output}
                                                </pre>
                                            </div>
                                        )}

                                        {!log.success && log.error && (
                                            <div>
                                                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">Response (Error)</div>
                                                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-red-400 bg-red-500/10 rounded-lg p-3 max-h-32 border border-red-500/20">
                                                    {log.error}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
