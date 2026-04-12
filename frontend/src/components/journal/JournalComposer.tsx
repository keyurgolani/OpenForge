import { useRef, useState, useCallback, useImperativeHandle, KeyboardEvent, MutableRefObject } from 'react'
import { Send, Loader2 } from 'lucide-react'

export interface JournalComposerHandle {
  prefill: (text: string) => void
}

interface JournalComposerProps {
  onSend: (body: string) => void | Promise<void>
  disabled?: boolean
  composerRef?: MutableRefObject<JournalComposerHandle | null>
}

export function JournalComposer({ onSend, disabled, composerRef }: JournalComposerProps) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed || disabled || submitting) return
    setSubmitting(true)
    try {
      await onSend(trimmed)
      setValue('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    } finally {
      setSubmitting(false)
    }
  }, [value, disabled, submitting, onSend])

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

  useImperativeHandle(
    composerRef as MutableRefObject<JournalComposerHandle | null> | undefined,
    () => ({
      prefill: (text: string) => {
        if (value.trim() && !window.confirm('Replace current draft?')) return
        setValue(text)
        setTimeout(() => {
          const ta = textareaRef.current
          if (ta) {
            ta.focus()
            ta.setSelectionRange(text.length, text.length)
            ta.style.height = 'auto'
            ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
          }
        }, 0)
      },
    }),
    [value],
  )

  return (
    <div className="chat-composer-shell pointer-events-none z-20 px-3 py-0.5 md:px-4 md:py-1 pb-2">
      <div className="pointer-events-auto">
        <div className="chat-composer-panel">
          <div className="flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder={
                disabled
                  ? "Today's journal is locked. Switch to today to write."
                  : 'Write a journal entry... (Enter to submit, Shift+Enter for newline)'
              }
              disabled={disabled}
              rows={1}
              className="chat-composer-textarea w-full"
              aria-label="Journal entry input"
            />
            <div className="flex items-center justify-end">
              <button
                onClick={handleSend}
                disabled={!value.trim() || disabled || submitting}
                className="chat-send-button disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Save entry"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
