import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentEmitter } from '@/hooks/chat/useAgentStream'

export type AgentPhase =
  | 'idle'
  | 'thinking'
  | 'draining_thoughts'
  | 'tool_calling'
  | 'awaiting_approval'
  | 'responding'
  | 'complete'
  | 'error'

export interface TimelineItem {
  type: 'tool_call' | 'hitl'
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
  const phaseRef = useRef<AgentPhase>('idle')
  const thinkingStartRef = useRef<number>(0)
  const tokenBufferRef = useRef<string[]>([])

  useEffect(() => { phaseRef.current = phase }, [phase])

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
    const onThinking = () => {
      if (phaseRef.current === 'idle' || phaseRef.current === 'tool_calling') {
        if (!thinkingStartRef.current) thinkingStartRef.current = Date.now()
        setPhase('thinking')
      }
    }

    const onToken = (token: string) => {
      if (phaseRef.current === 'thinking') {
        // Thinking just ended, tokens arriving — transition to draining
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
      if (thinkingStartRef.current && phaseRef.current === 'thinking') {
        setThinkingDuration(Date.now() - thinkingStartRef.current)
      }
      setPhase('tool_calling')
      setTimeline((prev) => [...prev, {
        type: 'tool_call',
        call_id: data.call_id,
        tool_name: data.tool_name,
        arguments: data.arguments,
        status: 'running',
        hitl: null,
      }])
    }

    const onToolCallResult = (data: { call_id: string; success: boolean; output?: unknown; error?: string | null; duration_ms?: number | null }) => {
      setTimeline((prev) => prev.map((item) =>
        item.call_id === data.call_id
          ? { ...item, status: data.success ? 'complete' as const : 'error' as const, success: data.success, output: data.output, error: data.error, duration_ms: data.duration_ms }
          : item
      ))
    }

    const onHitlRequest = (data: { call_id: string; hitl_id: string; action_summary: string; risk_level: string }) => {
      setPhase('awaiting_approval')
      setTimeline((prev) => prev.map((item) =>
        item.call_id === data.call_id
          ? { ...item, status: 'awaiting_approval' as const, hitl: { hitl_id: data.hitl_id, action_summary: data.action_summary, risk_level: data.risk_level, status: 'pending' } }
          : item
      ))
    }

    const onHitlResolved = (data: { call_id: string; hitl_id: string; approved: boolean; resolution_note?: string | null }) => {
      setPhase('tool_calling')
      setTimeline((prev) => prev.map((item) =>
        item.call_id === data.call_id
          ? { ...item, status: (data.approved ? 'approved' : 'denied') as 'approved' | 'denied', hitl: item.hitl ? { ...item.hitl, status: data.approved ? 'approved' : 'denied', resolution_note: data.resolution_note ?? null } : null }
          : item
      ))
    }

    const onDone = () => {
      setPhase('complete')
    }

    const onError = () => {
      setPhase('error')
    }

    const onIntermediateResponse = () => {
      // Reset for next iteration
      thinkingStartRef.current = 0
      setThinkingDuration(null)
      setTimeline([])
      tokenBufferRef.current = []
    }

    emitter.on('thinking_chunk', onThinking)
    emitter.on('token', onToken)
    emitter.on('tool_call_start', onToolCallStart)
    emitter.on('tool_call_result', onToolCallResult)
    emitter.on('hitl_request', onHitlRequest)
    emitter.on('hitl_resolved', onHitlResolved)
    emitter.on('done', onDone)
    emitter.on('error', onError)
    emitter.on('intermediate_response', onIntermediateResponse)

    return () => {
      emitter.off('thinking_chunk', onThinking)
      emitter.off('token', onToken)
      emitter.off('tool_call_start', onToolCallStart)
      emitter.off('tool_call_result', onToolCallResult)
      emitter.off('hitl_request', onHitlRequest)
      emitter.off('hitl_resolved', onHitlResolved)
      emitter.off('done', onDone)
      emitter.off('error', onError)
      emitter.off('intermediate_response', onIntermediateResponse)
    }
  }, [emitter])

  const reset = () => {
    setPhase('idle')
    setTimeline([])
    setThinkingDuration(null)
    thinkingStartRef.current = 0
    tokenBufferRef.current = []
  }

  return { phase, timeline, thinkingDuration, reset, handleThoughtsDrained }
}
