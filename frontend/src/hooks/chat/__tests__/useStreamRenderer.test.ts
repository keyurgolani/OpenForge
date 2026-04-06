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

  describe('snapshot recovery', () => {
    it('sets displayText immediately from snapshot content', () => {
      const { result } = renderHook(() => useStreamRenderer(emitter))
      act(() => {
        emitter.emit('snapshot', {
          content: 'Restored response from snapshot.',
          thinking: '',
          timeline: [],
        })
      })
      expect(result.current.displayText).toBe('Restored response from snapshot.')
      expect(result.current.isStreaming).toBe(false)
    })

    it('overwrites previously streamed content on snapshot', () => {
      const { result } = renderHook(() => useStreamRenderer(emitter))
      act(() => {
        emitter.emit('token', 'Old partial content')
      })
      expect(result.current.displayText.length).toBeGreaterThan(0)
      act(() => {
        emitter.emit('snapshot', {
          content: 'Completely new snapshot content.',
          thinking: '',
          timeline: [],
        })
      })
      expect(result.current.displayText).toBe('Completely new snapshot content.')
      expect(result.current.isStreaming).toBe(false)
    })

    it('does not change displayText when snapshot content is empty', () => {
      const { result } = renderHook(() => useStreamRenderer(emitter))
      act(() => {
        emitter.emit('token', 'Some streamed text')
      })
      const textBefore = result.current.displayText
      act(() => {
        emitter.emit('snapshot', {
          content: '',
          thinking: 'thinking only',
          timeline: [],
        })
      })
      // Empty content should not trigger setImmediate, so displayText stays as-is
      expect(result.current.displayText).toBe(textBefore)
    })

    it('allows new tokens to stream after snapshot recovery', () => {
      const { result } = renderHook(() => useStreamRenderer(emitter))
      act(() => {
        emitter.emit('snapshot', {
          content: 'Snapshot base.',
          thinking: '',
          timeline: [],
        })
      })
      expect(result.current.displayText).toBe('Snapshot base.')
      act(() => {
        emitter.emit('token', ' More content')
      })
      expect(result.current.isStreaming).toBe(true)
      // The renderer should have ingested the new token on top of the snapshot
      expect(result.current.displayText.length).toBeGreaterThan('Snapshot base.'.length)
    })
  })
})
