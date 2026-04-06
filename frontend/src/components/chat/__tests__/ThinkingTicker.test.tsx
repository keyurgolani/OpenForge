import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThinkingTicker } from '@/components/chat/ThinkingTicker'

describe('ThinkingTicker', () => {
  it('renders current thought text', () => {
    render(<ThinkingTicker currentThought="Analyzing the problem..." isActive />)
    expect(screen.getByText('Analyzing the problem...')).toBeInTheDocument()
  })

  it('renders thinking placeholder when no thought', () => {
    render(<ThinkingTicker currentThought={null} isActive />)
    expect(screen.getByText(/Thinking/)).toBeInTheDocument()
  })

  it('renders collapsed summary when not active', () => {
    render(<ThinkingTicker currentThought={null} isActive={false} thinkingDuration={4200} allThoughts={['Thought 1']} />)
    expect(screen.getByText(/Thought for/)).toBeInTheDocument()
  })
})
