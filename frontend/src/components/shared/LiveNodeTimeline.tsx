import { useEffect, useRef, useState, useCallback } from 'react'
import { Bot, Download, Diamond, Wifi, WifiOff, CheckCircle2, XCircle, Loader2, Brain, Wrench } from 'lucide-react'
import { TimelineBadge } from './TimelineBadge'
import { listRunEvents } from '@/lib/api'

interface SubEvent {
  id: string
  event_type: string
  payload: Record<string, unknown>
  timestamp: string
}

interface NodeEntry {
  node_key: string
  node_type: 'agent' | 'sink' | 'unknown'
  status: 'running' | 'completed' | 'failed'
  child_run_id?: string
  output_preview?: string
  error?: string
  sub_events: SubEvent[]
}

interface LiveNodeTimelineProps {
  runId: string
}

function NodeIcon({ nodeType }: { nodeType: string }) {
  if (nodeType === 'sink') return <Download className="w-3.5 h-3.5 text-purple-400" />
  return <Bot className="w-3.5 h-3.5 text-accent" />
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
  if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-red-400" />
  return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
}

function SubEventIcon({ eventType }: { eventType: string }) {
  if (eventType === 'thinking' || eventType === 'step_started') return <Brain className="w-3 h-3 text-muted-foreground" />
  if (eventType === 'tool_call' || eventType === 'step_completed') return <Wrench className="w-3 h-3 text-accent/70" />
  return <Diamond className="w-3 h-3 text-muted-foreground/50" />
}

function formatSubEvent(ev: SubEvent): string {
  const p = ev.payload
  if (ev.event_type === 'run_started') return `Agent started${p.agent_slug ? ` (${p.agent_slug})` : ''}`
  if (ev.event_type === 'step_started') return `Step ${p.step_index ?? ''} started`
  if (ev.event_type === 'step_completed') return `Step ${p.step_index ?? ''} completed`
  if (ev.event_type === 'run_completed') return `Agent completed`
  if (ev.event_type === 'run_failed') return `Agent failed: ${(p.error as string) ?? 'unknown error'}`
  if (ev.event_type === 'tool_call') return `Tool: ${p.tool_name ?? 'unknown'}`
  if (ev.event_type === 'thinking') return `Thinking...`
  return ev.event_type.replace(/_/g, ' ')
}

