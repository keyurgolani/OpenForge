import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarSection } from '../CalendarSection'

const journals = [
  { id: 'a', date: 'April 09, 2026', readonly: true, entries: [{ timestamp: '', body: 'x', editable: false }], created_at: '', updated_at: '' },
  { id: 'b', date: 'April 11, 2026', readonly: false, entries: [{ timestamp: '', body: 'y', editable: true }], created_at: '', updated_at: '' },
]

describe('CalendarSection', () => {
  it('renders the section header with collapse toggle', () => {
    render(<CalendarSection journals={journals as any} dateRange={null} onChange={vi.fn()} />)
    expect(screen.getByText(/CALENDAR/i)).toBeInTheDocument()
  })

  it('renders day cells for the current month', () => {
    render(<CalendarSection journals={journals as any} dateRange={null} onChange={vi.fn()} />)
    // Day "1" must appear at least once
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('calls onChange with a single-day range when one day is clicked', () => {
    const onChange = vi.fn()
    render(<CalendarSection journals={journals as any} dateRange={null} onChange={onChange} initialMonth={new Date('2026-04-15T00:00:00Z')} />)
    fireEvent.click(screen.getByRole('button', { name: /^Apr 11, 2026$/ }))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-04-11', to: '2026-04-11' })
  })

  it('extends the range when a second day is clicked', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <CalendarSection journals={journals as any} dateRange={{ from: '2026-04-09', to: '2026-04-09' }} onChange={onChange} initialMonth={new Date('2026-04-15T00:00:00Z')} />
    )
    fireEvent.click(screen.getByRole('button', { name: /^Apr 11, 2026$/ }))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-04-09', to: '2026-04-11' })
  })

  it('quick preset "All" calls onChange with null', () => {
    const onChange = vi.fn()
    render(<CalendarSection journals={journals as any} dateRange={{ from: '2026-04-01', to: '2026-04-30' }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^All$/ }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('renders an entry-dot indicator on days with entries', () => {
    const { container } = render(
      <CalendarSection journals={journals as any} dateRange={null} onChange={vi.fn()} initialMonth={new Date('2026-04-15T00:00:00Z')} />
    )
    // Count cells with the "has-entry" marker class
    expect(container.querySelectorAll('.calendar-day-has-entry').length).toBe(2)
  })
})
