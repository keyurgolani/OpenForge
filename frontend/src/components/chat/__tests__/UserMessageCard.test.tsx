import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UserMessageCard } from '@/components/chat/UserMessageCard'

describe('UserMessageCard', () => {
  it('renders message content', () => {
    render(<UserMessageCard content="Hello, agent!" userInitial="K" />)
    expect(screen.getByText('Hello, agent!')).toBeInTheDocument()
  })

  it('renders avatar icon', () => {
    const { container } = render(<UserMessageCard content="Test" userInitial="K" />)
    expect(container.querySelector('.chat-avatar')).toBeInTheDocument()
  })

  it('renders attachments when provided', () => {
    render(
      <UserMessageCard
        content="See attached"
        userInitial="K"
        attachments={[{ filename: 'report.pdf', content_type: 'application/pdf' }]}
      />
    )
    expect(screen.getByText('report.pdf')).toBeInTheDocument()
  })
})
