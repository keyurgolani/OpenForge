import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Timeline } from '@/components/chat/Timeline'
import type { TimelineItem } from '@/hooks/chat/useAgentPhase'

describe('Timeline', () => {
  const items: TimelineItem[] = [
    { type: 'tool_call', call_id: 'c1', tool_name: 'search_web', arguments: { query: 'test' }, status: 'complete', hitl: null, success: true, output: 'Found 3 results', duration_ms: 800 },
    { type: 'tool_call', call_id: 'c2', tool_name: 'read_url', arguments: { url: 'https://example.com' }, status: 'running', hitl: null },
  ]

  it('renders timeline steps for each item', () => {
    render(<Timeline items={items} onApproveHITL={() => {}} onDenyHITL={() => {}} />)
    expect(screen.getByText('search_web')).toBeInTheDocument()
    expect(screen.getByText('read_url')).toBeInTheDocument()
  })

  it('returns null for empty items', () => {
    const { container } = render(<Timeline items={[]} onApproveHITL={() => {}} onDenyHITL={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
