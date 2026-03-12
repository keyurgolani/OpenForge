/**
 * HITLFab — Floating action button for pending Human-in-the-Loop approval requests.
 * Shows a glassmorphic shield button in the bottom-right corner with a red badge
 * indicating the count of pending requests. Clicking opens a quick-approve modal.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Check, X, Clock, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
    countPendingHITL,
    listPendingHITL,
    approveHITL,
    denyHITL,
} from '@/lib/api'

interface HITLRequest {
    id: string
    workspace_id: string
    conversation_id: string
    tool_id: string
    tool_input: any
    action_summary: string
    risk_level: string
    status: string
    created_at: string
}

const riskColors: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-red-500/20 text-red-400 border-red-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
}

function getRiskColor(level: string): string {
    return riskColors[level.toLowerCase()] ?? 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30'
}

export default function HITLFab() {
    const [modalOpen, setModalOpen] = useState(false)
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
    const [notes, setNotes] = useState<Record<string, string>>({})
    const backdropRef = useRef<HTMLDivElement>(null)
    const queryClient = useQueryClient()

    // Poll pending count every 5 seconds
    const { data: countData } = useQuery({
        queryKey: ['hitl-pending-count'],
        queryFn: countPendingHITL,
        refetchInterval: 5000,
    })

    const pendingCount = countData?.count ?? 0

    // Fetch full list only when modal is open
    const { data: pendingRequests = [] } = useQuery<HITLRequest[]>({
        queryKey: ['hitl-pending-list'],
        queryFn: () => listPendingHITL(),
        enabled: modalOpen,
        refetchInterval: modalOpen ? 5000 : false,
    })

    // Approve mutation
    const approveMutation = useMutation({
        mutationFn: ({ id, note }: { id: string; note?: string }) => approveHITL(id, note),
        onMutate: ({ id }) => {
            setProcessingIds((prev) => new Set(prev).add(id))
        },
        onSettled: (_data, _err, { id }) => {
            setProcessingIds((prev) => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
            setNotes(prev => { const n = { ...prev }; delete n[id]; return n })
            queryClient.invalidateQueries({ queryKey: ['hitl-pending-count'] })
            queryClient.invalidateQueries({ queryKey: ['hitl-pending-list'] })
            queryClient.invalidateQueries({ queryKey: ['hitl-pending'] })
        },
    })

    // Deny mutation
    const denyMutation = useMutation({
        mutationFn: ({ id, note }: { id: string; note?: string }) => denyHITL(id, note),
        onMutate: ({ id }) => {
            setProcessingIds((prev) => new Set(prev).add(id))
        },
        onSettled: (_data, _err, { id }) => {
            setProcessingIds((prev) => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
            setNotes(prev => { const n = { ...prev }; delete n[id]; return n })
            queryClient.invalidateQueries({ queryKey: ['hitl-pending-count'] })
            queryClient.invalidateQueries({ queryKey: ['hitl-pending-list'] })
            queryClient.invalidateQueries({ queryKey: ['hitl-pending'] })
        },
    })

    // Bulk actions
    const handleApproveAll = useCallback(() => {
        pendingRequests.forEach((req) => {
            if (!processingIds.has(req.id)) {
                approveMutation.mutate({ id: req.id })
            }
        })
    }, [pendingRequests, processingIds, approveMutation])

    const handleDenyAll = useCallback(() => {
        pendingRequests.forEach((req) => {
            if (!processingIds.has(req.id)) {
                denyMutation.mutate({ id: req.id })
            }
        })
    }, [pendingRequests, processingIds, denyMutation])

    // Close on Escape
    useEffect(() => {
        if (!modalOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                setModalOpen(false)
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [modalOpen])

    // Lock body scroll when modal open
    useEffect(() => {
        if (modalOpen) {
            document.body.style.overflow = 'hidden'
            return () => {
                document.body.style.overflow = ''
            }
        }
    }, [modalOpen])

    // Backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === backdropRef.current) {
            setModalOpen(false)
        }
    }

    // Auto-close modal when no more pending requests
    useEffect(() => {
        if (modalOpen && pendingCount === 0 && pendingRequests.length === 0) {
            setModalOpen(false)
        }
    }, [modalOpen, pendingCount, pendingRequests.length])

    // Don't render FAB when nothing is pending
    if (pendingCount === 0 && !modalOpen) return null

    return (
        <>
            {/* Floating Action Button — right edge, vertically centered */}
            <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="fixed right-0 top-1/2 z-[9990]
                    flex items-center gap-1.5 pl-2.5 pr-1.5 py-2
                    rounded-l-xl
                    bg-amber-500/15 backdrop-blur-xl border border-r-0 border-amber-400/40
                    shadow-lg shadow-black/20
                    hover:bg-amber-500/25 hover:border-amber-400/60 hover:pl-3.5
                    active:scale-[0.97]
                    transition-all duration-200 ease-out
                    animate-hitl-fab-slide-in"
                style={{ transform: 'translateY(-50%)' }}
                aria-label={`${pendingCount} pending HITL approvals`}
            >
                <Shield className="w-4 h-4 text-amber-300" />
                <span
                    className="min-w-[18px] h-[18px] px-1
                        bg-red-500 rounded-full
                        flex items-center justify-center
                        text-[10px] font-bold text-white
                        shadow-sm shadow-red-500/30"
                    style={{
                        animation: 'hitl-badge-pop 0.2s ease-out both 0.15s',
                    }}
                >
                    {pendingCount > 99 ? '99+' : pendingCount}
                </span>
            </button>

            {/* Inline keyframes */}
            <style>{`
                @keyframes hitl-fab-slide-in {
                    from { opacity: 0; translate: 100% 0; }
                    to   { opacity: 1; translate: 0 0; }
                }
                .animate-hitl-fab-slide-in {
                    animation: hitl-fab-slide-in 0.3s ease-out both;
                }
                @keyframes hitl-badge-pop {
                    from { opacity: 0; transform: scale(0.5); }
                    to   { opacity: 1; transform: scale(1); }
                }
                @keyframes hitl-modal-backdrop-in {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes hitl-modal-panel-in {
                    from { opacity: 0; transform: scale(0.95) translateY(20px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>

            {/* Modal overlay */}
            {modalOpen &&
                createPortal(
                    <div
                        ref={backdropRef}
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
                        onClick={handleBackdropClick}
                        style={{
                            animation: 'hitl-modal-backdrop-in 0.2s ease-out both',
                        }}
                    >
                        {/* Backdrop */}
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

                        {/* Panel */}
                        <div
                            className="relative w-full max-w-lg max-h-[70vh] flex flex-col
                                bg-neutral-900/95 backdrop-blur-xl
                                border border-white/10 rounded-2xl
                                shadow-2xl shadow-black/40
                                overflow-hidden"
                            style={{
                                animation: 'hitl-modal-panel-in 0.25s ease-out both 0.05s',
                            }}
                        >
                            {/* Header */}
                            <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-semibold text-white">
                                            Pending Approvals
                                        </h2>
                                        <p className="text-xs text-neutral-400">
                                            {pendingRequests.length} request{pendingRequests.length !== 1 ? 's' : ''} awaiting review
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
                                    aria-label="Close"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Bulk actions */}
                            {pendingRequests.length > 1 && (
                                <div className="flex-shrink-0 flex items-center gap-2 px-5 py-3 border-b border-white/5 bg-white/[0.02]">
                                    <span className="text-xs text-neutral-400 mr-auto">Bulk actions</span>
                                    <button
                                        type="button"
                                        onClick={handleApproveAll}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                                            rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20
                                            hover:bg-emerald-500/25 transition-colors"
                                    >
                                        <Check className="w-3.5 h-3.5" />
                                        Approve All
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDenyAll}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                                            rounded-lg bg-red-500/15 text-red-400 border border-red-500/20
                                            hover:bg-red-500/25 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                        Deny All
                                    </button>
                                </div>
                            )}

                            {/* Scrollable request list */}
                            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
                                {pendingRequests.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-10 text-neutral-500">
                                        <Shield className="w-10 h-10 mb-3 opacity-40" />
                                        <p className="text-sm">No pending requests</p>
                                    </div>
                                )}

                                {pendingRequests.map((req) => {
                                    const isProcessing = processingIds.has(req.id)
                                    let timeAgo: string
                                    try {
                                        timeAgo = formatDistanceToNow(new Date(req.created_at), { addSuffix: true })
                                    } catch {
                                        timeAgo = 'unknown'
                                    }

                                    return (
                                        <div
                                            key={req.id}
                                            className={`
                                                rounded-xl border border-white/5 bg-white/[0.03]
                                                p-4 space-y-3 transition-opacity duration-200
                                                ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
                                            `}
                                        >
                                            {/* Top row: tool name + risk badge */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-mono font-semibold text-white truncate">
                                                        {req.tool_id}
                                                    </p>
                                                    <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">
                                                        {req.action_summary}
                                                    </p>
                                                </div>
                                                <span
                                                    className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider
                                                        rounded-md border ${getRiskColor(req.risk_level)}`}
                                                >
                                                    {req.risk_level}
                                                </span>
                                            </div>

                                            {/* Input parameters */}
                                            {req.tool_input && Object.keys(req.tool_input).length > 0 && (
                                                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-neutral-400 bg-white/[0.03] rounded-lg p-2.5 border border-white/5 max-h-32 overflow-y-auto">
                                                    {JSON.stringify(req.tool_input, null, 2)}
                                                </pre>
                                            )}

                                            {/* Guidance textarea */}
                                            <textarea
                                                value={notes[req.id] ?? ''}
                                                onChange={e => setNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                                                placeholder="Optional: add guidance for the agent..."
                                                rows={2}
                                                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white placeholder:text-neutral-500 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                                            />

                                            {/* Bottom row: time + actions */}
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="flex items-center gap-1 text-[11px] text-neutral-500">
                                                    <Clock className="w-3 h-3" />
                                                    {timeAgo}
                                                </span>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => denyMutation.mutate({ id: req.id, note: notes[req.id] || undefined })}
                                                        disabled={isProcessing}
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium
                                                            rounded-lg bg-red-500/10 text-red-400 border border-red-500/20
                                                            hover:bg-red-500/20 transition-colors
                                                            disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <X className="w-3 h-3" />
                                                        Deny
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => approveMutation.mutate({ id: req.id, note: notes[req.id] || undefined })}
                                                        disabled={isProcessing}
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium
                                                            rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
                                                            hover:bg-emerald-500/20 transition-colors
                                                            disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <Check className="w-3 h-3" />
                                                        Approve
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
        </>
    )
}
