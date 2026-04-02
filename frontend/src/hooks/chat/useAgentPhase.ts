import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentEmitter } from '@/hooks/chat/useAgentStream'
import { extractSentences } from '@/lib/thought-extractor'

export type AgentPhase =
  | 'idle'
  | 'thinking'
  | 'draining_thoughts'
  | 'tool_calling'
  | 'awaiting_approval'
  | 'responding'
  | 'complete'
  | 'error'

export interface ToolCallTimelineItem {
  type: 'tool_call'
  call_id: string
  tool_name: string
  arguments: Record<string, unknown>
  status: 'pending' | 'running' | 'complete' | 'error' | 'awaiting_approval' | 'approved' | 'denied'
  hitl?: { hitl_id: string; action_summary: string; risk_level: string; status: string; resolution_note?: string | null } | null
  success?: boolean | null
  output?: unknown
  error?: string | null
  duration_ms?: number | null
  nested_timeline?: TimelineItem[] | null
}

export interface ThinkingTimelineItem {
  type: 'thinking'
  id: string
  status: 'running' | 'complete'
  duration_ms: number | null
  sentences: string[]
}

export interface IntermediateResponseTimelineItem {
  type: 'intermediate_response'
  id: string
  content: string
}

export type TimelineItem = ToolCallTimelineItem | ThinkingTimelineItem | IntermediateResponseTimelineItem

export interface ModelInfo {
  providerName: string
  providerDisplayName: string
  model: string
  isOverride: boolean
  systemPrompt?: string
}

/**
 * useAgentPhase coordinates with useThoughtQueue via handleThoughtsDrained.
 * When thinking ends and tokens arrive, phase goes to 'draining_thoughts'.
 * Response tokens are buffered until thought queue signals drain complete,
 * then phase transitions to 'responding'.
 */
