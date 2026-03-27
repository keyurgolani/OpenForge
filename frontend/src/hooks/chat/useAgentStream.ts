import { useCallback, useEffect, useRef } from 'react'

// ── Typed Emitter ──
type AgentEventMap = {
  thinking_chunk: [text: string]
  token: [text: string]
  tool_call_start: [data: { call_id: string; tool_name: string; arguments: Record<string, unknown> }]
  tool_call_result: [data: { call_id: string; success: boolean; output?: unknown; error?: string | null; duration_ms?: number | null }]
  hitl_request: [data: { call_id: string; hitl_id: string; action_summary: string; risk_level: string }]
  hitl_resolved: [data: { call_id: string; hitl_id: string; approved: boolean; resolution_note?: string | null }]
  model_selection: [data: { provider_name: string; provider_display_name?: string; model: string; is_override: boolean }]
  prompt_optimized: [data: { original: string; optimized: string }]
  attachments_processed: [data: unknown[]]
  intermediate_response: [data: { content: string }]
  follow_up_request: [data: { missing_inputs: unknown[] }]
  nested_event: [data: { scope_path: string[]; event: unknown }]
  snapshot: [data: { content: string; thinking: string; timeline: unknown[] }]
  conversation_updated: [data: { id: string; title?: string }]
  execution_started: [data: { execution_id: string }]
  execution_completed: [data: { execution_id: string }]
  done: [data: { message_id: string; interrupted?: boolean }]
  error: [data: { detail: string }]
}

export type AgentEmitterEvent = keyof AgentEventMap

export class AgentEmitter {
  private listeners = new Map<string, Set<Function>>()

  on<E extends AgentEmitterEvent>(event: E, cb: (...args: AgentEventMap[E]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(cb)
  }

  off<E extends AgentEmitterEvent>(event: E, cb: (...args: AgentEventMap[E]) => void) {
    this.listeners.get(event)?.delete(cb)
  }

  emit<E extends AgentEmitterEvent>(event: E, ...args: AgentEventMap[E]) {
    this.listeners.get(event)?.forEach((cb) => cb(...args))
  }

  clear() { this.listeners.clear() }
}

// ── WebSocket event type → emitter event mapping ──
const WS_EVENT_MAP: Record<string, AgentEmitterEvent> = {
  agent_thinking: 'thinking_chunk',
  agent_token: 'token',
  agent_tool_call_start: 'tool_call_start',
  agent_tool_call_result: 'tool_call_result',
  agent_tool_hitl: 'hitl_request',
  agent_tool_hitl_resolved: 'hitl_resolved',
  agent_model_selection: 'model_selection',
  agent_prompt_optimized: 'prompt_optimized',
  agent_attachments_processed: 'attachments_processed',
  agent_intermediate_response: 'intermediate_response',
  agent_follow_up_request: 'follow_up_request',
  agent_nested_event: 'nested_event',
  agent_stream_snapshot: 'snapshot',
  conversation_updated: 'conversation_updated',
  execution_started: 'execution_started',
  execution_completed: 'execution_completed',
  agent_done: 'done',
  agent_error: 'error',
  chat_error: 'error',
}

/**
 * useAgentStream: Ingestion layer.
 *
 * The parent page (AgentChatPage) owns the WebSocket via useChatWebSocket.
 * It passes incoming WS messages to this hook's `handleMessage` function.
 * This hook translates raw WS events into typed emitter events that
 * the coordination hooks subscribe to.
 */
export function useAgentStream() {
  const emitterRef = useRef(new AgentEmitter())

  const handleMessage = useCallback((msg: { type: string; data?: unknown; conversation_id?: string }) => {
    const emitterEvent = WS_EVENT_MAP[msg.type]
    if (emitterEvent) {
      emitterRef.current.emit(emitterEvent, msg.data as never)
    }
  }, [])

  useEffect(() => {
    return () => { emitterRef.current.clear() }
  }, [])

  return {
    emitter: emitterRef.current,
    handleMessage,
  }
}
