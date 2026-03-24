import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToolCallCard } from '@/components/chat/ToolCallCard'

describe('ToolCallCard', () => {
  it('renders tool name', () => {
    render(<ToolCallCard toolName="search_web" arguments={{ query: 'React patterns' }} status="running" />)
    expect(screen.getByText('search_web')).toBeInTheDocument()
  })

  it('shows input preview for search tools', () => {
    render(<ToolCallCard toolName="search_web" arguments={{ query: 'React patterns' }} status="running" />)
    expect(screen.getByText(/"React patterns"/)).toBeInTheDocument()
  })

  it('shows duration when complete', () => {
    render(<ToolCallCard toolName="search_web" arguments={{}} status="complete" durationMs={1200} />)
    expect(screen.getByText('1.2s')).toBeInTheDocument()
  })

  it('shows error message when errored', () => {
    render(<ToolCallCard toolName="search_web" arguments={{}} status="error" error="Connection timeout" />)
    expect(screen.getByText('Connection timeout')).toBeInTheDocument()
  })
})
