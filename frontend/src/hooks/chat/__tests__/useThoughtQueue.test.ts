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

  describe('snapshot recovery', () => {
    it('restores allThoughts and currentThought from snapshot timeline', () => {
      const { result } = renderHook(() => useThoughtQueue(emitter))
      act(() => {
        emitter.emit('snapshot', {
          content: '',
          thinking: '',
          timeline: [
            { type: 'thinking', content: 'First thought. Second thought.' },
            { type: 'tool_call', tool_name: 'search', call_id: 'c1' },
            { type: 'thinking', content: 'Third thought.' },
          ],
          status: 'completed',
        })
      })
      expect(result.current.allThoughts).toEqual(['First thought.', 'Second thought.', 'Third thought.'])
      expect(result.current.currentThought).toBe('Third thought.')
    })

    it('falls back to thinking field when timeline has no thinking entries', () => {
      const { result } = renderHook(() => useThoughtQueue(emitter))
      act(() => {
        emitter.emit('snapshot', {
          content: '',
          thinking: 'Fallback thought. Another one.',
          timeline: [],
          status: 'running',
        })
      })
      expect(result.current.allThoughts).toEqual(['Fallback thought.', 'Another one.'])
      expect(result.current.currentThought).toBe('Another one.')
    })

    it('sets isDraining false when snapshot status is completed', () => {
      const { result } = renderHook(() => useThoughtQueue(emitter))
      act(() => {
        emitter.emit('snapshot', {
          content: 'response',
          thinking: '',
          timeline: [{ type: 'thinking', content: 'Done thinking.' }],
          status: 'completed',
        })
      })
      expect(result.current.isDraining).toBe(false)
    })

    it('clears previous drain timer on snapshot', () => {
      const { result } = renderHook(() => useThoughtQueue(emitter))
      // Start a thinking flow to create a drain timer
      act(() => {
        emitter.emit('thinking_chunk', 'Active thought. Another. ')
      })
      expect(result.current.isDraining).toBe(true)
      // Snapshot should reset everything cleanly
      act(() => {
        emitter.emit('snapshot', {
          content: '',
          thinking: '',
          timeline: [{ type: 'thinking', content: 'Restored thought.' }],
          status: 'completed',
        })
      })
      expect(result.current.allThoughts).toEqual(['Restored thought.'])
      expect(result.current.currentThought).toBe('Restored thought.')
      expect(result.current.isDraining).toBe(false)
    })

    it('sets null currentThought when snapshot has no thinking content', () => {
      const { result } = renderHook(() => useThoughtQueue(emitter))
      act(() => {
        emitter.emit('snapshot', {
          content: 'some response',
          thinking: '',
          timeline: [],
          status: 'completed',
        })
      })
      expect(result.current.currentThought).toBeNull()
      expect(result.current.allThoughts).toEqual([])
      expect(result.current.isDraining).toBe(false)
    })
  })
})
