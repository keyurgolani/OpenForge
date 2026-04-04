/**
 * Mission Timeline Adapter
 *
 * Connects to the mission's WebSocket (/ws/mission/{missionId}/live) and
 * normalizes mission cycle events into the unified TimelineItem[] format.
 *
 * Also loads historical cycles from the REST API for completed cycles.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  TimelineItem,
  ExecutionPhase,
  CycleTimelineItem,
  ThinkingTimelineItem,
  ToolCallTimelineItem,
} from '@/types/timeline'

export interface MissionTimelineState {
  timeline: TimelineItem[]
  phase: ExecutionPhase
  connected: boolean
}

export function useMissionTimelineAdapter(
  missionId: string | null,
  initialCycles?: Array<Record<string, any>>,
): MissionTimelineState {
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [phase, setPhase] = useState<ExecutionPhase>('idle')
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const cyclesRef = useRef<Map<string, CycleTimelineItem>>(new Map())

  const rebuildTimeline = useCallback(() => {
    // Sort by cycle_number descending (newest first)
    const sorted = Array.from(cyclesRef.current.values())
      .sort((a, b) => b.cycle_number - a.cycle_number)
    setTimeline(sorted)
  }, [])

  // Initialize from historical cycles data (from React Query)
  // Preserve any live children (agent loop events) from the WebSocket stream
  useEffect(() => {
    if (!initialCycles) return
    const preserved = new Map(cyclesRef.current)
    cyclesRef.current.clear()
    for (const cycle of initialCycles) {
      const cycleItem = mapCycleToTimelineItem(cycle)
      // If we had live children for this cycle, keep them
      const existing = preserved.get(cycleItem.id)
      if (existing?.type === 'cycle' && existing.children.length > 0) {
        cycleItem.children = existing.children
      }
      cyclesRef.current.set(cycleItem.id, cycleItem)
    }
    rebuildTimeline()
  }, [initialCycles, rebuildTimeline])

  // WebSocket connection
  const connect = useCallback(() => {
    if (!missionId || wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/mission/${missionId}/live`)

    ws.onopen = () => {
      setConnected(true)
      // Request snapshot for state recovery
      ws.send(JSON.stringify({ type: 'stream_resume' }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const eventType = msg.type
        const data = msg.data ?? msg

        switch (eventType) {
          case 'cycle_started': {
            const cycleId = `cycle-${data.cycle_id}`
            cyclesRef.current.set(cycleId, {
              type: 'cycle',
              id: cycleId,
              cycle_number: data.cycle_number ?? 0,
              ooda_phase: 'perceive',
              status: 'running',
              started_at: data.started_at ? new Date(data.started_at).getTime() : Date.now(),
              children: [],
            })
            setPhase('running')
            rebuildTimeline()
            break
          }

          case 'cycle_phase': {
            const cycleId = `cycle-${data.cycle_id}`
            const existing = cyclesRef.current.get(cycleId)
            if (existing && existing.type === 'cycle') {
              cyclesRef.current.set(cycleId, {
                ...existing,
                ooda_phase: data.phase ?? existing.ooda_phase,
              })
              rebuildTimeline()
            }
            break
          }

          case 'cycle_agent_event': {
            const cycleId = `cycle-${data.cycle_id}`
            const existing = cyclesRef.current.get(cycleId)
            if (existing && existing.type === 'cycle') {
              const innerEvent = data.event ?? data
              const newChild = mapAgentEventToTimelineItem(innerEvent)
              if (newChild) {
                const children = [...existing.children]

                if (newChild.type === 'thinking') {
                  const last = children[children.length - 1]
                  if (last?.type === 'thinking' && last.status === 'running') {
                    // Keep existing running thinking
                  } else {
                    children.push(newChild)
                  }
                } else {
                  // Finalize running thinking
                  const lastIdx = children.length - 1
                  if (lastIdx >= 0 && children[lastIdx]?.type === 'thinking' && children[lastIdx].status === 'running') {
                    children[lastIdx] = { ...children[lastIdx], status: 'complete' } as ThinkingTimelineItem
                  }

                  if (newChild.type === 'tool_call' && newChild.status !== 'running') {
                    const existingIdx = children.findIndex(
                      (c) => c.type === 'tool_call' && c.call_id === (newChild as ToolCallTimelineItem).call_id
                    )
                    if (existingIdx >= 0) {
                      children[existingIdx] = newChild
                    } else {
                      children.push(newChild)
                    }
                  } else {
                    children.push(newChild)
                  }
                }

                cyclesRef.current.set(cycleId, { ...existing, children })
                rebuildTimeline()
              }
            }
            break
          }

          case 'cycle_completed': {
            const cycleId = `cycle-${data.cycle_id}`
            const existing = cyclesRef.current.get(cycleId)
            const base = existing?.type === 'cycle' ? existing : {
              type: 'cycle' as const,
              id: cycleId,
              cycle_number: data.cycle_number ?? 0,
              children: [],
              started_at: undefined,
            }
            cyclesRef.current.set(cycleId, {
              ...base,
              type: 'cycle',
              status: 'complete',
              ooda_phase: 'completed',
              phase_summaries: data.phase_summaries ?? {},
              evaluation_scores: data.evaluation_scores ?? {},
              ratchet_passed: data.ratchet_passed ?? null,
              actions_log: data.actions_log ?? [],
              next_cycle_reason: data.next_cycle_reason ?? undefined,
              duration_ms: data.duration_seconds ? data.duration_seconds * 1000 : null,
            })
            rebuildTimeline()
            break
          }

          case 'cycle_failed': {
            const cycleId = `cycle-${data.cycle_id}`
            const existing = cyclesRef.current.get(cycleId)
            if (existing && existing.type === 'cycle') {
              cyclesRef.current.set(cycleId, {
                ...existing,
                status: 'error',
              })
            }
            rebuildTimeline()
            break
          }

          case 'mission_snapshot': {
            const snapshotData = data
            if (snapshotData.active_cycle) {
              const ac = snapshotData.active_cycle
              const cycleId = `cycle-${ac.cycle_id}`
              const status = ac.status === 'completed' ? 'complete' as const
                : ac.status === 'failed' ? 'error' as const
                : 'running' as const

              cyclesRef.current.set(cycleId, {
                type: 'cycle',
                id: cycleId,
                cycle_number: ac.cycle_number ?? 0,
                ooda_phase: ac.phase ?? 'perceive',
                status,
                children: [],
                phase_summaries: ac.phase_summaries ?? undefined,
                evaluation_scores: ac.evaluation_scores ?? undefined,
                ratchet_passed: ac.ratchet_passed ?? null,
                actions_log: ac.actions_log ?? undefined,
                next_cycle_reason: ac.next_cycle_reason ?? undefined,
                duration_ms: ac.duration_seconds ? ac.duration_seconds * 1000 : null,
              })
              rebuildTimeline()
            }
            break
          }

          case 'pong':
            break

          default:
            break
        }
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      setConnected(false)
      reconnectTimer.current = setTimeout(connect, 3000)
    }
    ws.onerror = () => ws.close()
    wsRef.current = ws
  }, [missionId, rebuildTimeline])

  useEffect(() => {
    if (!missionId) return
    connect()

    // Ping keepalive
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 20000)

    return () => {
      clearTimeout(reconnectTimer.current)
      clearInterval(pingInterval)
      wsRef.current?.close()
    }
  }, [missionId, connect])

  // Determine phase
  useEffect(() => {
    const cycles = Array.from(cyclesRef.current.values())
    if (cycles.length === 0) {
      setPhase('idle')
    } else if (cycles.some(c => c.status === 'running')) {
      setPhase('running')
    } else if (cycles.some(c => c.status === 'error')) {
      setPhase('error')
    } else {
      setPhase('complete')
    }
  }, [timeline])

  return { timeline, phase, connected }
}


function mapCycleToTimelineItem(cycle: Record<string, any>): CycleTimelineItem {
  const rawPhases = cycle.phase_summaries ?? {}
  let phases: Record<string, string> = {}

  if (rawPhases.raw_output) {
    // Try to re-extract structured OODA phases from raw_output
    phases = tryExtractPhasesFromRaw(rawPhases.raw_output) ?? {}
  } else {
    // Filter to only OODA phase keys
    for (const key of ['perceive', 'plan', 'act', 'evaluate', 'reflect']) {
      if (rawPhases[key]) phases[key] = String(rawPhases[key])
    }
  }

  return {
    type: 'cycle',
    id: `cycle-${cycle.id}`,
    cycle_number: cycle.cycle_number ?? 0,
    ooda_phase: cycle.status === 'completed' ? 'completed' : (cycle.phase as any) ?? 'perceive',
    status: cycle.status === 'completed' ? 'complete' : cycle.status === 'failed' ? 'error' : 'running',
    started_at: cycle.started_at ? new Date(cycle.started_at).getTime() : undefined,
    duration_ms: cycle.duration_seconds ? cycle.duration_seconds * 1000 : null,
    children: [],
    phase_summaries: Object.keys(phases).length > 0 ? phases : undefined,
    evaluation_scores: cycle.evaluation_scores ?? undefined,
    ratchet_passed: cycle.ratchet_passed ?? null,
    actions_log: cycle.actions_log ?? undefined,
    next_cycle_reason: cycle.next_cycle_reason ?? undefined,
  }
}


/**
 * Attempt to extract structured OODA phases from raw agent output text.
 * Looks for the ```mission_output JSON block (last match) and parses it.
 */
