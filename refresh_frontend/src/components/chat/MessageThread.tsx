import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/cn'
import UserMessage from './UserMessage'
import AgentResponse from './AgentResponse'
import type { UserMessageData } from './UserMessage'
import type { AgentResponseData } from './AgentResponse'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ChatMessage =
  | { role: 'user'; data: UserMessageData }
  | { role: 'assistant'; data: AgentResponseData }

interface MessageThreadProps {
  messages: ChatMessage[]
  loading?: boolean
  onHITLResolve?: (hitlId: string, approved: boolean) => void
  className?: string
}

/* -------------------------------------------------------------------------- */
/* Skeleton loader                                                            */
/* -------------------------------------------------------------------------- */

function MessageSkeleton({ align }: { align: 'left' | 'right' }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3',
        align === 'right' && 'justify-end',
      )}
    >
      {align === 'left' && (
        <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-bg-sunken" />
      )}
      <div
        className={cn(
          'space-y-2',
          align === 'right' ? 'max-w-[60%]' : 'max-w-[70%]',
        )}
      >
        <div className="h-4 w-48 animate-pulse rounded-md bg-bg-sunken" />
        <div className="h-4 w-32 animate-pulse rounded-md bg-bg-sunken" />
        <div className="h-4 w-56 animate-pulse rounded-md bg-bg-sunken" />
      </div>
      {align === 'right' && (
        <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-bg-sunken" />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

function EmptyThread() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-sunken">
        <MessageSquare className="h-8 w-8 text-fg-subtle" strokeWidth={1.5} />
      </div>
      <div className="max-w-sm text-center space-y-1.5">
        <h3 className="font-display text-base font-semibold text-fg">
          Start a conversation
        </h3>
        <p className="text-sm leading-relaxed text-fg-muted">
          Send a message to begin working with the agent. Ask questions,
          delegate tasks, or explore your workspace.
        </p>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function MessageThread({
  messages,
  loading = false,
  onHITLResolve,
  className,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showScrollFab, setShowScrollFab] = useState(false)
  const isAutoScrolling = useRef(true)

  /* Scroll tracking -------------------------------------------------------- */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const isNearBottom = distanceFromBottom < 80
    setShowScrollFab(!isNearBottom)
    isAutoScrolling.current = isNearBottom
  }, [])

  /* Auto-scroll on new messages -------------------------------------------- */
  useEffect(() => {
    if (isAutoScrolling.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    isAutoScrolling.current = true
  }

  /* Loading state ---------------------------------------------------------- */
  if (loading && messages.length === 0) {
    return (
      <div className={cn('flex flex-1 flex-col gap-6 overflow-y-auto p-6', className)}>
        <MessageSkeleton align="right" />
        <MessageSkeleton align="left" />
        <MessageSkeleton align="right" />
        <MessageSkeleton align="left" />
      </div>
    )
  }

  /* Empty state ------------------------------------------------------------ */
  if (!loading && messages.length === 0) {
    return (
      <div className={cn('flex flex-1', className)}>
        <EmptyThread />
      </div>
    )
  }

  return (
    <div className={cn('relative flex flex-1 flex-col overflow-hidden', className)}>
      {/* Scrollable message area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
      >
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <UserMessage
                  key={msg.data.id}
                  message={msg.data}
                />
              )
            }
            return (
              <AgentResponse
                key={msg.data.id}
                message={msg.data}
                onHITLResolve={onHITLResolve}
              />
            )
          })}

          {/* Scroll anchor */}
          <div ref={bottomRef} className="h-px" />
        </div>
      </div>

      {/* Scroll-to-bottom FAB */}
      <AnimatePresence>
        {showScrollFab && (
          <motion.button
            type="button"
            onClick={scrollToBottom}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'absolute bottom-4 left-1/2 -translate-x-1/2',
              'flex h-9 w-9 items-center justify-center rounded-full',
              'bg-bg-elevated border border-border shadow-lg',
              'text-fg-muted hover:text-fg hover:bg-bg-sunken',
              'transition-colors focus-ring',
            )}
            aria-label="Scroll to bottom"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
