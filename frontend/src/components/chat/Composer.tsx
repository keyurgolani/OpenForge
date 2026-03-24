import { useRef, useState, useCallback, KeyboardEvent } from 'react'
import { Send, Square, Paperclip } from 'lucide-react'
import { AttachmentChip } from './AttachmentChip'
import type { AgentPhase } from '@/hooks/chat/useAgentPhase'

interface ComposerAttachment {
  id: string
  filename: string
  content_type: string
  size: number
}

interface ComposerProps {
  onSend: (content: string) => void
  onCancel?: () => void
  onAttach?: (files: File[]) => void
  onRemoveAttachment?: (id: string) => void
  phase: AgentPhase
  isStreaming: boolean
  attachments?: ComposerAttachment[]
  disabled?: boolean
}

export function Composer({ onSend, onCancel, onAttach, onRemoveAttachment, phase, isStreaming, attachments = [], disabled }: ComposerProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isActive = phase !== 'idle' && phase !== 'complete' && phase !== 'error'

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isActive) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, isActive, onSend])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length && onAttach) {
      onAttach(Array.from(e.dataTransfer.files))
    }
  }

  return (
    <div className="px-8 pb-5 pt-4 bg-gradient-to-t from-card/60 to-transparent backdrop-blur-[18px] border-t border-border">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att) => (
            <AttachmentChip key={att.id} filename={att.filename} size={att.size} onRemove={onRemoveAttachment ? () => onRemoveAttachment(att.id) : undefined} />
          ))}
        </div>
      )}
      <div
        className="flex items-end gap-2.5 chat-composer-panel rounded-lg px-3.5 py-2.5"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Message..."
          disabled={disabled || (isActive && phase !== 'awaiting_approval')}
          rows={1}
          className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-foreground placeholder:text-muted-foreground/60 leading-relaxed max-h-[160px]"
          aria-label="Chat message input"
        />
        <div className="flex gap-1.5 items-center flex-shrink-0">
          {onAttach && (
            <>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) onAttach(Array.from(e.target.files)) }} />
              <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 rounded-sm btn-ghost flex items-center justify-center" aria-label="Attach file">
                <Paperclip className="w-4 h-4 text-muted-foreground" />
              </button>
            </>
          )}
          {isActive && onCancel ? (
            <button onClick={onCancel} className="w-8 h-8 rounded-sm btn-ghost flex items-center justify-center" aria-label="Stop generation">
              <Square className="w-4 h-4 text-muted-foreground" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!value.trim() || isActive} className="w-8 h-8 rounded-sm btn-primary flex items-center justify-center disabled:opacity-40" aria-label="Send message">
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