function tryExtractPhasesFromRaw(rawOutput: string): Record<string, string> | null {
  if (typeof rawOutput !== 'string') return null
  const OODA_KEYS = ['perceive', 'plan', 'act', 'evaluate', 'reflect']

  // Find all ```mission_output blocks, use the last one
  const matches = [...rawOutput.matchAll(/```mission_output\s*\n([\s\S]*?)```/g)]
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1]
    try {
      const parsed = JSON.parse(lastMatch[1].trim())
      // Check for phase_summaries nested key
      const source = parsed.phase_summaries ?? parsed
      const phases: Record<string, string> = {}
      for (const key of OODA_KEYS) {
        if (source[key]) phases[key] = String(source[key])
      }
      if (Object.keys(phases).length > 0) return phases
    } catch { /* JSON parse failed */ }
  }

  // Fallback: try to find OODA-like sections in raw text
  const phases: Record<string, string> = {}
  for (const key of OODA_KEYS) {
    const pattern = new RegExp(`(?:^|\\n)\\*\\*${key}\\*\\*[:\\s]*([\\s\\S]*?)(?=\\n\\*\\*(?:${OODA_KEYS.join('|')})\\*\\*|$)`, 'i')
    const m = rawOutput.match(pattern)
    if (m?.[1]) phases[key] = m[1].trim().slice(0, 500)
  }
  if (Object.keys(phases).length >= 3) return phases

  return null
}

