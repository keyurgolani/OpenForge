/**
 * Deployment Timeline Adapter
 *
 * Connects to the run's WebSocket (/ws/run/{runId}/live) and
 * normalizes deployment run events into the unified TimelineItem[] format.
 *
 * Also manages child run WebSocket connections for agent loop events
 * inside each pipeline node.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { listRunEvents } from '@/lib/api'
import type {
  TimelineItem,
  ExecutionPhase,
  NodeExecutionTimelineItem,
  SinkExecutionTimelineItem,
  ThinkingTimelineItem,
  ToolCallTimelineItem,
} from '@/types/timeline'

export interface DeploymentTimelineState {
  timeline: TimelineItem[]
  phase: ExecutionPhase
  connected: boolean
}

export function useDeploymentTimelineAdapter(runId: string | null): DeploymentTimelineState {
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [phase, setPhase] = useState<ExecutionPhase>('idle')
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const childWsRefs = useRef<Map<string, WebSocket>>(new Map())
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const nodesRef = useRef<Map<string, NodeExecutionTimelineItem | SinkExecutionTimelineItem>>(new Map())

  const rebuildTimeline = useCallback(() => {
    setTimeline(Array.from(nodesRef.current.values()))
  }, [])

  const processEvent = useCallback((eventType: string, payload: Record<string, unknown>, nodeKey: string | undefined) => {
    if (eventType === 'node_started' && nodeKey) {
      if (nodesRef.current.has(nodeKey)) return // skip duplicates
      const nodeType = (payload.node_type as string) ?? 'agent'
      if (nodeType === 'sink') {
        nodesRef.current.set(nodeKey, {
          type: 'sink_execution',
          id: `sink-${nodeKey}`,
          node_key: nodeKey,
          sink_type: (payload.sink_type as string) ?? 'unknown',
          status: 'running',
        } satisfies SinkExecutionTimelineItem)
      } else {
        nodesRef.current.set(nodeKey, {
          type: 'node_execution',
          id: `node-${nodeKey}`,
          node_key: nodeKey,
          node_type: nodeType as 'agent' | 'sink' | 'unknown',
          agent_name: (payload.agent_slug as string) ?? undefined,
          status: 'running',
          children: [],
        } satisfies NodeExecutionTimelineItem)
      }
      setPhase('running')
      rebuildTimeline()
    } else if (eventType === 'node_child_run' && nodeKey) {
      const existing = nodesRef.current.get(nodeKey)
      if (existing && existing.type === 'node_execution') {
        nodesRef.current.set(nodeKey, { ...existing, child_run_id: payload.child_run_id as string })
        // Start listening to child run events
        connectChildRun(nodeKey, payload.child_run_id as string)
      }
    } else if (eventType === 'node_completed' && nodeKey) {
      const existing = nodesRef.current.get(nodeKey)
      if (existing) {
        nodesRef.current.set(nodeKey, {
          ...existing,
          status: 'complete',
          output_preview: payload.output_preview as string,
        } as typeof existing)
      }
      rebuildTimeline()
    } else if (eventType === 'node_failed' && nodeKey) {
      const existing = nodesRef.current.get(nodeKey)
      if (existing) {
        nodesRef.current.set(nodeKey, {
          ...existing,
          status: 'error',
          error: payload.error as string,
        } as typeof existing)
      }
      rebuildTimeline()
    }
  }, [rebuildTimeline])

  // Connect to child run WebSocket to get agent loop events
  const connectChildRun = useCallback((nodeKey: string, childRunId: string) => {
    // Close existing child WS for this node if any
    const existingWs = childWsRefs.current.get(nodeKey)
    if (existingWs) {
      existingWs.close()
      childWsRefs.current.delete(nodeKey)
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/run/${childRunId}/live`)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const evType = data.event_type ?? data.type ?? ''
        const evPayload = data.payload ?? data

        const node = nodesRef.current.get(nodeKey)
        if (!node || node.type !== 'node_execution') return

        const newChild = mapChildRunEventToTimelineItem(evType, evPayload)
        if (newChild) {
          const updatedChildren = [...node.children]

          // For thinking: merge into existing running thinking item
          if (newChild.type === 'thinking') {
            const last = updatedChildren[updatedChildren.length - 1]
            if (last?.type === 'thinking' && last.status === 'running') {
              // Just keep it running
              return
            }
            updatedChildren.push(newChild)
          } else {
            // Finalize any running thinking
            const lastIdx = updatedChildren.length - 1
            if (lastIdx >= 0 && updatedChildren[lastIdx]?.type === 'thinking' && updatedChildren[lastIdx].status === 'running') {
              updatedChildren[lastIdx] = { ...updatedChildren[lastIdx], status: 'complete' as const } as ThinkingTimelineItem
            }

            // For tool_call_result: update existing tool_call
            if (newChild.type === 'tool_call' && newChild.status !== 'running') {
              const existingIdx = updatedChildren.findIndex(
                (c) => c.type === 'tool_call' && c.call_id === newChild.call_id
              )
              if (existingIdx >= 0) {
                updatedChildren[existingIdx] = newChild
              } else {
                updatedChildren.push(newChild)
              }
            } else {
              updatedChildren.push(newChild)
            }
          }

          nodesRef.current.set(nodeKey, { ...node, children: updatedChildren })
          rebuildTimeline()
        }
      } catch { /* ignore parse errors */ }
    }

    ws.onerror = () => ws.close()
    childWsRefs.current.set(nodeKey, ws)
  }, [rebuildTimeline])

  // Main connection
  const connect = useCallback(() => {
    if (!runId || wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/run/${runId}/live`)

    ws.onopen = () => setConnected(true)
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const eventType = data.event_type ?? data.type
        const payload = data.payload ?? data
        const nodeKey = payload.node_key ?? data.node_key
        processEvent(eventType, payload, nodeKey)
      } catch { /* ignore */ }
    }
    ws.onclose = () => {
      setConnected(false)
      reconnectTimer.current = setTimeout(connect, 3000)
    }
    ws.onerror = () => ws.close()
    wsRef.current = ws
  }, [runId, processEvent])

  useEffect(() => {
    if (!runId) return

    connect()

    // Fetch historical events for catch-up
    listRunEvents(runId).then(data => {
      for (const ev of data.events ?? []) {
        const payload = ev.payload ?? {}
        const nodeKey = (payload as Record<string, unknown>).node_key as string | undefined ?? ev.node_key
        processEvent(ev.event_type, payload as Record<string, unknown>, nodeKey)
      }
    }).catch(() => { /* ignore */ })

    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      childWsRefs.current.forEach(ws => ws.close())
      childWsRefs.current.clear()
      nodesRef.current.clear()
    }
  }, [runId, connect, processEvent])

  // Determine phase from timeline
  useEffect(() => {
    const allNodes = Array.from(nodesRef.current.values())
    if (allNodes.length === 0) {
      setPhase('idle')
    } else if (allNodes.some(n => n.status === 'error')) {
      setPhase('error')
    } else if (allNodes.every(n => n.status === 'complete')) {
      setPhase('complete')
    } else {
      setPhase('running')
    }
  }, [timeline])

  return { timeline, phase, connected }
}


function mapChildRunEventToTimelineItem(eventType: string, payload: Record<string, unknown>): TimelineItem | null {
  if (eventType === 'thinking' || eventType === 'agent_thinking') {
    return {
      type: 'thinking',
      id: `child-thinking-${Date.now()}-${Math.random()}`,
      status: 'running',
      duration_ms: null,
      sentences: [],
    } satisfies ThinkingTimelineItem
  }

  if (eventType === 'tool_call' || eventType === 'agent_tool_call_start') {
    return {
      type: 'tool_call',
      id: `child-tool-${payload.call_id ?? Date.now()}`,
      call_id: (payload.call_id as string) ?? `${Date.now()}`,
      tool_name: (payload.tool_name as string) ?? 'unknown',
      arguments: (payload.arguments as Record<string, unknown>) ?? {},
      status: 'running',
      hitl: null,
    } satisfies ToolCallTimelineItem
  }

  if (eventType === 'agent_tool_call_result') {
    return {
      type: 'tool_call',
      id: `child-tool-${payload.call_id ?? Date.now()}`,
      call_id: (payload.call_id as string) ?? `${Date.now()}`,
      tool_name: (payload.tool_name as string) ?? 'unknown',
      arguments: {},
      status: (payload.success as boolean) ? 'complete' : 'error',
      hitl: null,
      success: payload.success as boolean,
      output: payload.output,
      error: payload.error as string | null,
      duration_ms: payload.duration_ms as number | null,
    } satisfies ToolCallTimelineItem
  }

  return null
}
