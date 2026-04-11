import { useState, useEffect, useRef } from 'react'
import { Bot, Cpu } from 'lucide-react'
import { ExecutionTimeline } from '@/components/shared/execution-timeline'
import { StreamedResponse } from './StreamedResponse'
import { CopyButton } from '@/components/shared/CopyButton'
import type { TimelineItem, ExecutionPhase } from '@/types/timeline'

const RESPONDING_MESSAGES = [
  'Thinking…',
  'Reasoning…',
  'Working on it…',
  'Processing…',
  'Analyzing…',
  'Considering approaches…',
  'Crafting response…',
  'Connecting the dots…',
  'Putting it together…',
  'Almost there…',
  'Digging deeper…',
  'Exploring options…',
]

function RotatingMessage({ active }: { active: boolean }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * RESPONDING_MESSAGES.length))
  const [fading, setFading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setIndex(prev => {
          let next: number
          do { next = Math.floor(Math.random() * RESPONDING_MESSAGES.length) } while (next === prev && RESPONDING_MESSAGES.length > 1)
          return next
        })
        setFading(false)
      }, 300)
    }, 3000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [active])

  return (
    <span
      className="inline-block transition-opacity duration-300 ease-in-out"
      style={{ opacity: fading ? 0 : 1 }}
    >
      {RESPONDING_MESSAGES[index]}
    </span>
  )
}

interface ModelInfo {
  providerName: string
  providerDisplayName: string
  model: string
  isOverride: boolean
  systemPrompt?: string
}

interface AgentResponseBlockProps {
  phase: ExecutionPhase
  currentThought: string | null
  allThoughts: string[]
  thinkingDuration: number | null
  timeline: TimelineItem[]
  displayText: string
  isStreaming: boolean
  onHITLAction?: (hitlId: string, action: 'approve' | 'deny', note?: string) => void
  agentName?: string
  modelInfo?: ModelInfo | null
  timestamp?: string
}

export function AgentResponseBlock({
  phase, currentThought, allThoughts, thinkingDuration,
  timeline, displayText, isStreaming,
  onHITLAction,
  agentName, modelInfo, timestamp,
}: AgentResponseBlockProps) {
  const isActive = phase !== 'idle' && phase !== 'complete' && phase !== 'error'

  return (
    <div className="group/agent animate-fade-in">
      {/* Single workflow stack: avatar node → timeline nodes */}
      <div className="chat-workflow-stack">
        {/* First node: agent identity */}
        <div className="chat-workflow-step chat-workflow-step--iconic">
          <div className="chat-timeline-dot chat-timeline-dot--avatar">
            <Bot className="w-3 h-3 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2 min-w-0 min-h-[var(--chat-workflow-dot-size)]">
            {agentName && (
              <span className="text-xs font-medium text-foreground/80">{agentName}</span>
            )}
            {modelInfo && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/50 border border-border/25 text-[10px] text-muted-foreground">
                <Cpu className="w-2.5 h-2.5" />
                <span className="truncate max-w-[200px]">
                  {modelInfo.providerDisplayName}{modelInfo.model ? ` / ${modelInfo.model}` : ''}
                </span>
              </span>
            )}
            {isActive && (
              <div className="agent-generation-pill">
                <span className="agent-generation-orb" />
                <RotatingMessage active={isActive} />
              </div>
            )}
          </div>
        </div>

        {/* Timeline steps rendered inline in the same stack */}
        <ExecutionTimeline
          items={timeline}
          phase={phase}
          inline
          currentThought={currentThought}
          allThoughts={allThoughts}
          onHITLAction={onHITLAction}
        />
      </div>

      {/* Response bubble below the stack, aligned with timeline content */}
      {(displayText || (!isActive)) && (
        <div className="pl-[var(--chat-agent-response-indent,2rem)] mt-1">
          <div className="chat-bubble-assistant">
            <StreamedResponse text={displayText} isStreaming={isStreaming} />
          </div>
          {!isStreaming && displayText && (
            <div className="flex items-center gap-2 mt-1 ml-1 opacity-0 group-hover/agent:opacity-100 transition-opacity">
              <CopyButton
                content={displayText}
                iconOnly
                className="text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              />
              {timestamp && (
                <span className="text-[11px] text-muted-foreground/70">{timestamp}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