function mapAgentEventToTimelineItem(event: Record<string, any>): TimelineItem | null {
  const evType = event.type ?? event.event_type ?? ''

  if (evType === 'thinking' || evType === 'agent_thinking') {
    return {
      type: 'thinking',
      id: `cycle-thinking-${Date.now()}-${Math.random()}`,
      status: 'running',
      duration_ms: null,
      sentences: [],
    } satisfies ThinkingTimelineItem
  }

  if (evType === 'tool_call' || evType === 'agent_tool_call_start') {
    return {
      type: 'tool_call',
      id: `cycle-tool-${event.call_id ?? Date.now()}`,
      call_id: (event.call_id as string) ?? `${Date.now()}`,
      tool_name: (event.tool_name as string) ?? 'unknown',
      arguments: (event.arguments as Record<string, unknown>) ?? {},
      status: 'running',
      hitl: null,
    } satisfies ToolCallTimelineItem
  }

  if (evType === 'agent_tool_call_result') {
    return {
      type: 'tool_call',
      id: `cycle-tool-${event.call_id ?? Date.now()}`,
      call_id: (event.call_id as string) ?? `${Date.now()}`,
      tool_name: (event.tool_name as string) ?? 'unknown',
      arguments: {},
      status: (event.success as boolean) ? 'complete' : 'error',
      hitl: null,
      success: event.success as boolean,
      output: event.output,
      error: event.error as string | null,
      duration_ms: event.duration_ms as number | null,
    } satisfies ToolCallTimelineItem
  }

  return null
}
