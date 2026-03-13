import { useState, useEffect, useRef } from 'react'
import {
    Network, ShieldAlert, ShieldCheck, ShieldX,
    Loader2, CheckCircle2, XCircle,
} from 'lucide-react'
import { TimelineBadge } from '@/components/shared/TimelineBadge'
import { ToolCallCard } from '@/components/shared/ToolCallCard'
import { AgentTimelineDot } from './AgentTimelineDot'
import { approveHITL, denyHITL } from '@/lib/api'
import type { TimelineToolCall, TimelineEntry, HITLSubObject } from '@/hooks/useStreamingChat'

// Lazy import to break circular: AgentTimeline imports us, we import AgentTimeline
// We use a render callback instead
type RenderNestedTimeline = (props: {
    timeline: TimelineEntry[]
    depth: number
    workspaceId: string
    conversationId?: string
    isStreaming?: boolean
    readonly?: boolean
}) => React.ReactNode

interface MentionResolutionMaps {
    workspacesById: Map<string, string>
    chatsById: Map<string, string>
    knowledgeById: Map<string, string>
    knowledgeTypeById: Map<string, string>
    knowledgeWorkspaceById: Map<string, { workspaceId: string; workspaceName: string }>
    workspacesByName: Map<string, string>
    chatsByName: Map<string, string>
}

interface TimelineToolCallNodeProps {
    entry: TimelineToolCall
    workspaceId: string
    conversationId?: string
    isStreaming?: boolean
    readonly?: boolean
    depth?: number
    requestVisibility?: (el: HTMLElement | null) => void
    mentionMaps?: MentionResolutionMaps
    renderNestedTimeline?: RenderNestedTimeline
    renderContent?: (content: string) => string
}

// ── Inline HITL Section ──────────────────────────────────────────────────────

