import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { JournalRail } from '../JournalRail'
import type { JournalComposerHandle } from '../JournalComposer'

describe('JournalRail', () => {
  it('renders all four sections', () => {
    function Harness() {
      const ref = useRef<JournalComposerHandle | null>(null)
      return (
        <JournalRail
          journals={[]}
          filteredJournals={[]}
          dateRange={null}
          onDateRangeChange={vi.fn()}
          searchQuery=""
          onSearchQueryChange={vi.fn()}
          onSearchResultClick={vi.fn()}
          composerRef={ref}
          rangeIncludesToday={true}
        />
      )
    }
    render(<Harness />)
    expect(screen.getByText(/Calendar/i)).toBeInTheDocument()
    expect(screen.getByText(/Stats/i)).toBeInTheDocument()
    expect(screen.getByText(/Prompts/i)).toBeInTheDocument()
    expect(screen.getByText(/Search/i)).toBeInTheDocument()
  })
})
