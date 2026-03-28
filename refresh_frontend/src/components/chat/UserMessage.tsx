import { useState } from 'react'
import { motion } from 'framer-motion'
import { User, Copy, Check, Paperclip } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDistanceToNow } from 'date-fns'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface Attachment {
  id: string
  name: string
  type: string
  url?: string
  size?: number
}

export interface UserMessageData {
  id: string
  content: string
  timestamp: string
  attachments?: Attachment[]
}

interface UserMessageProps {
  message: UserMessageData
  className?: string
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function UserMessage({ message, className }: UserMessageProps) {
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Silently fail
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex items-start gap-3 justify-end', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Copy button (appears on hover) */}
      <motion.div
        initial={false}
        animate={{ opacity: hovered ? 1 : 0 }}
        className="mt-2 shrink-0"
      >
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'inline-flex items-center justify-center rounded-md p-1.5',
            'text-fg-subtle hover:text-fg hover:bg-bg-sunken',
            'transition-colors focus-ring',
          )}
          aria-label="Copy message"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </motion.div>

      {/* Message bubble */}
      <div className="max-w-[75%] min-w-0 space-y-2">
        <div className="rounded-2xl rounded-tr-md bg-primary-50 px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
            {message.content}
          </p>
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end">
            {message.attachments.map((att) => (
              <a
                key={att.id}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border border-border/60',
                  'bg-bg-elevated px-2.5 py-1.5',
                  'hover:bg-bg-sunken transition-colors',
                )}
              >
                <Paperclip className="h-3 w-3 text-fg-subtle" />
                <span className="max-w-[120px] truncate font-label text-xs text-fg-muted">
                  {att.name}
                </span>
                {att.size != null && (
                  <span className="font-mono text-[10px] text-fg-subtle">
                    {formatFileSize(att.size)}
                  </span>
                )}
              </a>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div className="flex justify-end">
          <span className="font-label text-[10px] text-fg-subtle">
            {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100">
        <User className="h-4 w-4 text-primary-700" />
      </div>
    </motion.div>
  )
}
