import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAgentPhase } from '@/hooks/chat/useAgentPhase'
import { AgentEmitter } from '@/hooks/chat/useAgentStream'

describe('useAgentPhase — transition edge cases', () => {
  let emitter: AgentEmitter

  beforeEach(() => {
    emitter = new AgentEmitter()
    vi.useFakeTimers()
  })

  it('thinking → tool_calling (no tokens): finalizes thinking and transitions directly', () => {
    const { result } = renderHook(() => useAgentPhase(emitter))

    // Start thinking
    act(() => {
      emitter.emit('thinking_chunk', 'Analyzing the problem.')
    })
    expect(result.current.phase).toBe('thinking')
    expect(result.current.timeline).toHaveLength(1)
    expect(result.current.timeline[0]).toMatchObject({ type: 'thinking', status: 'running' })

    // Tool call arrives directly — no tokens in between
    act(() => {
      emitter.emit('tool_call_start', { call_id: 'tc-1', tool_name: 'search', arguments: { q: 'test' } })
    })
    expect(result.current.phase).toBe('tool_calling')
    expect(result.current.timeline).toHaveLength(2)
    // Thinking block should be finalized
    expect(result.current.timeline[0]).toMatchObject({ type: 'thinking', status: 'complete' })
    // Tool call entry added
    expect(result.current.timeline[1]).toMatchObject({
      type: 'tool_call',
      call_id: 'tc-1',
      tool_name: 'search',
      status: 'running',
    })
  })

  it('draining_thoughts → tool_calling: clears token buffer and finalizes thinking', () => {
    const { result } = renderHook(() => useAgentPhase(emitter))

    // Start thinking
    act(() => {
      emitter.emit('thinking_chunk', 'Let me think.')
    })
    expect(result.current.phase).toBe('thinking')

    // Token arrives → transitions to draining_thoughts (thinking ended, tokens buffered)
    act(() => {
      emitter.emit('token', 'buffered-tok-1')
    })
    expect(result.current.phase).toBe('draining_thoughts')

    // Buffer more tokens
    act(() => {
      emitter.emit('token', 'buffered-tok-2')
    })
    expect(result.current.phase).toBe('draining_thoughts')

    // Tool call arrives while draining — should discard buffered tokens and transition
    act(() => {
      emitter.emit('tool_call_start', { call_id: 'tc-2', tool_name: 'read_file', arguments: { path: '/tmp' } })
    })
    expect(result.current.phase).toBe('tool_calling')
    expect(result.current.timeline).toHaveLength(2)
    expect(result.current.timeline[0]).toMatchObject({ type: 'thinking', status: 'complete' })
    expect(result.current.timeline[1]).toMatchObject({
      type: 'tool_call',
      call_id: 'tc-2',
      tool_name: 'read_file',
      status: 'running',
    })

    // Verify buffered tokens were discarded: calling handleThoughtsDrained should be a no-op
    // (phase is tool_calling, not draining_thoughts)
    act(() => {
      result.current.handleThoughtsDrained()
    })
    expect(result.current.phase).toBe('tool_calling')
  })

  it('multi-cycle thinking/tool-calling: correct timeline across two full cycles', () => {
    const { result } = renderHook(() => useAgentPhase(emitter))

    // ── Cycle 1: thinking → tool_calling ──
    act(() => {
      emitter.emit('thinking_chunk', 'First round of thinking.')
    })
    expect(result.current.phase).toBe('thinking')

    act(() => {
      emitter.emit('tool_call_start', { call_id: 'tc-a', tool_name: 'search', arguments: {} })
    })
    expect(result.current.phase).toBe('tool_calling')
    expect(result.current.timeline).toHaveLength(2)
    expect(result.current.timeline[0]).toMatchObject({ type: 'thinking', status: 'complete' })
    expect(result.current.timeline[1]).toMatchObject({ type: 'tool_call', call_id: 'tc-a', status: 'running' })

    // Tool result completes
    act(() => {
      emitter.emit('tool_call_result', { call_id: 'tc-a', success: true, output: 'result-a', duration_ms: 100 })
    })
    expect(result.current.timeline[1]).toMatchObject({ type: 'tool_call', call_id: 'tc-a', status: 'complete', success: true })

    // ── Cycle 2: tool_calling → thinking → tool_calling ──
    act(() => {
      emitter.emit('thinking_chunk', 'Second round of thinking.')
    })
    expect(result.current.phase).toBe('thinking')
    expect(result.current.timeline).toHaveLength(3)
    expect(result.current.timeline[2]).toMatchObject({ type: 'thinking', status: 'running' })

    act(() => {
      emitter.emit('tool_call_start', { call_id: 'tc-b', tool_name: 'write_file', arguments: { path: '/out' } })
    })
    expect(result.current.phase).toBe('tool_calling')
    expect(result.current.timeline).toHaveLength(4)
    // Second thinking finalized
    expect(result.current.timeline[2]).toMatchObject({ type: 'thinking', status: 'complete' })
    // Second tool call added
    expect(result.current.timeline[3]).toMatchObject({ type: 'tool_call', call_id: 'tc-b', status: 'running' })

    // Verify full timeline shape
    const types = result.current.timeline.map((t) => t.type)
    expect(types).toEqual(['thinking', 'tool_call', 'thinking', 'tool_call'])
  })
})
