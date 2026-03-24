import { useState } from 'react'
import { Brain, ChevronDown } from 'lucide-react'
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
      <div className="flex items-center gap-2 h-[34px] px-3.5 glass-sm rounded-sm relative overflow-hidden" role="status">
        <Brain className="w-3.5 h-3.5 text-accent/70 animate-sparkle-pulse flex-shrink-0" />
        <AnimatePresence mode="wait">
          <motion.span
            key={currentThought ?? 'thinking'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
            className="text-[13px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis"
          >
            {currentThought ?? 'Thinking...'}
          </motion.span>
        </AnimatePresence>
        <div className="absolute inset-0 thinking-shimmer pointer-events-none" />
      </div>
    )
  }

  // Collapsed summary state
  if (!allThoughts.length) return null

  const durationLabel = thinkingDuration
    ? `${(thinkingDuration / 1000).toFixed(1)}s`
    : null

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 py-1.5 px-3.5 rounded-sm hover:bg-muted/30 transition-colors text-muted-foreground"
      >
        <Brain className="w-3 h-3" />
        <span className="text-xs">Thought for {durationLabel}</span>
        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {expanded && <ThinkingDetail thoughts={allThoughts} />}
      </AnimatePresence>
    </div>
  )
}
