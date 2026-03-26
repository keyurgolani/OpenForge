import { useRef, useState, useCallback, useEffect, KeyboardEvent } from 'react'
import { Send, Square, Paperclip } from 'lucide-react'
import { AttachmentChip } from './AttachmentChip'
import { ComposerModelPicker, type ModelPickerOption } from './ComposerModelPicker'
import type { AgentPhase } from '@/hooks/chat/useAgentPhase'

interface ComposerAttachment {
  id: string
  filename: string
  content_type: string
  size: number
  status?: 'uploading' | 'extracted' | 'error'
  onRetry?: () => void
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
  modelOptions?: ModelPickerOption[]
  selectedModelKey?: string
  onModelSelect?: (key: string) => void
  defaultModelLabel?: string
}

export function Composer({ onSend, onCancel, onAttach, onRemoveAttachment, phase, isStreaming, attachments = [], disabled, modelOptions, selectedModelKey, onModelSelect, defaultModelLabel }: ComposerProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isActive = phase !== 'idle' && phase !== 'complete' && phase !== 'error'
  const hasPending = attachments.some(a => a.status === 'uploading')
  const composerDisabled = disabled || (isActive && phase !== 'awaiting_approval')

  // Auto-focus textarea when it becomes enabled
  useEffect(() => {
    if (!composerDisabled && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [composerDisabled])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isActive || hasPending) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, isActive, hasPending, onSend])

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
    <div className="chat-composer-shell pointer-events-none z-20 px-4 py-1 md:px-6 md:py-1.5 pb-3">
      <div className="pointer-events-auto">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 px-2">
            {attachments.map((att) => (
              <AttachmentChip key={att.id} filename={att.filename} size={att.size} status={att.status} onRetry={att.onRetry} onRemove={onRemoveAttachment ? () => onRemoveAttachment(att.id) : undefined} />
            ))}
          </div>
        )}
        <div
          className="chat-composer-panel"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
        >
          <div className="flex items-end gap-2.5">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder="Message..."
              disabled={composerDisabled}
              rows={1}
              className="chat-composer-textarea"
              aria-label="Chat message input"
            />
            <div className="flex gap-1.5 items-center flex-shrink-0 pb-0.5">
              {modelOptions && modelOptions.length > 0 && onModelSelect && (
                <ComposerModelPicker
                  options={modelOptions}
                  selectedKey={selectedModelKey ?? ''}
                  onSelect={onModelSelect}
                  defaultLabel={defaultModelLabel}
                />
              )}
              {onAttach && (
                <>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) onAttach(Array.from(e.target.files)) }} />
                  <button onClick={() => fileInputRef.current?.click()} className="chat-control-pill h-9 min-w-9 justify-center" aria-label="Attach file">
                    <Paperclip className="w-4 h-4" />
                  </button>
                </>
              )}
              {isActive && onCancel ? (
                <button onClick={onCancel} className="chat-control-pill h-9 min-w-9 justify-center" aria-label="Stop generation">
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!value.trim() || isActive || hasPending}
                  className="chat-send-button disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