function HITLInlineSection({
    hitl,
    readonly = false,
}: {
    hitl: HITLSubObject
    readonly?: boolean
}) {
    const [loading, setLoading] = useState(false)
    const [localStatus, setLocalStatus] = useState<'pending' | 'approved' | 'denied'>(hitl.status)
    const [reason, setReason] = useState('')

    useEffect(() => { setLocalStatus(hitl.status) }, [hitl.status])

    const handleApprove = async () => {
        setLoading(true)
        try {
            await approveHITL(hitl.hitl_id, reason || undefined)
            setLocalStatus('approved')
        } catch { /* swallow */ } finally {
            setLoading(false)
        }
    }

    const handleDeny = async () => {
        setLoading(true)
        try {
            await denyHITL(hitl.hitl_id, reason || undefined)
            setLocalStatus('denied')
        } catch { /* swallow */ } finally {
            setLoading(false)
        }
    }

    return (
        <div className="border-t border-accent/10 px-4 py-3 space-y-2">
            {/* Header: HITL badge + risk + status */}
            <div className="flex items-center gap-2 text-[11px]">
                <ShieldAlert className="h-3 w-3 text-amber-400 shrink-0" />
                <span className="text-amber-400/80 font-medium shrink-0">HITL</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-medium ${
                    hitl.risk_level === 'high' ? 'bg-red-500/15 text-red-400'
                    : hitl.risk_level === 'medium' ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-emerald-500/15 text-emerald-400'
                }`}>{hitl.risk_level || 'low'}</span>
                <span className={`capitalize text-[11px] ${localStatus === 'approved' ? 'text-emerald-400' : localStatus === 'denied' ? 'text-red-400' : 'text-foreground/55'}`}>{localStatus}</span>
            </div>

            {/* Pending: guidance textarea + action buttons */}
            {!readonly && localStatus === 'pending' && (
                <div className="space-y-2">
                    <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="Optional: add guidance for the agent..."
                        rows={2}
                        className="w-full rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-accent/40"
                    />
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleApprove}
                            disabled={loading}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                            Approve
                        </button>
                        <button
                            type="button"
                            onClick={handleDeny}
                            disabled={loading}
                            className="flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1 text-[11px] text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldX className="h-3 w-3" />}
                            Deny
                        </button>
                    </div>
                </div>
            )}

            {/* Resolved: confirmation + guidance */}
            {localStatus !== 'pending' && (
                <div className="space-y-1.5">
                    <div className={`flex items-center gap-1.5 text-[11px] ${localStatus === 'approved' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {localStatus === 'approved' ? <ShieldCheck className="h-3 w-3" /> : <ShieldX className="h-3 w-3" />}
                        {localStatus === 'approved' ? 'Tool execution approved' : 'Tool execution denied'}
                    </div>
                    {hitl.resolution_note && (
                        <div className="text-[11px] text-muted-foreground/70 border-l-2 border-accent/30 pl-2">
                            <span className="text-[10px] uppercase tracking-wide text-accent/55 font-medium">Guidance: </span>
                            {hitl.resolution_note}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Subagent Card (agent.invoke with nested timeline) ────────────────────────

function SubagentToolCallCard({
    entry,
    workspaceId,
    conversationId,
    isStreaming = false,
    readonly = false,
    depth = 0,
    requestVisibility,
    mentionMaps,
    renderNestedTimeline,
    renderContent,
}: TimelineToolCallNodeProps) {
    const isRunning = entry.success === null || entry.success === undefined
    const [open, setOpen] = useState(isRunning)
    const [userInteracted, setUserInteracted] = useState(false)
    const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const blockRef = useRef<HTMLDivElement>(null)
    const prevSuccessRef = useRef(entry.success)

    const instruction = (entry.arguments?.instruction as string) || 'Subagent task'
    const targetWorkspaceId = entry.arguments?.workspace_id as string | undefined
    const agentId = entry.arguments?.agent_id as string | undefined
    const agentFormatted = agentId
        ? agentId.replace(/_agent$/, '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : null
    const targetWorkspaceName = targetWorkspaceId
        ? mentionMaps?.workspacesById.get(targetWorkspaceId) ?? null
        : null
    const agentDisplayName = targetWorkspaceName
        ? agentFormatted
            ? `${agentFormatted} (Workspace ${targetWorkspaceName})`
            : `Workspace ${targetWorkspaceName}`
        : agentFormatted || 'Workspace'

    const hasNestedTimeline = (entry.nested_timeline?.length ?? 0) > 0

    // Auto-collapse when result arrives
    useEffect(() => {
        if (entry.success !== null && entry.success !== undefined && (prevSuccessRef.current === null || prevSuccessRef.current === undefined)) {
            setOpen(true)
            if (!userInteracted && !autoCollapseTimer.current) {
                autoCollapseTimer.current = setTimeout(() => {
                    setOpen(false)
                    autoCollapseTimer.current = null
                }, 3000)
            }
        }
        prevSuccessRef.current = entry.success
    }, [entry.success]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => { if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current) }
    }, [])

    const toggle = () => {
        if (autoCollapseTimer.current) {
            clearTimeout(autoCollapseTimer.current)
            autoCollapseTimer.current = null
        }
        setUserInteracted(true)
        setOpen(prev => {
            const next = !prev
            if (next) {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => requestVisibility?.(blockRef.current))
                })
                window.setTimeout(() => requestVisibility?.(blockRef.current), 220)
            }
            return next
        })
    }

    const statusIcon = isRunning
        ? <Loader2 className="w-3 h-3 animate-spin text-accent/70" />
        : entry.success
            ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            : <XCircle className="w-3 h-3 text-red-400" />

    return (
        <TimelineBadge
            type="subagent"
            open={open}
            onToggle={toggle}
            timelineDot={<AgentTimelineDot type="subagent" />}
            blockRef={blockRef}
            className="chat-section-reveal"
            detailCardClassName="chat-section-reveal overflow-hidden !p-0"
            statusIcon={statusIcon}
            label={<>
                <Network className="w-3 h-3 text-purple-400" />
                <span className="text-muted-foreground/70">Agent.Invoke</span>
                <span className="text-muted-foreground/40 mx-0.5">·</span>
                <span>Subagent: {agentDisplayName}</span>
            </>}
        >
            {/* Request */}
            <div className="px-4 pt-3 pb-2 border-b border-accent/10">
                <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/60">Request</div>
                <pre className="text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words font-sans">
                    {instruction}
                </pre>
                {targetWorkspaceId && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                        <span className="uppercase tracking-wide">workspace</span>
                        <span className="font-mono text-accent/60">{targetWorkspaceId}</span>
                    </div>
                )}
            </div>

            {/* Inline HITL */}
            {entry.hitl && (
                <HITLInlineSection
                    hitl={entry.hitl}
                    readonly={readonly}
                />
            )}

            {/* Nested timeline */}
            {hasNestedTimeline && renderNestedTimeline && (
                <div className="px-4 py-2 border-b border-accent/10">
                    <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground/60">Steps</div>
                    {renderNestedTimeline({
                        timeline: entry.nested_timeline!,
                        depth: depth + 1,
                        workspaceId: targetWorkspaceId || workspaceId,
                        conversationId: entry.subagent_conversation_id || conversationId,
                        isStreaming: isStreaming && isRunning,
                        readonly,
                    })}
                </div>
            )}

            {/* Response */}
            {entry.output && (
                <div className="px-4 pt-2 pb-3">
                    <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/60">Response</div>
                    {typeof entry.output === 'string' && entry.output.trim() ? (
                        renderContent ? (
                            <div
                                className="text-xs leading-relaxed text-foreground/85 markdown-content"
                                dangerouslySetInnerHTML={{ __html: renderContent(entry.output) }}
                            />
                        ) : (
                            <pre className="text-xs leading-relaxed text-foreground/85 whitespace-pre-wrap break-words font-sans">
                                {entry.output}
                            </pre>
                        )
                    ) : (
                        <span className="text-[11px] text-muted-foreground/40 italic">No response</span>
                    )}
                </div>
            )}

            {/* Error (when success=false and no output) */}
            {entry.success === false && entry.error && !entry.output && (
                <div className="px-4 pt-2 pb-3">
                    <div className="mb-1.5 text-[10px] uppercase tracking-wide text-red-400/70 font-medium">Error</div>
                    <span className="break-words text-[11px] text-red-400">{entry.error}</span>
                </div>
            )}
        </TimelineBadge>
    )
}

