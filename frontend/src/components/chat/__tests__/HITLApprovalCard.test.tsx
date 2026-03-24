import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HITLApprovalCard } from '@/components/chat/HITLApprovalCard'

describe('HITLApprovalCard', () => {
  it('renders tool name and action summary', () => {
    render(
      <HITLApprovalCard
        toolName="send_email"
        actionSummary="Send email to jane@company.com"
        status="pending"
        onApprove={() => {}}
        onDeny={() => {}}
      />
    )
    expect(screen.getByText('send_email')).toBeInTheDocument()
    expect(screen.getByText(/Send email/)).toBeInTheDocument()
  })

  it('shows approve and deny buttons when pending', () => {
    render(
      <HITLApprovalCard toolName="send_email" actionSummary="" status="pending" onApprove={() => {}} onDeny={() => {}} />
    )
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /deny/i })).toBeInTheDocument()
  })

  it('calls onApprove when approve clicked', async () => {
    const onApprove = vi.fn()
    render(
      <HITLApprovalCard toolName="send_email" actionSummary="" status="pending" onApprove={onApprove} onDeny={() => {}} />
    )
    await userEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(onApprove).toHaveBeenCalledOnce()
  })

  it('shows approved state', () => {
    render(
      <HITLApprovalCard toolName="send_email" actionSummary="" status="approved" onApprove={() => {}} onDeny={() => {}} />
    )
    expect(screen.getByText(/approved/i)).toBeInTheDocument()
  })
})
