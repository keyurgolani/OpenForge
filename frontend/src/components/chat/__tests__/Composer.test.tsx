import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Composer } from '@/components/chat/Composer'

describe('Composer', () => {
  it('renders textarea with placeholder', () => {
    render(<Composer onSend={() => {}} phase="idle" isStreaming={false} />)
    expect(screen.getByPlaceholderText('Message...')).toBeInTheDocument()
  })

  it('shows send button when idle', () => {
    render(<Composer onSend={() => {}} phase="idle" isStreaming={false} />)
    expect(screen.getByLabelText('Send message')).toBeInTheDocument()
  })

  it('shows stop button when streaming', () => {
    render(<Composer onSend={() => {}} onCancel={() => {}} phase="running" isStreaming />)
    expect(screen.getByLabelText('Stop generation')).toBeInTheDocument()
  })

  it('calls onSend on Enter', async () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} phase="idle" isStreaming={false} />)
    const input = screen.getByPlaceholderText('Message...')
    await userEvent.type(input, 'Hello{Enter}')
    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('renders attachment chips', () => {
    render(
      <Composer
        onSend={() => {}}
        phase="idle"
        isStreaming={false}
        attachments={[{ id: '1', filename: 'doc.pdf', content_type: 'application/pdf', size: 1024 }]}
      />
    )
    expect(screen.getByText('doc.pdf')).toBeInTheDocument()
  })
})