// ── Regular Tool Call (with optional inline HITL) ────────────────────────────

function RegularToolCallCard({
    entry,
    readonly = false,
    requestVisibility: _requestVisibility,
}: TimelineToolCallNodeProps) {
    const isRunning = entry.success === null || entry.success === undefined

    return (
        <div className="chat-workflow-step chat-workflow-step--iconic chat-workflow-step--tool chat-section-reveal">
            <AgentTimelineDot type={entry.hitl ? 'hitl' : 'tool'} />
            <div className="flex-1 min-w-0">
                <ToolCallCard
                    callId={entry.call_id}
                    toolName={entry.tool_name}
                    arguments={entry.arguments}
                    result={entry.success !== undefined && entry.success !== null
                        ? { success: entry.success, output: entry.output, error: entry.error ?? undefined }
                        : undefined
                    }
                    isRunning={isRunning}
                />
                {entry.hitl && (
                    <HITLInlineSection
                        hitl={entry.hitl}
                        toolId={entry.tool_name}
                        readonly={readonly}
                    />
                )}
            </div>
        </div>
    )
}

// ── Main export ──────────────────────────────────────────────────────────────

export function TimelineToolCallNode(props: TimelineToolCallNodeProps) {
    const isSubagent = props.entry.tool_name.startsWith('agent.')
    if (isSubagent) {
        return <SubagentToolCallCard {...props} />
    }
    return <RegularToolCallCard {...props} />
}
