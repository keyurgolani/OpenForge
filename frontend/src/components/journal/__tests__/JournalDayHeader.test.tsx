import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JournalDayHeader } from '../JournalDayHeader'

describe('JournalDayHeader', () => {
  it('renders the date label and entry/word counts', () => {
    render(<JournalDayHeader label="Today" entryCount={3} wordCount={120} readonly={false} />)
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText(/3 entries/)).toBeInTheDocument()
    expect(screen.getByText(/120 words/)).toBeInTheDocument()
    expect(screen.queryByText(/Locked/i)).not.toBeInTheDocument()
  })

  it('uses singular "entry" for count of 1', () => {
    render(<JournalDayHeader label="Yesterday" entryCount={1} wordCount={20} readonly={true} />)
    expect(screen.getByText(/1 entry\b/)).toBeInTheDocument()
  })

  it('shows "Locked" badge when readonly', () => {
    render(<JournalDayHeader label="April 9, 2026" entryCount={2} wordCount={50} readonly={true} />)
    expect(screen.getByText(/Locked/i)).toBeInTheDocument()
  })
})
