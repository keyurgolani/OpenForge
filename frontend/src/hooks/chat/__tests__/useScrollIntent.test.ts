import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useScrollIntent } from '@/hooks/chat/useScrollIntent'

describe('useScrollIntent', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: (entries: unknown[]) => void) {}
      observe = vi.fn()
      disconnect = vi.fn()
      unobserve = vi.fn()
    })
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 1 })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts in stuck state', () => {
    const { result } = renderHook(() => useScrollIntent())
    expect(result.current.intent).toBe('stuck')
  })

  it('exposes scrollToBottom function', () => {
    const { result } = renderHook(() => useScrollIntent())
    expect(typeof result.current.scrollToBottom).toBe('function')
  })

  it('exposes containerRef and contentRef', () => {
    const { result } = renderHook(() => useScrollIntent())
    expect(result.current.containerRef).toBeDefined()
    expect(result.current.contentRef).toBeDefined()
  })

  it('exposes preserveReadingPosition function', () => {
    const { result } = renderHook(() => useScrollIntent())
    expect(typeof result.current.preserveReadingPosition).toBe('function')
  })
})
