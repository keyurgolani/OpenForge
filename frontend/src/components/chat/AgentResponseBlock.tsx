import { Bot, Cpu } from 'lucide-react'
import { TimelineStep } from './TimelineStep'
import { StreamedResponse } from './StreamedResponse'
import { CopyButton } from '@/components/shared/CopyButton'
import type { AgentPhase, TimelineItem, ModelInfo } from '@/hooks/chat/useAgentPhase'

interface AgentResponseBlockProps {
  phase: AgentPhase
  currentThought: string | null
  allThoughts: string[]
  thinkingDuration: number | null
  timeline: TimelineItem[]
  displayText: string
  isStreaming: boolean
  onApproveHITL: (hitlId: string) => void
  onDenyHITL: (hitlId: string) => void
  agentName?: string
  modelInfo?: ModelInfo | null
  timestamp?: string
}

export function AgentResponseBlock({
  phase, currentThought, allThoughts, thinkingDuration,
  timeline, displayText, isStreaming,
  onApproveHITL, onDenyHITL,
  agentName, modelInfo, timestamp,
}: AgentResponseBlockProps) {
  const isActive = phase !== 'idle' && phase !== 'complete' && phase !== 'error'

  const lastRunningThinkingIdx = timeline.reduce(
    (acc, item, i) => (item.type === 'thinking' && item.status === 'running' ? i : acc),
    -1,
  )

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
                <span>Responding…</span>
              </div>
            )}
          </div>
        </div>

        {/* Remaining timeline steps rendered inline in the same stack */}
        {timeline.map((item, i) => (
          <TimelineStep
            key={item.type === 'thinking' ? item.id : item.call_id}
            item={item}
            isLast={i === timeline.length - 1}
            depth={0}
            onApproveHITL={onApproveHITL}
            onDenyHITL={onDenyHITL}
            currentThought={i === lastRunningThinkingIdx ? currentThought : undefined}
            allThoughts={i === lastRunningThinkingIdx ? allThoughts : undefined}
          />
        ))}
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
