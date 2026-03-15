import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ConnectionStatus from '@/components/layout/ConnectionStatus'
import PageContent from '@/components/layout/PageContent'
import PageShell from '@/components/layout/PageShell'

describe('PageShell', () => {
  it('renders children and default flex column layout', () => {
    const { container } = render(
      <PageShell>
        <div>Content</div>
      </PageShell>,
    )

    expect(screen.getByText('Content')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('flex', 'flex-col')
  })

  it('disables flex column layout when nowrap is true', () => {
    const { container } = render(
      <PageShell nowrap>
        <div>Content</div>
      </PageShell>,
    )

    expect(container.firstElementChild).not.toHaveClass('flex-col')
  })
})

describe('PageContent', () => {
  it('renders children and scrolls by default', () => {
    const { container } = render(
      <PageContent>
        <div>Scrollable content</div>
      </PageContent>,
    )

    expect(screen.getByText('Scrollable content')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('overflow-y-auto')
  })

  it('disables scrolling when noScroll is true', () => {
    const { container } = render(
      <PageContent noScroll>
        <div>Static content</div>
      </PageContent>,
    )

    expect(container.firstElementChild).toHaveClass('overflow-hidden')
  })
})

describe('ConnectionStatus', () => {
  it('renders connected and reconnecting labels', () => {
    const { rerender } = render(<ConnectionStatus isConnected showLabel />)
    expect(screen.getByText('Connected')).toBeInTheDocument()

    rerender(<ConnectionStatus isConnected={false} showLabel />)
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
  })
})
