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
      className="flex-1 overflow-y-auto overscroll-contain"
      style={{ scrollbarWidth: 'none' }}
      aria-live="polite"
    >
      <div ref={contentRef} className="px-8 py-6 space-y-6">
        {children}
      </div>
    </div>
  )
}