export function useAgentPhase(emitter: AgentEmitter) {
  const [phase, setPhase] = useState<AgentPhase>('idle')
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [thinkingDuration, setThinkingDuration] = useState<number | null>(null)
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const phaseRef = useRef<AgentPhase>('idle')
  const thinkingStartRef = useRef<number>(0)
  const tokenBufferRef = useRef<string[]>([])
  const thinkingTextRef = useRef('')
  const thinkingIdCounter = useRef(0)

  useEffect(() => { phaseRef.current = phase }, [phase])

  /** Finalize the current active thinking entry in the timeline */
  const finalizeActiveThinking = useCallback(() => {
    const now = Date.now()
    // Extract all sentences from accumulated thinking text
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

  // Called by useThoughtQueue when drain completes — release buffered tokens
  const handleThoughtsDrained = useCallback(() => {
    if (phaseRef.current === 'draining_thoughts') {
      setPhase('responding')
      // Flush buffered tokens to the stream renderer
      tokenBufferRef.current.forEach((t) => emitter.emit('token', t))
      tokenBufferRef.current = []
    }
  }, [emitter])

  useEffect(() => {
    const onThinking = (text: string) => {
      thinkingTextRef.current += text
      if (phaseRef.current === 'idle' || phaseRef.current === 'tool_calling') {
        thinkingStartRef.current = Date.now()
        setPhase('thinking')
        // Add a running thinking entry to the timeline
        thinkingIdCounter.current++
        setTimeline((prev) => [
          ...prev,
          {
            type: 'thinking' as const,
            id: `thinking-${thinkingIdCounter.current}`,
            status: 'running' as const,
            duration_ms: null,
            sentences: [],
          },
        ])
      }
    }

    const onToken = (token: string) => {
      if (phaseRef.current === 'thinking') {
        // Thinking just ended, tokens arriving — transition to draining
        finalizeActiveThinking()
        if (thinkingStartRef.current) {
          setThinkingDuration(Date.now() - thinkingStartRef.current)
        }
        setPhase('draining_thoughts')
        tokenBufferRef.current.push(token)
        return
      }
      if (phaseRef.current === 'draining_thoughts') {
        // Still draining thoughts — buffer the token
        tokenBufferRef.current.push(token)
        return
      }
      if (phaseRef.current !== 'responding') {
        setPhase('responding')
      }
    }

    const onToolCallStart = (data: { call_id: string; tool_name: string; arguments: Record<string, unknown> }) => {
      // Finalize any active thinking block
      finalizeActiveThinking()
      if (thinkingStartRef.current && phaseRef.current === 'thinking') {
        setThinkingDuration(Date.now() - thinkingStartRef.current)
      }
      thinkingStartRef.current = 0
      setPhase('tool_calling')
      setTimeline((prev) => [...prev, {
        type: 'tool_call' as const,
        call_id: data.call_id,
        tool_name: data.tool_name,
        arguments: data.arguments,
        status: 'running' as const,
        hitl: null,
      }])
    }

    const onToolCallResult = (data: { call_id: string; success: boolean; output?: unknown; error?: string | null; duration_ms?: number | null; nested_timeline?: unknown[] | null; delegated_conversation_id?: string | null }) => {
      setTimeline((prev) => prev.map((item) =>
        item.type === 'tool_call' && item.call_id === data.call_id
          ? { ...item, status: data.success ? 'complete' as const : 'error' as const, success: data.success, output: data.output, error: data.error, duration_ms: data.duration_ms, nested_timeline: (data.nested_timeline as TimelineItem[] | null) ?? item.nested_timeline ?? null }
          : item
      ))
    }

    const onHitlRequest = (data: { call_id: string; hitl_id: string; action_summary: string; risk_level: string }) => {
      setPhase('awaiting_approval')
      setTimeline((prev) => prev.map((item) =>
        item.type === 'tool_call' && item.call_id === data.call_id
          ? { ...item, status: 'awaiting_approval' as const, hitl: { hitl_id: data.hitl_id, action_summary: data.action_summary, risk_level: data.risk_level, status: 'pending' } }
          : item
      ))
    }

    const onHitlResolved = (data: { call_id: string; hitl_id: string; approved: boolean; resolution_note?: string | null }) => {
      setPhase('tool_calling')
      setTimeline((prev) => prev.map((item) =>
        item.type === 'tool_call' && item.call_id === data.call_id
          ? { ...item, status: (data.approved ? 'approved' : 'denied') as 'approved' | 'denied', hitl: item.hitl ? { ...item.hitl, status: data.approved ? 'approved' : 'denied', resolution_note: data.resolution_note ?? null } : null }
          : item
      ))
    }

    const onDone = () => {
      finalizeActiveThinking()
      setPhase('complete')
    }

    const onError = () => {
      finalizeActiveThinking()
      setPhase('error')
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
      // Add the intermediate response to timeline as a collapsible item
      if (data.content) {
        setTimeline(prev => [
          ...prev,
          {
            type: 'intermediate_response' as const,
            id: `ir-${Date.now()}`,
            content: data.content,
          },
        ])
      }
      // Reset thinking and token state for next iteration,
      // but KEEP the timeline — tool calls and thinking blocks persist across iterations
      thinkingStartRef.current = 0
      setThinkingDuration(null)
      tokenBufferRef.current = []
      thinkingTextRef.current = ''
    }

    const onSnapshot = (data: { content: string; thinking: string; timeline: unknown[] }) => {
      // Reconstruct timeline from snapshot data
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
          reconstructed.push({
            type: 'thinking' as const,
            id: `snap-thinking-${reconstructed.length}`,
            status: 'complete' as const,
            duration_ms: (entry.duration_ms ?? entry.durationMs ?? null) as number | null,
            sentences: typeof entry.content === 'string'
              ? entry.content.split(/(?<=[.!?])\s+/).filter(Boolean)
              : [],
          })
        } else if (entry.type === 'tool_call') {
          reconstructed.push({
            type: 'tool_call' as const,
            call_id: (entry.call_id as string) ?? '',
            tool_name: (entry.tool_name as string) ?? '',
            arguments: (entry.arguments as Record<string, unknown>) ?? {},
            status: entry.success === true ? 'complete' as const
              : entry.success === false ? 'error' as const
              : entry.hitl ? 'awaiting_approval' as const
              : (entry.output !== undefined || entry.error) ? (entry.success === false ? 'error' as const : 'complete' as const)
              : 'running' as const,
            hitl: (entry.hitl as ToolCallTimelineItem['hitl']) ?? null,
            success: (entry.success as boolean | null) ?? null,
            output: entry.output ?? undefined,
            error: (entry.error as string | null) ?? null,
            duration_ms: (entry.duration_ms as number | null) ?? null,
            nested_timeline: (entry.nested_timeline as TimelineItem[] | null) ?? null,
          })
        }
      }

      setTimeline(reconstructed)

      // Determine phase from snapshot state
      const hasContent = !!data.content
      const hasRunningTool = reconstructed.some(t => t.type === 'tool_call' && t.status === 'running')
      const hasAwaitingApproval = reconstructed.some(t => t.type === 'tool_call' && t.status === 'awaiting_approval')

      if (hasAwaitingApproval) {
        setPhase('awaiting_approval')
      } else if (hasContent) {
        setPhase('responding')
      } else if (hasRunningTool) {
        setPhase('tool_calling')
      } else if (reconstructed.length > 0) {
        setPhase('thinking')
      } else if (data.thinking) {
        setPhase('thinking')
        // Add a running thinking entry for the active thinking block
        thinkingStartRef.current = Date.now()
        thinkingIdCounter.current++
        setTimeline([{
          type: 'thinking' as const,
          id: `snap-active-${thinkingIdCounter.current}`,
          status: 'running' as const,
          duration_ms: null,
          sentences: [],
        }])
      } else {
        setPhase('thinking')
      }
    }

    /**
     * Apply an inner event to a mutable TimelineItem[] (the nested_timeline at the target depth).
     * Returns the mutated array for convenience.
     */
    function applyInnerEvent(target: TimelineItem[], inner: { type: string; data: unknown }): TimelineItem[] {
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
      return target
    }

    /** Apply a nested subagent event, navigating call_id_path for deep nesting. */
    const onNestedEvent = (data: { call_id?: string; call_id_path?: string[]; scope_path?: number[]; event: { type: string; data: unknown } }) => {
      const path = data.call_id_path ?? (data.call_id ? [data.call_id] : [])
      if (path.length === 0) return

      setTimeline((prev) => {
        // Deep-clone along the path so React detects changes
        const updated = [...prev]

        // Navigate the call_id_path: each element is the call_id of a tool_call
        // whose nested_timeline we descend into.
        let currentLevel = updated
        for (let depth = 0; depth < path.length; depth++) {
          const cid = path[depth]
          const idx = currentLevel.findIndex(
            (item) => item.type === 'tool_call' && item.call_id === cid,
          )
          if (idx === -1) return prev // path not found

          const item = currentLevel[idx]
          if (item.type !== 'tool_call') return prev

          if (depth < path.length - 1) {
            // Intermediate level: descend into nested_timeline
            const nested = [...(item.nested_timeline ?? [])]
            currentLevel[idx] = { ...item, nested_timeline: nested }
            currentLevel = nested
          } else {
            // Deepest level: apply the inner event here
            const nested = [...(item.nested_timeline ?? [])]
            applyInnerEvent(nested, data.event)
            currentLevel[idx] = { ...item, nested_timeline: nested }
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
  }, [emitter, finalizeActiveThinking])

  const reset = () => {
    setPhase('idle')
    setTimeline([])
    setThinkingDuration(null)
    setModelInfo(null)
    thinkingStartRef.current = 0
    tokenBufferRef.current = []
    thinkingTextRef.current = ''
    thinkingIdCounter.current = 0
  }

  return { phase, timeline, thinkingDuration, modelInfo, reset, handleThoughtsDrained }
}
