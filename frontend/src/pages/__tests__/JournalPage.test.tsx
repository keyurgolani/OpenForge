import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import JournalPage from '../JournalPage'

vi.mock('@/lib/api', () => ({
  listJournals: vi.fn(),
  addJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
}))

vi.mock('@/components/shared/ToastProvider', () => ({
  useToast: () => ({
    toast: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

import * as api from '@/lib/api'

const journals = [
  {
    id: 'a',
    date: 'April 11, 2026',
    readonly: false,
    entries: [
      { timestamp: '2026-04-11T09:00:00Z', body: 'today body', editable: true },
    ],
    created_at: '',
    updated_at: '',
  },
  {
    id: 'b',
    date: 'April 10, 2026',
    readonly: true,
    entries: [
      { timestamp: '2026-04-10T15:00:00Z', body: 'yesterday body about bug', editable: false },
    ],
    created_at: '',
    updated_at: '',
  },
]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/w/ws-1/journal']}>
        <Routes>
          <Route path="/w/:workspaceId/journal" element={<JournalPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-04-11T12:00:00Z'))
  ;(api.listJournals as any).mockResolvedValue(journals)
})

afterEach(() => {
  vi.resetAllMocks()
})

describe('JournalPage integration', () => {
  it('renders timeline + rail + composer with seeded data', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/today body/)).toBeInTheDocument())
    expect(screen.getByText(/yesterday body about bug/)).toBeInTheDocument()
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Yesterday').length).toBeGreaterThan(0)
    expect(screen.getByText(/Calendar/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Journal entry input')).toBeInTheDocument()
  })

  it('filters entries when typing in the search box', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/today body/)).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/Search in range/i), { target: { value: 'bug' } })
    await waitFor(() => {
      expect(screen.queryByText(/today body/)).not.toBeInTheDocument()
      expect(screen.getByText(/yesterday body about bug/)).toBeInTheDocument()
    })
  })

  it('hides the composer when range excludes today', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/today body/)).toBeInTheDocument())
    // Pick an "All" preset first — composer visible
    expect(screen.getByLabelText('Journal entry input')).toBeInTheDocument()
    // Click the calendar day for April 10 (yesterday only)
    fireEvent.click(screen.getByRole('button', { name: /^Apr 10, 2026$/ }))
    await waitFor(() => {
      expect(screen.queryByLabelText('Journal entry input')).not.toBeInTheDocument()
    })
  })

  it('sends a new entry through the composer', async () => {
    ;(api.addJournalEntry as any).mockResolvedValue(undefined)
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('Journal entry input')).toBeInTheDocument())
    const ta = screen.getByLabelText('Journal entry input') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'fresh entry' } })
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: false })
    await waitFor(() => {
      expect(api.addJournalEntry).toHaveBeenCalledWith('ws-1', 'fresh entry')
    })
  })
})
