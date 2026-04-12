import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JournalTimeline } from '../JournalTimeline'

const journals = [
  { id: 'a', date: 'April 11, 2026', readonly: false, entries: [{ timestamp: '2026-04-11T09:00:00Z', body: 'today entry', editable: true }], created_at: '', updated_at: '' },
  { id: 'b', date: 'April 10, 2026', readonly: true, entries: [
    { timestamp: '2026-04-10T09:00:00Z', body: 'morning', editable: false },
    { timestamp: '2026-04-10T15:00:00Z', body: 'afternoon', editable: false },
  ], created_at: '', updated_at: '' },
]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-11T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('JournalTimeline', () => {
  it('renders a day header per day and entries under each', () => {
    render(
      <JournalTimeline
        journals={journals as any}
        searchQuery=""
        pulseEntryKey={null}
        onEditStart={vi.fn()}
      />
    )
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
    expect(screen.getByText(/today entry/)).toBeInTheDocument()
    expect(screen.getByText(/morning/)).toBeInTheDocument()
    expect(screen.getByText(/afternoon/)).toBeInTheDocument()
  })

  it('filters entries by search query and omits days with no matches', () => {
    render(
      <JournalTimeline
        journals={journals as any}
        searchQuery="afternoon"
        pulseEntryKey={null}
        onEditStart={vi.fn()}
      />
    )
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
    expect(screen.getByText(/afternoon/)).toBeInTheDocument()
    expect(screen.queryByText(/morning/)).not.toBeInTheDocument()
  })

  it('renders empty state when no journals match', () => {
    render(
      <JournalTimeline
        journals={[]}
        searchQuery=""
        pulseEntryKey={null}
        onEditStart={vi.fn()}
      />
    )
    expect(screen.getByText(/No journal entries/i)).toBeInTheDocument()
  })
})
