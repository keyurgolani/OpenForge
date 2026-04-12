import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsSection } from '../StatsSection'

const journals = [
  { id: 'a', date: 'April 11, 2026', readonly: false, entries: [{ timestamp: '', body: 'one two three', editable: true }], created_at: '', updated_at: '' },
  { id: 'b', date: 'April 10, 2026', readonly: true, entries: [{ timestamp: '', body: 'four five', editable: false }], created_at: '', updated_at: '' },
]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-11T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('StatsSection', () => {
  it('renders streak, count, words, longest streak', () => {
    render(<StatsSection journals={journals as any} dateRange={null} />)
    expect(screen.getByText(/2-day streak/)).toBeInTheDocument()
    expect(screen.getByText(/2 entries/)).toBeInTheDocument()
    expect(screen.getByText(/5 words/)).toBeInTheDocument()
    expect(screen.getByText(/Longest streak: 2/)).toBeInTheDocument()
  })

  it('counts only entries within the selected range', () => {
    render(<StatsSection journals={journals as any} dateRange={{ from: '2026-04-11', to: '2026-04-11' }} />)
    expect(screen.getByText(/1 entry/)).toBeInTheDocument()
    expect(screen.getByText(/3 words/)).toBeInTheDocument()
  })
})
