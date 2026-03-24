import { useCallback, useEffect, useRef, useState } from 'react'

export type ScrollIntent = 'stuck' | 'free' | 'returning'

const UNSTICK_THRESHOLD = 100
const RESTICK_THRESHOLD = 50

export function useScrollIntent() {
  const [intent, setIntent] = useState<ScrollIntent>('stuck')
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const intentRef = useRef<ScrollIntent>('stuck')
  const isRendering = useRef(false)
  const lastScrollTop = useRef(0)

  useEffect(() => { intentRef.current = intent }, [intent])

  // Scroll event handler — only detects intent changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onScroll = () => {
      if (isRendering.current) return

      const { scrollTop, scrollHeight, clientHeight } = container
      const distFromBottom = scrollHeight - scrollTop - clientHeight
      const scrollDelta = scrollTop - lastScrollTop.current
      lastScrollTop.current = scrollTop

      if (intentRef.current === 'stuck') {
        if (scrollDelta < 0 && distFromBottom > UNSTICK_THRESHOLD) {
          setIntent('free')
        }
      } else if (intentRef.current === 'free') {
        if (distFromBottom <= RESTICK_THRESHOLD) {
          setIntent('stuck')
        }
      }
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  // ResizeObserver — auto-scroll on content growth when stuck
  useEffect(() => {
    const content = contentRef.current
    const container = containerRef.current
    if (!content || !container) return

    const observer = new ResizeObserver(() => {
      if (intentRef.current !== 'stuck') return

      requestAnimationFrame(() => {
        isRendering.current = true
        const { scrollHeight, clientHeight } = container
        container.scrollTop = scrollHeight - clientHeight
        lastScrollTop.current = container.scrollTop

        requestAnimationFrame(() => {
          isRendering.current = false
        })
      })
    })

    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current
    if (!container) return

    setIntent('returning')
    isRendering.current = true
    container.scrollTo({
      top: container.scrollHeight - container.clientHeight,
      behavior,
    })

    const checkArrival = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distFromBottom = scrollHeight - scrollTop - clientHeight
      if (distFromBottom <= RESTICK_THRESHOLD) {
        setIntent('stuck')
        isRendering.current = false
        lastScrollTop.current = container.scrollTop
      } else {
        requestAnimationFrame(checkArrival)
      }
    }
    requestAnimationFrame(checkArrival)
  }, [])

  const preserveReadingPosition = useCallback((callback: () => void) => {
    if (intentRef.current !== 'free') {
      callback()
      return
    }

    const container = containerRef.current
    if (!container) { callback(); return }

    const children = Array.from(container.children[0]?.children ?? [])
    let anchor: Element | null = null
    let anchorTop = 0
    for (const child of children) {
      const rect = child.getBoundingClientRect()
      if (rect.top >= 0) {
        anchor = child
        anchorTop = rect.top
        break
      }
    }

    callback()

    if (anchor) {
      const drift = anchor.getBoundingClientRect().top - anchorTop
      if (drift !== 0) {
        isRendering.current = true
        container.scrollTop += drift
        lastScrollTop.current = container.scrollTop
        requestAnimationFrame(() => { isRendering.current = false })
      }
    }
  }, [])

  return { intent, scrollToBottom, preserveReadingPosition, containerRef, contentRef }
}
