import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamRenderer } from '@/lib/stream-renderer'

describe('StreamRenderer', () => {
  let renderer: StreamRenderer
  let onRender: ReturnType<typeof vi.fn>
  let onComplete: ReturnType<typeof vi.fn>
  let rafCallbacks: Array<(time: number) => void>

  beforeEach(() => {
    rafCallbacks = []
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    renderer = new StreamRenderer()
    onRender = vi.fn()
    onComplete = vi.fn()
    renderer.on('render', onRender)
    renderer.on('complete', onComplete)
  })

  afterEach(() => {
    renderer.destroy()
    vi.unstubAllGlobals()
  })

  function flushFrames(count: number) {
    for (let i = 0; i < count; i++) {
      const cb = rafCallbacks.shift()
      if (cb) cb(performance.now())
    }
  }

  it('accumulates tokens in buffer', () => {
    renderer.ingest('Hello ')
    renderer.ingest('world')
    flushFrames(1)
    expect(onRender).toHaveBeenCalled()
    const rendered = onRender.mock.calls[0][0] as string
    expect(rendered.length).toBeGreaterThan(0)
    expect('Hello world'.startsWith(rendered)).toBe(true)
  })

  it('eventually renders all buffered content', () => {
    renderer.ingest('Short text.')
    for (let i = 0; i < 20; i++) flushFrames(1)
    const lastCall = onRender.mock.calls[onRender.mock.calls.length - 1]
    expect(lastCall[0]).toBe('Short text.')
  })

  it('emits complete when buffer fully drained after complete()', () => {
    renderer.ingest('Hi.')
    renderer.complete()
    for (let i = 0; i < 20; i++) flushFrames(1)
    expect(onComplete).toHaveBeenCalled()
  })

  it('snaps to word boundaries', () => {
    renderer.ingest('This is a test sentence with words.')
    flushFrames(1)
    const rendered = onRender.mock.calls[0][0] as string
    if (rendered.length < 'This is a test sentence with words.'.length) {
      const lastChar = rendered[rendered.length - 1]
      expect(lastChar === ' ' || rendered.endsWith('This') || rendered.length <= 2).toBe(true)
    }
  })

  it('reset clears buffer and stops loop', () => {
    renderer.ingest('Some content')
    renderer.reset()
    flushFrames(5)
    const callsAfterReset = onRender.mock.calls.length
    flushFrames(5)
    expect(onRender.mock.calls.length).toBe(callsAfterReset)
  })

  it('adapts speed under pressure', () => {
    renderer.ingest('A'.repeat(200) + ' ')
    flushFrames(1)
    const firstChunk = (onRender.mock.calls[0][0] as string).length

    renderer.reset()
    onRender.mockClear()

    renderer.ingest('Hi ')
    flushFrames(1)
    const secondChunk = (onRender.mock.calls[0][0] as string).length

    expect(firstChunk).toBeGreaterThan(secondChunk)
  })

  describe('drain behavior', () => {
    it('flushes all remaining content in one frame when draining', () => {
      const content = 'Hello world, this is a longer sentence to test drain behavior.'
      renderer.ingest(content)
      // Render one frame so partial content is rendered
      flushFrames(1)
      const partialRender = onRender.mock.calls[onRender.mock.calls.length - 1][0] as string
      expect(partialRender.length).toBeLessThan(content.length)

      // Now trigger drain
      renderer.complete()
      onRender.mockClear()
      onComplete.mockClear()

      // One tick should flush everything
      flushFrames(1)
      expect(onRender).toHaveBeenCalledWith(content)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('emits complete immediately when buffer is already fully rendered', () => {
      renderer.ingest('Hi')
      // Flush enough frames to render everything
      for (let i = 0; i < 20; i++) flushFrames(1)
      onComplete.mockClear()

      // Now complete — no pending content, no active RAF loop
      renderer.complete()
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('emits complete immediately when no RAF loop is running', () => {
      // Never ingested anything, so rafId is null
      renderer.complete()
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })

  describe('setImmediate', () => {
    it('sets content and emits render with full content', () => {
      const content = 'Snapshot restored content here.'
      renderer.setImmediate(content)
      expect(onRender).toHaveBeenCalledWith(content)
    })

    it('does not start RAF loop', () => {
      renderer.setImmediate('Some content')
      expect(rafCallbacks).toHaveLength(0)
    })

    it('overwrites previously ingested content', () => {
      renderer.ingest('old partial')
      onRender.mockClear()
      renderer.setImmediate('new full content')
      expect(onRender).toHaveBeenCalledWith('new full content')
    })
  })

  describe('destroy', () => {
    it('clears state and removes all listeners', () => {
      renderer.ingest('Some content')
      renderer.destroy()

      // After destroy, listeners should be gone — no events emitted
      onRender.mockClear()
      onComplete.mockClear()

      // Re-ingest to trigger events — but listeners are cleared
      renderer.ingest('More content')
      flushFrames(5)
      expect(onRender).not.toHaveBeenCalled()

      renderer.complete()
      expect(onComplete).not.toHaveBeenCalled()
    })
  })
})
