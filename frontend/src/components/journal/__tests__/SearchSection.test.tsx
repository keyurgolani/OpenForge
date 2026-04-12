import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchSection } from '../SearchSection'

const journals = [
  { id: 'a', date: 'April 11, 2026', readonly: false, entries: [{ timestamp: '2026-04-11T09:00:00Z', body: 'The bug was sneaky', editable: true }], created_at: '', updated_at: '' },
  { id: 'b', date: 'April 10, 2026', readonly: true, entries: [{ timestamp: '2026-04-10T16:00:00Z', body: 'Found a bug today', editable: false }], created_at: '', updated_at: '' },
]

describe('SearchSection', () => {
  it('shows match count when a query has results', () => {
    render(<SearchSection journals={journals as any} query="bug" onQueryChange={vi.fn()} onResultClick={vi.fn()} />)
    expect(screen.getByText(/2 matches/)).toBeInTheDocument()
  })

  it('shows empty state when no matches', () => {
    render(<SearchSection journals={journals as any} query="elephant" onQueryChange={vi.fn()} onResultClick={vi.fn()} />)
    expect(screen.getByText(/No matches/i)).toBeInTheDocument()
  })

  it('calls onResultClick with the journal+entry key on result click', () => {
    const onResultClick = vi.fn()
    render(<SearchSection journals={journals as any} query="bug" onQueryChange={vi.fn()} onResultClick={onResultClick} />)
    const buttons = screen.getAllByRole('button', { name: /bug/i })
    // The first match button corresponds to journal a, entry 0
    fireEvent.click(buttons[0])
    expect(onResultClick).toHaveBeenCalledWith('a:0')
  })

  it('calls onQueryChange when typing in the input', () => {
    const onQueryChange = vi.fn()
    render(<SearchSection journals={journals as any} query="" onQueryChange={onQueryChange} onResultClick={vi.fn()} />)
    const input = screen.getByPlaceholderText(/Search in range/i)
    fireEvent.change(input, { target: { value: 'foo' } })
    expect(onQueryChange).toHaveBeenCalledWith('foo')
  })
})
