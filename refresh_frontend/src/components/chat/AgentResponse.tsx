import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Bot,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import MarkdownIt from 'markdown-it'
import { cn } from '@/lib/cn'
import { formatDistanceToNow } from 'date-fns'
import TimelineStep from './TimelineStep'
import ToolCallCard from './ToolCallCard'
import HITLApprovalCard from './HITLApprovalCard'
import type { TimelineStepData } from './TimelineStep'
import type { ToolCallData } from './ToolCallCard'
import type { HITLApprovalData } from './HITLApprovalCard'

/* -------------------------------------------------------------------------- */
/* Markdown renderer (singleton)                                              */
/* -------------------------------------------------------------------------- */

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
})

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface AgentResponseData {
  id: string
  content: string
  timestamp: string
  streaming?: boolean
  agentName?: string
  modelName?: string
  timeline?: TimelineStepData[]
  toolCalls?: ToolCallData[]
  hitlApprovals?: HITLApprovalData[]
}

interface AgentResponseProps {
  message: AgentResponseData
  onHITLResolve?: (hitlId: string, approved: boolean) => void
  className?: string
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function AgentResponse({
  message,
  onHITLResolve,
  className,
}: AgentResponseProps) {
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)

  const hasTimeline =
    (message.timeline && message.timeline.length > 0) ||
    (message.toolCalls && message.toolCalls.length > 0)

  const renderedContent = useMemo(
    () => md.render(message.content || ''),
    [message.content],
  )

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Silently fail
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex items-start gap-3', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-100">
        <Bot className="h-4 w-4 text-secondary-700" />
      </div>

      {/* Body */}
      <div className="max-w-[85%] min-w-0 flex-1 space-y-2">
        {/* Agent label */}
        {message.agentName && (
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-secondary" />
            <span className="font-label text-xs font-semibold text-secondary">
              {message.agentName}
            </span>
            {message.modelName && (
              <span className="font-mono text-[10px] text-fg-subtle">
                / {message.modelName}
              </span>
            )}
          </div>
        )}

        {/* Content */}
        <div className="rounded-2xl rounded-tl-md bg-bg-elevated px-4 py-3 border border-border/30">
          {message.content ? (
            <div
              className={cn(
                'prose prose-sm max-w-none',
                'prose-headings:font-display prose-headings:text-fg',
                'prose-p:text-fg prose-p:leading-relaxed',
                'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
                'prose-code:font-mono prose-code:text-xs prose-code:bg-bg-sunken prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-fg',
                'prose-pre:bg-bg-sunken prose-pre:border prose-pre:border-border/30 prose-pre:rounded-lg',
                'prose-strong:text-fg prose-strong:font-semibold',
                'prose-ul:text-fg prose-ol:text-fg',
                'prose-blockquote:border-primary/30 prose-blockquote:text-fg-muted',
              )}
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          ) : message.streaming ? (
            <div className="flex items-center gap-1.5 py-1">
              <span className="text-sm text-fg-muted">Thinking</span>
              <span className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="inline-block h-1.5 w-1.5 rounded-full bg-secondary"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </span>
            </div>
          ) : null}

          {/* Streaming cursor */}
          {message.streaming && message.content && (
            <motion.span
              className="inline-block h-4 w-0.5 bg-secondary ml-0.5 align-middle"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          )}
        </div>

        {/* HITL Approvals */}
        {message.hitlApprovals && message.hitlApprovals.length > 0 && (
          <div className="space-y-2">
            {message.hitlApprovals.map((approval) => (
              <HITLApprovalCard
                key={approval.id}
                approval={approval}
                onResolve={onHITLResolve}
              />
            ))}
          </div>
        )}

        {/* Timeline toggle */}
        {hasTimeline && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setTimelineOpen(!timelineOpen)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1',
                'font-label text-xs font-medium text-fg-subtle',
                'hover:text-fg-muted hover:bg-fg/[0.03]',
                'transition-colors duration-150',
              )}
            >
              {timelineOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Agent timeline
              {message.timeline && (
                <span className="rounded-full bg-bg-sunken px-1.5 py-0.5 font-mono text-[10px]">
                  {(message.timeline?.length ?? 0) + (message.toolCalls?.length ?? 0)}
                </span>
              )}
            </button>

            {timelineOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-2 pl-1"
              >
                {/* Timeline steps */}
                {message.timeline?.map((step) => (
                  <TimelineStep key={step.id} step={step} />
                ))}

                {/* Tool calls */}
                {message.toolCalls?.map((call) => (
                  <ToolCallCard key={call.id} call={call} />
                ))}
              </motion.div>
            )}
          </div>
        )}

        {/* Timestamp + copy */}
        <div className="flex items-center gap-2">
          <span className="font-label text-[10px] text-fg-subtle">
            {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
          </span>

          <motion.div initial={false} animate={{ opacity: hovered ? 1 : 0 }}>
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'inline-flex items-center justify-center rounded-md p-1',
                'text-fg-subtle hover:text-fg hover:bg-bg-sunken',
                'transition-colors focus-ring',
              )}
              aria-label="Copy response"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
