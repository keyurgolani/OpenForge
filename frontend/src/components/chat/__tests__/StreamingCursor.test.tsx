import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { StreamingCursor } from '@/components/chat/StreamingCursor'

describe('StreamingCursor', () => {
  it('renders a span with cursor-pulse animation', () => {
    const { container } = render(<StreamingCursor />)
    const cursor = container.querySelector('span')
    expect(cursor).toBeTruthy()
    expect(cursor?.className).toContain('streaming-cursor')
  })
})
