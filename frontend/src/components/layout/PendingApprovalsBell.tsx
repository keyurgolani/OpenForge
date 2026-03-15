import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { Check, Clock, ExternalLink, ShieldAlert, ShieldCheck, X } from 'lucide-react'

import { approveHITL, countPendingHITL, denyHITL, listPendingHITL } from '@/lib/api'
import { chatRoute } from '@/lib/routes'
import { InputSection } from '@/components/shared/ToolCallCard'

type PendingRequest = {
  id: string
  workspace_id: string
  conversation_id: string
  tool_id: string
  tool_input: Record<string, unknown>
  action_summary: string
  risk_level: string
  agent_id?: string | null
  status: string
  created_at: string
}

export function PendingApprovalsBell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement | null>(null)

  const { data: hitlCountData } = useQuery({
    queryKey: ['hitl-pending-count'],
    queryFn: countPendingHITL,
    refetchInterval: 5000,
  })
  const pendingCount = hitlCountData?.pending ?? 0

  const { data: pendingRequests = [] } = useQuery<PendingRequest[]>({
    queryKey: ['hitl-pending-list'],
    queryFn: () => listPendingHITL(),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  })

  const invalidateApprovals = () => {
    queryClient.invalidateQueries({ queryKey: ['hitl-pending-count'] })
    queryClient.invalidateQueries({ queryKey: ['hitl-pending-list'] })
    queryClient.invalidateQueries({ queryKey: ['hitl-pending'] })
  }

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => approveHITL(id, note),
    onMutate: ({ id }) => setProcessing(prev => new Set(prev).add(id)),
    onSettled: (_data, _error, { id }) => {
      setProcessing(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setNotes(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      invalidateApprovals()
    },
  })

  const denyMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => denyHITL(id, note),
    onMutate: ({ id }) => setProcessing(prev => new Set(prev).add(id)),
    onSettled: (_data, _error, { id }) => {
      setProcessing(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setNotes(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      invalidateApprovals()
    },
  })

  useEffect(() => {
    if (pendingCount === 0) {
      setOpen(false)
    }
  }, [pendingCount])

  useEffect(() => {
    if (!open) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  if (pendingCount === 0) {
    return null
  }

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        className="relative"
        initial={{ opacity: 0, scale: 0.6, x: 20 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.6, x: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22, mass: 0.8 }}
      >
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="relative rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-amber-300 transition-colors hover:bg-amber-500/20"
          aria-label={`${pendingCount} pending approval requests`}
          title={`${pendingCount} pending approval${pendingCount > 1 ? 's' : ''}`}
        >
          <ShieldAlert className="h-4 w-4" />
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-[199] bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-[200] mt-2 flex max-h-[70vh] w-[380px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl">
              <div className="flex flex-shrink-0 items-center justify-between border-b border-border/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-semibold">Pending Approvals</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
                {pendingRequests.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-muted-foreground">
                    <ShieldCheck className="mb-2 h-8 w-8 opacity-40" />
                    <p className="text-xs">No pending requests</p>
                  </div>
                ) : pendingRequests.map((request) => {
                  const isProcessing = processing.has(request.id)
                  let timeAgo = ''
                  try {
                    timeAgo = formatDistanceToNow(new Date(request.created_at), { addSuffix: true })
                  } catch {
                    timeAgo = ''
                  }

                  const isHighRisk = request.risk_level === 'critical' || request.risk_level === 'high'
                  const riskClassName = isHighRisk
                    ? 'bg-red-500/15 text-red-400 border-red-500/25'
                    : request.risk_level === 'medium'
                      ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25'
                      : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'

                  return (
                    <div
                      key={request.id}
                      className={`space-y-2 rounded-xl border border-border/40 bg-muted/50 p-3 transition-opacity ${isProcessing ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">{request.tool_id}</p>
                          {request.agent_id && (
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
                              {request.agent_id.replace(/_agent$/, '').split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Agent
                            </p>
                          )}
                        </div>
                        <span className={`flex-shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${riskClassName}`}>
                          {request.risk_level}
                        </span>
                      </div>

                      {request.tool_input && Object.keys(request.tool_input).length > 0 && (
                        <InputSection toolName={request.tool_id} args={request.tool_input} />
                      )}

                      <textarea
                        value={notes[request.id] ?? ''}
                        onChange={(event) => setNotes(prev => ({ ...prev, [request.id]: event.target.value }))}
                        placeholder="Optional guidance..."
                        rows={1}
                        className="w-full resize-none rounded-lg border border-border/40 bg-muted/15 px-2.5 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent/40"
                      />

                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          {timeAgo && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {timeAgo}
                            </span>
                          )}
                        </div>
                        <div className="ml-auto flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setOpen(false)
                              navigate(chatRoute(request.workspace_id, request.conversation_id))
                            }}
                            className="flex items-center gap-1 text-[10px] text-accent/70 transition-colors hover:text-accent"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => denyMutation.mutate({ id: request.id, note: notes[request.id] || undefined })}
                            disabled={isProcessing}
                            className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                            Deny
                          </button>
                          <button
                            type="button"
                            onClick={() => approveMutation.mutate({ id: request.id, note: notes[request.id] || undefined })}
                            disabled={isProcessing}
                            className="flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" />
                            Approve
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

export default PendingApprovalsBell
