import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { ThinkingDetail } from './ThinkingDetail'

interface ThinkingTickerProps {
  currentThought: string | null
  isActive: boolean
  thinkingDuration?: number | null
  allThoughts?: string[]
}

export function ThinkingTicker({ currentThought, isActive, thinkingDuration, allThoughts = [] }: ThinkingTickerProps) {
  const [expanded, setExpanded] = useState(false)

  if (isActive) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 py-1 w-full text-left"
          role="status"
        >
          <ChevronRight className={`h-3 w-3 text-muted-foreground/50 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`} />
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.span
                key={currentThought ?? 'thinking'}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="thinking-shimmer block whitespace-nowrap overflow-hidden text-ellipsis text-sm font-medium bg-clip-text text-transparent"
              >
                {currentThought ?? 'Thinking…'}
              </motion.span>
            </AnimatePresence>
          </div>
        </button>
        <AnimatePresence>
          {expanded && allThoughts.length > 0 && <ThinkingDetail thoughts={allThoughts} />}
        </AnimatePresence>
      </div>
    )
  }

  // Collapsed summary state
  const durationLabel = thinkingDuration
    ? `${(thinkingDuration / 1000).toFixed(1)} seconds`
    : null
  const hasExpandableContent = allThoughts.length > 0

  return (
    <div>
      <button
        onClick={hasExpandableContent ? () => setExpanded(!expanded) : undefined}
        className={`flex items-center gap-1.5 text-xs text-muted-foreground/70 ${hasExpandableContent ? 'hover:text-muted-foreground cursor-pointer' : 'cursor-default'} transition-colors py-0.5`}
      >
        {hasExpandableContent && (
          <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
        <span>Thought{durationLabel ? ` for ${durationLabel}` : ''}</span>
      </button>
      <AnimatePresence>
        {expanded && hasExpandableContent && <ThinkingDetail thoughts={allThoughts} />}
      </AnimatePresence>
    </div>
  )
}