export default function LiveNodeTimeline({ runId }: LiveNodeTimelineProps) {
  const [nodes, setNodes] = useState<Map<string, NodeEntry>>(new Map())
  const [connected, setConnected] = useState(false)
  const [expandedNode, setExpandedNode] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const childWsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const userPinnedRef = useRef(false)
  const processEventRef = useRef<(eventType: string, payload: Record<string, unknown>, nodeKey: string | undefined) => void>(() => {})

  // Connect to parent run WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/run/${runId}/terminal`)

    ws.onopen = () => setConnected(true)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const eventType = data.event_type ?? data.type
        const payload = data.payload ?? data
        const nodeKey = payload.node_key ?? data.node_key
        processEventRef.current(eventType, payload, nodeKey)
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      setConnected(false)
      reconnectTimer.current = setTimeout(connect, 3000)
    }
    ws.onerror = () => ws.close()
    wsRef.current = ws
  }, [runId])

  // Process a single event (shared by WS handler and initial fetch)
  const processEvent = useCallback((eventType: string, payload: Record<string, unknown>, nodeKey: string | undefined) => {
    if (eventType === 'node_started' && nodeKey) {
      setNodes(prev => {
        if (prev.has(nodeKey)) return prev // skip duplicates from catch-up
        const next = new Map(prev)
        next.set(nodeKey, {
          node_key: nodeKey,
          node_type: (payload.node_type as 'agent' | 'sink') ?? 'agent',
          status: 'running',
          sub_events: [],
        })
        return next
      })
      if (!userPinnedRef.current) setExpandedNode(nodeKey)
    } else if (eventType === 'node_child_run' && nodeKey) {
      setNodes(prev => {
        const next = new Map(prev)
        const existing = next.get(nodeKey)
        if (existing) next.set(nodeKey, { ...existing, child_run_id: payload.child_run_id as string })
        return next
      })
    } else if (eventType === 'node_completed' && nodeKey) {
      setNodes(prev => {
        const next = new Map(prev)
        const existing = next.get(nodeKey)
        if (existing) next.set(nodeKey, { ...existing, status: 'completed', output_preview: payload.output_preview as string })
        return next
      })
    } else if (eventType === 'node_failed' && nodeKey) {
      setNodes(prev => {
        const next = new Map(prev)
        const existing = next.get(nodeKey)
        if (existing) next.set(nodeKey, { ...existing, status: 'failed', error: payload.error as string })
        return next
      })
    }
  }, [])
  processEventRef.current = processEvent

  useEffect(() => {
    connect()
    // Fetch existing events to catch up on missed WebSocket messages
    listRunEvents(runId).then(data => {
      for (const ev of data.events ?? []) {
        const payload = ev.payload ?? {}
        const nodeKey = (payload as Record<string, unknown>).node_key as string | undefined ?? ev.node_key
        processEvent(ev.event_type, payload as Record<string, unknown>, nodeKey)
      }
    }).catch(() => { /* ignore fetch errors */ })
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      childWsRef.current?.close()
    }
  }, [connect, runId, processEvent])

  // Connect to child run WebSocket when a node is expanded and has child_run_id
  useEffect(() => {
    childWsRef.current?.close()
    childWsRef.current = null

    if (!expandedNode) return
    const node = nodes.get(expandedNode)
    if (!node?.child_run_id || node.status !== 'running') return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/run/${node.child_run_id}/terminal`)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const subEvent: SubEvent = {
          id: `${Date.now()}-${Math.random()}`,
          event_type: data.event_type ?? data.type ?? 'info',
          payload: data.payload ?? data,
          timestamp: data.created_at ?? new Date().toISOString(),
        }
        setNodes(prev => {
          const next = new Map(prev)
          const existing = next.get(expandedNode)
          if (existing) {
            next.set(expandedNode, { ...existing, sub_events: [...existing.sub_events, subEvent] })
          }
          return next
        })
      } catch { /* ignore */ }
    }

    ws.onerror = () => ws.close()
    childWsRef.current = ws

    return () => {
      ws.close()
    }
  }, [expandedNode, nodes])

  const handleToggleNode = useCallback((nodeKey: string) => {
    userPinnedRef.current = true
    setExpandedNode(prev => prev === nodeKey ? null : nodeKey)
  }, [])

  const nodeEntries = Array.from(nodes.values())

  return (
    <div className="flex flex-col h-full rounded-2xl border border-border/25 bg-background/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/25 bg-card/30">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Live Execution
        </span>
        <div className="flex items-center gap-1.5">
          {connected ? (
            <>
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span className="text-xs text-emerald-400">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-amber-400">Reconnecting...</span>
            </>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        {nodeEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-5 h-5 text-muted-foreground/50 animate-spin mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/60">Waiting for nodes to start...</p>
            </div>
          </div>
        ) : (
          <div className="chat-workflow-stack">
            {nodeEntries.map((node) => {
              const isExpanded = expandedNode === node.node_key
              const stepType = node.node_type === 'sink' ? 'delegated' : 'tool'
              const isLive = node.status === 'running'

              return (
                <TimelineBadge
                  key={node.node_key}
                  type={stepType}
                  open={isExpanded}
                  onToggle={() => handleToggleNode(node.node_key)}
                  className={isLive ? 'chat-workflow-step-live' : ''}
                  label={
                    <span className="flex items-center gap-1.5 text-xs">
                      <NodeIcon nodeType={node.node_type} />
                      <span className="font-medium text-foreground">{node.node_key}</span>
                      <span className="text-muted-foreground/70">{node.node_type}</span>
                    </span>
                  }
                  timelineDot={
                    <span className={`chat-timeline-dot chat-timeline-dot--${stepType}`}>
                      <NodeIcon nodeType={node.node_type} />
                    </span>
                  }
                  statusIcon={<StatusIcon status={node.status} />}
                >
                  {/* Sub-events from child run WebSocket */}
                  {node.sub_events.length > 0 ? (
                    <div className="space-y-1.5 py-1">
                      {node.sub_events.map(ev => (
                        <div key={ev.id} className="flex items-start gap-2 text-xs">
                          <SubEventIcon eventType={ev.event_type} />
                          <span className="text-foreground/80">{formatSubEvent(ev)}</span>
                        </div>
                      ))}
                    </div>
                  ) : node.status === 'running' ? (
                    <p className="text-xs text-muted-foreground/60 py-1">Executing...</p>
                  ) : null}

                  {/* Output preview for completed nodes */}
                  {node.status === 'completed' && node.output_preview && (
                    <pre className="mt-2 text-[10px] text-muted-foreground/70 font-mono whitespace-pre-wrap max-h-24 overflow-hidden">
                      {node.output_preview.slice(0, 300)}
                    </pre>
                  )}

                  {/* Error for failed nodes */}
                  {node.status === 'failed' && node.error && (
                    <div className="mt-2 rounded-md bg-red-500/10 border border-red-500/20 px-2 py-1.5 text-xs text-red-400">
                      {node.error}
                    </div>
                  )}
                </TimelineBadge>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
