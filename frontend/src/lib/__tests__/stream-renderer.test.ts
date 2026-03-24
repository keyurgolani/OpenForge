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
})
