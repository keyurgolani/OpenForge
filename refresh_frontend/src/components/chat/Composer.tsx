import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Send, Paperclip } from 'lucide-react'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ComposerProps {
  onSend: (content: string, attachments?: File[]) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function Composer({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  className,
}: ComposerProps) {
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSend = content.trim().length > 0 && !disabled

  /* Auto-resize textarea --------------------------------------------------- */
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [content, adjustHeight])

  /* Handlers --------------------------------------------------------------- */
  function handleSend() {
    if (!canSend) return
    onSend(content.trim(), attachments.length > 0 ? attachments : undefined)
    setContent('')
    setAttachments([])
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleAttachClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    setAttachments((prev) => [...prev, ...Array.from(files)])
    // Reset the input so the same file can be re-selected
    e.target.value = ''
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {attachments.map((file, i) => (
            <motion.div
              key={`${file.name}-${i}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                'flex items-center gap-1.5 rounded-md border border-border/60',
                'bg-bg-elevated px-2.5 py-1',
              )}
            >
              <Paperclip className="h-3 w-3 text-fg-subtle" />
              <span className="max-w-[120px] truncate font-label text-xs text-fg-muted">
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="ml-0.5 text-fg-subtle hover:text-fg transition-colors"
                aria-label={`Remove ${file.name}`}
              >
                <span className="text-xs leading-none">&times;</span>
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div
        className={cn(
          'flex items-end gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2',
          'transition-colors duration-200',
          'focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20',
          disabled && 'opacity-60',
        )}
      >
        {/* Attachment button */}
        <button
          type="button"
          onClick={handleAttachClick}
          disabled={disabled}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            'text-fg-subtle hover:text-fg hover:bg-bg-sunken',
            'transition-colors duration-150 focus-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          aria-label="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent py-1.5',
            'text-sm leading-relaxed text-fg placeholder:text-fg-subtle',
            'outline-none',
            'font-body',
            'disabled:cursor-not-allowed',
          )}
          style={{ maxHeight: '200px' }}
        />

        {/* Send button */}
        <motion.button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          whileTap={canSend ? { scale: 0.92 } : undefined}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            'transition-all duration-200 focus-ring',
            canSend
              ? 'bg-primary text-fg-on-primary hover:bg-primary-hover shadow-sm'
              : 'bg-bg-sunken text-fg-subtle cursor-not-allowed',
          )}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </motion.button>
      </div>

      {/* Helper text */}
      <p className="px-1 font-label text-[10px] text-fg-subtle">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  )
}
