import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromptsSection } from '../PromptsSection'
import type { JournalComposerHandle } from '../JournalComposer'

describe('PromptsSection', () => {
  it('renders all curated prompt buttons', () => {
    const ref = { current: null } as React.MutableRefObject<JournalComposerHandle | null>
    render(<PromptsSection composerRef={ref} disabled={false} />)
    expect(screen.getByRole('button', { name: /Daily reflection/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Decision log/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Standup/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bug discovered/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Free-form/i })).toBeInTheDocument()
  })

  it('calls composer prefill when a prompt is clicked', () => {
    const prefill = vi.fn()
    const ref = { current: { prefill } } as React.MutableRefObject<JournalComposerHandle | null>
    render(<PromptsSection composerRef={ref} disabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Decision log/i }))
    expect(prefill).toHaveBeenCalledOnce()
    expect(prefill.mock.calls[0][0]).toMatch(/^## Decision/)
  })

  it('disables buttons when disabled prop is true', () => {
    const prefill = vi.fn()
    const ref = { current: { prefill } } as React.MutableRefObject<JournalComposerHandle | null>
    render(<PromptsSection composerRef={ref} disabled={true} />)
    const btn = screen.getByRole('button', { name: /Decision log/i })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(prefill).not.toHaveBeenCalled()
  })
})
