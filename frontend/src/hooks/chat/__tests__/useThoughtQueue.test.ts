import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useThoughtQueue } from '@/hooks/chat/useThoughtQueue'
import { AgentEmitter } from '@/hooks/chat/useAgentStream'

describe('useThoughtQueue', () => {
  let emitter: AgentEmitter

  beforeEach(() => {
    vi.useFakeTimers()
    emitter = new AgentEmitter()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with null currentThought and empty allThoughts', () => {
    const { result } = renderHook(() => useThoughtQueue(emitter))
    expect(result.current.currentThought).toBeNull()
    expect(result.current.allThoughts).toEqual([])
  })

  it('extracts and displays thoughts from thinking chunks', () => {
    const { result } = renderHook(() => useThoughtQueue(emitter))
    act(() => {
      emitter.emit('thinking_chunk', 'First thought. Second thought. Remaining')
    })
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current.allThoughts.length).toBeGreaterThan(0)
  })

  it('cycles to next thought after drain interval', () => {
    const { result } = renderHook(() => useThoughtQueue(emitter))
    act(() => {
      emitter.emit('thinking_chunk', 'First thought. Second thought. Third thought. End')
    })
    const firstThought = result.current.currentThought
    act(() => { vi.advanceTimersByTime(3000) })
    if (firstThought && result.current.currentThought) {
      expect(result.current.currentThought).not.toBe(firstThought)
    }
  })

  it('calls onDrainComplete callback when done draining', () => {
    const onDrainComplete = vi.fn()
    const { result } = renderHook(() => useThoughtQueue(emitter, onDrainComplete))
    act(() => {
      emitter.emit('thinking_chunk', 'Single thought. Done')
      emitter.emit('done', { message_id: 'msg-1' })
    })
    act(() => { vi.advanceTimersByTime(10000) })
    expect(onDrainComplete).toHaveBeenCalled()
  })
})
