import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStreamRenderer } from '@/hooks/chat/useStreamRenderer'
import { AgentEmitter } from '@/hooks/chat/useAgentStream'

describe('useStreamRenderer', () => {
  let emitter: AgentEmitter

  beforeEach(() => {
    emitter = new AgentEmitter()
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 1 })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts with empty displayText and not streaming', () => {
    const { result } = renderHook(() => useStreamRenderer(emitter))
    expect(result.current.displayText).toBe('')
    expect(result.current.isStreaming).toBe(false)
  })

  it('updates displayText when tokens arrive', () => {
    const { result } = renderHook(() => useStreamRenderer(emitter))
    act(() => {
      emitter.emit('token', 'Hello ')
      emitter.emit('token', 'world')
    })
    expect(result.current.displayText.length).toBeGreaterThan(0)
    expect(result.current.isStreaming).toBe(true)
  })

  it('sets isStreaming false on done', () => {
    const { result } = renderHook(() => useStreamRenderer(emitter))
    act(() => {
      emitter.emit('token', 'Hi')
      emitter.emit('done', { message_id: 'msg-1' })
    })
    expect(result.current.isStreaming).toBe(false)
  })

  it('resets on intermediate_response', () => {
    const { result } = renderHook(() => useStreamRenderer(emitter))
    act(() => {
      emitter.emit('token', 'First iteration content')
    })
    expect(result.current.displayText.length).toBeGreaterThan(0)
    act(() => {
      emitter.emit('intermediate_response', { content: 'First iteration content' })
    })
    expect(result.current.displayText).toBe('')
  })
})
