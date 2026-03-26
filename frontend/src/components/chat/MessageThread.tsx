import type { ReactNode } from 'react'

interface MessageThreadProps {
  children: ReactNode
  containerRef: React.RefObject<HTMLDivElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
}

export function MessageThread({ children, containerRef, contentRef }: MessageThreadProps) {
  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
      style={{ scrollbarWidth: 'none' }}
      role="log"
      aria-live="polite"
    >
      <div ref={contentRef} className="px-2 md:px-4 py-4 space-y-4 pb-24">
        {children}
      </div>
    </div>
  )
}
