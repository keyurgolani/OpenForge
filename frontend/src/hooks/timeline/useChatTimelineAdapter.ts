/**
 * Chat Timeline Adapter
 *
 * Translates chat WebSocket events (via AgentEmitter) into the unified
 * TimelineItem[] format for the ExecutionTimeline component.
 *
 * This replaces the direct usage of useAgentPhase for timeline rendering,
 * while keeping useAgentPhase's phase machine for the Composer and other
 * non-timeline concerns.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentEmitter } from '@/hooks/chat/useAgentStream'
import { extractSentences } from '@/lib/thought-extractor'
import type {
  TimelineItem,
  ExecutionPhase,
  ThinkingTimelineItem,
  ToolCallTimelineItem,
  HITLTimelineItem,
  SubAgentTimelineItem,
  IntermediateResponseTimelineItem,
} from '@/types/timeline'

const AGENT_INVOKE_TOOLS = new Set(['platform.agent.invoke', 'agent.invoke'])

export interface ChatTimelineState {
  timeline: TimelineItem[]
  phase: ExecutionPhase
  currentThought: string | null
  allThoughts: string[]
  thinkingDuration: number | null
  modelInfo: {
    providerName: string
    providerDisplayName: string
    model: string
    isOverride: boolean
    systemPrompt?: string
  } | null
  reset: () => void
  handleThoughtsDrained: () => void
}

export function useChatTimelineAdapter(emitter: AgentEmitter): ChatTimelineState {
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [phase, setPhase] = useState<ExecutionPhase>('idle')
  const [thinkingDuration, setThinkingDuration] = useState<number | null>(null)
  const [modelInfo, setModelInfo] = useState<ChatTimelineState['modelInfo']>(null)
  const [currentThought, setCurrentThought] = useState<string | null>(null)
  const [allThoughts, setAllThoughts] = useState<string[]>([])

  const phaseRef = useRef<ExecutionPhase>('idle')
  const thinkingStartRef = useRef(0)
  const tokenBufferRef = useRef<string[]>([])
  const thinkingTextRef = useRef('')
  const thinkingIdCounter = useRef(0)
  const thoughtQueueRef = useRef<string[]>([])
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])

  const finalizeActiveThinking = useCallback(() => {
    const now = Date.now()
    const { sentences, remainder } = extractSentences(thinkingTextRef.current)
    const allSentences = remainder.trim()
      ? [...sentences, remainder.trim()]
      : sentences
    thinkingTextRef.current = ''
    setTimeline((prev) => {
      const last = prev[prev.length - 1]
      if (last?.type === 'thinking' && last.status === 'running') {
        const dur = thinkingStartRef.current ? now - thinkingStartRef.current : null
        return [...prev.slice(0, -1), { ...last, status: 'complete' as const, duration_ms: dur, sentences: allSentences }]
      }
      return prev
    })
  }, [])

  const handleThoughtsDrained = useCallback(() => {
    if (phaseRef.current === 'running') {
      tokenBufferRef.current.forEach((t) => emitter.emit('token', t))
      tokenBufferRef.current = []
    }
  }, [emitter])

  // Thought queue drain logic
  const drainNext = useCallback(() => {
    if (thoughtQueueRef.current.length === 0) {
      setCurrentThought(null)
      return
    }
    const next = thoughtQueueRef.current.shift()!
    setCurrentThought(next)
    setAllThoughts(prev => [...prev, next])
    drainTimerRef.current = setTimeout(drainNext, 600)
  }, [])

  useEffect(() => {
    const onThinking = (text: string) => {
      thinkingTextRef.current += text

      // Extract sentences for the thought ticker
      const { sentences } = extractSentences(thinkingTextRef.current)
      for (const s of sentences) {
        if (s.length > 10) {
          thoughtQueueRef.current.push(s)
          if (!drainTimerRef.current) {
            drainNext()
          }
        }
      }

      if (phaseRef.current === 'idle') {
        setPhase('running')
      }

      // Use functional setTimeline to avoid race conditions:
      // multiple onThinking calls may fire before React commits setPhase,
      // so we check the actual timeline state instead of phaseRef.
      setTimeline((prev) => {
        const last = prev[prev.length - 1]
        if (last?.type === 'thinking' && last.status === 'running') {
          return prev // Already have a running thinking entry
        }
        thinkingStartRef.current = Date.now()
        thinkingIdCounter.current++
        return [
          ...prev,
          {
            type: 'thinking' as const,
            id: `thinking-${thinkingIdCounter.current}`,
            status: 'running' as const,
            duration_ms: null,
            sentences: [],
          },
        ]
      })
    }

    const onToken = (_token: string) => {
      if (phaseRef.current === 'idle') {
        setPhase('running')
      }
      if (thinkingStartRef.current) {
        finalizeActiveThinking()
        setThinkingDuration(Date.now() - thinkingStartRef.current)
        thinkingStartRef.current = 0
      }
    }

    const onToolCallStart = (data: { call_id: string; tool_name: string; arguments: Record<string, unknown> }) => {
      finalizeActiveThinking()
      if (thinkingStartRef.current) {
        setThinkingDuration(Date.now() - thinkingStartRef.current)
      }
      thinkingStartRef.current = 0
      setPhase('running')

      const isSubagent = AGENT_INVOKE_TOOLS.has(data.tool_name)

      if (isSubagent) {
        const agentName = (data.arguments?.agent_slug ?? data.arguments?.agent_id ?? 'Agent') as string
        setTimeline((prev) => [...prev, {
          type: 'subagent' as const,
          id: `subagent-${data.call_id}`,
          call_id: data.call_id,
          tool_name: data.tool_name,
          arguments: data.arguments,
          agent_name: agentName,
          status: 'running' as const,
          children: [],
        } satisfies SubAgentTimelineItem])
      } else {
        setTimeline((prev) => [...prev, {
          type: 'tool_call' as const,
          id: `tool-${data.call_id}`,
          call_id: data.call_id,
          tool_name: data.tool_name,
          arguments: data.arguments,
          status: 'running' as const,
          hitl: null,
        } satisfies ToolCallTimelineItem])
      }
    }

    const onToolCallResult = (data: { call_id: string; success: boolean; output?: unknown; error?: string | null; duration_ms?: number | null; nested_timeline?: unknown[] | null }) => {
      setTimeline((prev) => prev.map((item) => {
        if (item.type === 'tool_call' && item.call_id === data.call_id) {
          return { ...item, status: data.success ? 'complete' as const : 'error' as const, success: data.success, output: data.output, error: data.error, duration_ms: data.duration_ms }
        }
        if (item.type === 'subagent' && item.call_id === data.call_id) {
          return {
            ...item,
            status: data.success ? 'complete' as const : 'error' as const,
            success: data.success,
            output: data.output,
            error: data.error,
            duration_ms: data.duration_ms,
            children: (data.nested_timeline as TimelineItem[] | null) ?? item.children,
          }
        }
        return item
      }))
    }

    const onHitlRequest = (data: { call_id: string; hitl_id: string; action_summary: string; risk_level: string }) => {
      setTimeline((prev) => {
        const updated = prev.map((item) => {
          if ((item.type === 'tool_call' || item.type === 'subagent') && item.call_id === data.call_id) {
            return { ...item, status: 'awaiting_approval' as const }
          }
          return item
        })
        // Also add a dedicated HITL timeline item
        const toolItem = prev.find(
          (i): i is ToolCallTimelineItem | SubAgentTimelineItem =>
            (i.type === 'tool_call' || i.type === 'subagent') && i.call_id === data.call_id
        )
        updated.push({
          type: 'hitl' as const,
          id: `hitl-${data.hitl_id}`,
          hitl_id: data.hitl_id,
          call_id: data.call_id,
          action_summary: data.action_summary,
          risk_level: data.risk_level,
          tool_name: toolItem?.tool_name ?? '',
          status: 'awaiting_approval' as const,
        } satisfies HITLTimelineItem)
        return updated
      })
    }

    const onHitlResolved = (data: { call_id: string; hitl_id: string; approved: boolean; resolution_note?: string | null }) => {
      const newStatus = data.approved ? 'approved' as const : 'denied' as const
      setTimeline((prev) => prev.map((item) => {
        if ((item.type === 'tool_call' || item.type === 'subagent') && item.call_id === data.call_id) {
          return { ...item, status: newStatus }
        }
        if (item.type === 'hitl' && item.hitl_id === data.hitl_id) {
          return { ...item, status: newStatus, resolution_note: data.resolution_note ?? null }
        }
        return item
      }))
    }

    const onDone = () => {
      finalizeActiveThinking()
      setPhase('complete')
      setCurrentThought(null)
      if (drainTimerRef.current) {
        clearTimeout(drainTimerRef.current)
        drainTimerRef.current = null
      }
    }

    const onError = () => {
      finalizeActiveThinking()
      setPhase('error')
      setCurrentThought(null)
      if (drainTimerRef.current) {
        clearTimeout(drainTimerRef.current)
        drainTimerRef.current = null
      }
    }

    const onModelSelection = (data: { provider_name: string; provider_display_name?: string; model: string; is_override: boolean }) => {
      setModelInfo({
        providerName: data.provider_name,
        providerDisplayName: data.provider_display_name ?? data.provider_name,
        model: data.model,
        isOverride: data.is_override,
        systemPrompt: (data as any).system_prompt,
      })
    }

    const onIntermediateResponse = (data: { content: string }) => {
      // Finalize any active thinking before adding intermediate response
      finalizeActiveThinking()
      if (data.content) {
        setTimeline(prev => [
          ...prev,
          {
            type: 'intermediate_response' as const,
            id: `ir-${Date.now()}`,
            content: data.content,
            status: 'complete' as const,
          } satisfies IntermediateResponseTimelineItem,
        ])
      }
      thinkingStartRef.current = 0
      setThinkingDuration(null)
      tokenBufferRef.current = []
      thinkingTextRef.current = ''
    }

    const onSnapshot = (data: { content: string; thinking: string; timeline: unknown[]; status?: string }) => {
      const snapshotTimeline = Array.isArray(data.timeline) ? data.timeline : []
      const reconstructed: TimelineItem[] = []

      for (const e of snapshotTimeline) {
        const entry = e as Record<string, unknown>
        if (entry.type === 'model_selection') {
          setModelInfo({
            providerName: (entry.provider_name as string) ?? '',
            providerDisplayName: (entry.provider_display_name as string) ?? (entry.provider_name as string) ?? '',
            model: (entry.model as string) ?? '',
            isOverride: (entry.is_override as boolean) ?? false,
            systemPrompt: (entry.system_prompt as string) ?? undefined,
          })
          continue
        }
        if (entry.type === 'thinking') {
          const content = (entry.content as string) ?? ''
          reconstructed.push({
            type: 'thinking' as const,
            id: `snap-thinking-${reconstructed.length}`,
            status: 'complete' as const,
            duration_ms: (entry.duration_ms ?? entry.durationMs ?? null) as number | null,
            sentences: content ? content.split(/(?<=[.!?])\s+/).filter(Boolean) : [],
          } satisfies ThinkingTimelineItem)
        } else if (entry.type === 'tool_call') {
          const isSubagent = AGENT_INVOKE_TOOLS.has(entry.tool_name as string)
          const status = entry.success === true ? 'complete' as const
            : entry.success === false ? 'error' as const
            : entry.hitl ? 'awaiting_approval' as const
            : 'complete' as const

          if (isSubagent) {
            reconstructed.push({
              type: 'subagent' as const,
              id: `snap-subagent-${reconstructed.length}`,
              call_id: (entry.call_id as string) ?? '',
              tool_name: (entry.tool_name as string) ?? '',
              arguments: (entry.arguments as Record<string, unknown>) ?? {},
              agent_name: ((entry.arguments as any)?.agent_slug ?? (entry.arguments as any)?.agent_id ?? 'Agent') as string,
              status,
              success: (entry.success as boolean | null) ?? null,
              output: entry.output,
              error: (entry.error as string | null) ?? null,
              duration_ms: (entry.duration_ms as number | null) ?? null,
              children: (entry.nested_timeline as TimelineItem[]) ?? [],
            } satisfies SubAgentTimelineItem)
          } else {
            reconstructed.push({
              type: 'tool_call' as const,
              id: `snap-tool-${reconstructed.length}`,
              call_id: (entry.call_id as string) ?? '',
              tool_name: (entry.tool_name as string) ?? '',
              arguments: (entry.arguments as Record<string, unknown>) ?? {},
              status,
              hitl: (entry.hitl as ToolCallTimelineItem['hitl']) ?? null,
              success: (entry.success as boolean | null) ?? null,
              output: entry.output,
              error: (entry.error as string | null) ?? null,
              duration_ms: (entry.duration_ms as number | null) ?? null,
              nested_timeline: (entry.nested_timeline as TimelineItem[] | null) ?? null,
            } satisfies ToolCallTimelineItem)
          }
        }
      }

      setTimeline(reconstructed)

      // Determine phase from snapshot status field first, then fall back to heuristics
      if (data.status === 'completed' || data.status === 'cancelled') {
        setPhase('complete')
      } else if (data.status === 'failed') {
        setPhase('error')
      } else {
        // Still running — use heuristics for sub-phase
        const hasRunningTool = reconstructed.some(t => (t.type === 'tool_call' || t.type === 'subagent') && t.status === 'running')
        const hasAwaitingApproval = reconstructed.some(t => t.status === 'awaiting_approval')
        if (hasAwaitingApproval || hasRunningTool || data.content || data.thinking || reconstructed.length > 0) {
          setPhase('running')
        }
        // else stays idle
      }
    }

    const onNestedEvent = (data: { call_id?: string; call_id_path?: string[]; scope_path?: number[]; event: { type: string; data: unknown } }) => {
      const path = data.call_id_path ?? (data.call_id ? [data.call_id] : [])
      if (path.length === 0) return

      setTimeline((prev) => {
        const updated = [...prev]
        let currentLevel: TimelineItem[] = updated

        for (let depth = 0; depth < path.length; depth++) {
          const cid = path[depth]
          const idx = currentLevel.findIndex(
            (item) => (item.type === 'tool_call' || item.type === 'subagent') && item.call_id === cid,
          )
          if (idx === -1) return prev

          const item = currentLevel[idx]
          if (item.type === 'subagent') {
            const children = [...item.children]
            if (depth < path.length - 1) {
              currentLevel[idx] = { ...item, children }
              currentLevel = children
            } else {
              applyInnerEvent(children, data.event)
              currentLevel[idx] = { ...item, children }
            }
          } else if (item.type === 'tool_call') {
            const nested = [...(item.nested_timeline ?? [])]
            if (depth < path.length - 1) {
              currentLevel[idx] = { ...item, nested_timeline: nested }
              currentLevel = nested as TimelineItem[]
            } else {
              applyInnerEvent(nested as TimelineItem[], data.event)
              currentLevel[idx] = { ...item, nested_timeline: nested }
            }
          }
        }

        return updated
      })
    }

    emitter.on('thinking_chunk', onThinking)
    emitter.on('token', onToken)
    emitter.on('tool_call_start', onToolCallStart)
    emitter.on('tool_call_result', onToolCallResult)
    emitter.on('hitl_request', onHitlRequest)
    emitter.on('hitl_resolved', onHitlResolved)
    emitter.on('model_selection', onModelSelection)
    emitter.on('done', onDone)
    emitter.on('error', onError)
    emitter.on('intermediate_response', onIntermediateResponse)
    emitter.on('snapshot', onSnapshot)
    emitter.on('nested_event', onNestedEvent)

    return () => {
      emitter.off('thinking_chunk', onThinking)
      emitter.off('token', onToken)
      emitter.off('tool_call_start', onToolCallStart)
      emitter.off('tool_call_result', onToolCallResult)
      emitter.off('hitl_request', onHitlRequest)
      emitter.off('hitl_resolved', onHitlResolved)
      emitter.off('model_selection', onModelSelection)
      emitter.off('done', onDone)
      emitter.off('error', onError)
      emitter.off('intermediate_response', onIntermediateResponse)
      emitter.off('snapshot', onSnapshot)
      emitter.off('nested_event', onNestedEvent)
    }
  }, [emitter, finalizeActiveThinking, drainNext])

  const reset = useCallback(() => {
    setTimeline([])
    setPhase('idle')
    setThinkingDuration(null)
    setModelInfo(null)
    setCurrentThought(null)
    setAllThoughts([])
    thinkingStartRef.current = 0
    tokenBufferRef.current = []
    thinkingTextRef.current = ''
    thinkingIdCounter.current = 0
    thoughtQueueRef.current = []
    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current)
      drainTimerRef.current = null
    }
  }, [])

  return {
    timeline,
    phase,
    currentThought,
    allThoughts,
    thinkingDuration,
    modelInfo,
    reset,
    handleThoughtsDrained,
  }
}


function applyInnerEvent(target: TimelineItem[], inner: { type: string; data: unknown }): void {
  switch (inner.type) {
    case 'agent_thinking': {
      const last = target[target.length - 1]
      if (!last || last.type !== 'thinking' || last.status !== 'running') {
        target.push({
          type: 'thinking',
          id: `nested-thinking-${Date.now()}`,
          status: 'running',
          duration_ms: null,
          sentences: [],
        })
      }
      break
    }
    case 'agent_tool_call_start': {
      const d = inner.data as { call_id: string; tool_name: string; arguments: Record<string, unknown> }
      const lastThinking = target[target.length - 1]
      if (lastThinking?.type === 'thinking' && lastThinking.status === 'running') {
        target[target.length - 1] = { ...lastThinking, status: 'complete' }
      }
      target.push({
        type: 'tool_call',
        id: `nested-tool-${d.call_id}`,
        call_id: d.call_id,
        tool_name: d.tool_name,
        arguments: d.arguments,
        status: 'running',
        hitl: null,
      })
      break
    }
    case 'agent_tool_call_result': {
      const d = inner.data as { call_id: string; success: boolean; output?: unknown; error?: string | null; duration_ms?: number | null; nested_timeline?: unknown[] | null }
      for (let i = target.length - 1; i >= 0; i--) {
        const entry = target[i]
        if (entry.type === 'tool_call' && entry.call_id === d.call_id) {
          target[i] = {
            ...entry,
            status: d.success ? 'complete' : 'error',
            success: d.success,
            output: d.output,
            error: d.error,
            duration_ms: d.duration_ms,
            nested_timeline: (d.nested_timeline as TimelineItem[] | null) ?? entry.nested_timeline ?? null,
          }
          break
        }
      }
      break
    }
  }
}
