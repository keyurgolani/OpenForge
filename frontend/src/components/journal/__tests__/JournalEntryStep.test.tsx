import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { JournalEntryStep } from '../JournalEntryStep'

const baseProps = {
  timestamp: '2026-04-11T14:30:00Z',
  body: 'Hello **world**',
  editable: false,
  readonly: false,
  pulse: false,
  onEditStart: vi.fn(),
}

describe('JournalEntryStep', () => {
  it('renders the formatted timestamp', () => {
    render(<JournalEntryStep {...baseProps} />)
    // Time is locale-formatted; just assert it includes a digit and "M" (AM/PM)
    expect(screen.getByText(/\d+:\d+\s?(AM|PM)/i)).toBeInTheDocument()
  })

  it('renders markdown body', () => {
    const { container } = render(<JournalEntryStep {...baseProps} body="Hello **world**" />)
    // markdown-it should produce a <strong>world</strong>
    expect(container.querySelector('strong')).toHaveTextContent('world')
  })

  it('shows edit button when editable', () => {
    const onEditStart = vi.fn()
    render(<JournalEntryStep {...baseProps} editable={true} onEditStart={onEditStart} />)
    const editBtn = screen.getByRole('button', { name: /edit/i })
    fireEvent.click(editBtn)
    expect(onEditStart).toHaveBeenCalledOnce()
  })

  it('hides edit button when not editable', () => {
    render(<JournalEntryStep {...baseProps} editable={false} />)
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })

  it('applies animate-flash class when pulse is true', () => {
    const { container } = render(<JournalEntryStep {...baseProps} pulse={true} />)
    expect(container.querySelector('.animate-flash')).not.toBeNull()
  })
})
