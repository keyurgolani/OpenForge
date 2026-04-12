import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useRef, useEffect } from 'react'
import { JournalComposer, type JournalComposerHandle } from '../JournalComposer'

describe('JournalComposer', () => {
  it('uses the chat composer CSS classes for visual parity', () => {
    const { container } = render(<JournalComposer onSend={vi.fn()} />)
    expect(container.querySelector('.chat-composer-shell')).not.toBeNull()
    expect(container.querySelector('.chat-composer-panel')).not.toBeNull()
    expect(container.querySelector('.chat-composer-textarea')).not.toBeNull()
    expect(container.querySelector('.chat-send-button')).not.toBeNull()
  })

  it('sends on Enter and clears textarea', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<JournalComposer onSend={onSend} />)
    const ta = screen.getByLabelText('Journal entry input') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'hello' } })
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: false })
    expect(onSend).toHaveBeenCalledWith('hello')
  })

  it('does not send on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<JournalComposer onSend={onSend} />)
    const ta = screen.getByLabelText('Journal entry input') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'hello' } })
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not send on whitespace-only input', () => {
    const onSend = vi.fn()
    render(<JournalComposer onSend={onSend} />)
    const ta = screen.getByLabelText('Journal entry input') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '   ' } })
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: false })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows lock placeholder when disabled', () => {
    render(<JournalComposer onSend={vi.fn()} disabled={true} />)
    const ta = screen.getByLabelText('Journal entry input') as HTMLTextAreaElement
    expect(ta).toBeDisabled()
    expect(ta.placeholder).toMatch(/locked/i)
  })

  it('prefill imperative handle populates the textarea', () => {
    function Harness() {
      const ref = useRef<JournalComposerHandle | null>(null)
      useEffect(() => {
        ref.current?.prefill('## Decision\n\n')
      }, [])
      return <JournalComposer onSend={vi.fn()} composerRef={ref} />
    }
    render(<Harness />)
    const ta = screen.getByLabelText('Journal entry input') as HTMLTextAreaElement
    expect(ta.value).toBe('## Decision\n\n')
  })
})
