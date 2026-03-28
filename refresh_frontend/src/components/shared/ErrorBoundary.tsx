import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

const isDev = import.meta.env.DEV

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex min-h-[320px] w-full items-center justify-center p-8">
          <div className="flex max-w-lg flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-danger/10">
              <AlertTriangle className="h-7 w-7 text-danger" />
            </div>

            <div className="space-y-2">
              <h2 className="font-display text-lg font-semibold text-fg">
                Something went wrong
              </h2>
              {isDev && this.state.error ? (
                <div className="space-y-2">
                  <p className="text-sm text-danger font-medium">
                    {this.state.error.message}
                  </p>
                  {this.state.error.stack && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-bg-sunken p-3 text-left font-mono text-xs text-fg-muted">
                      {this.state.error.stack}
                    </pre>
                  )}
                </div>
              ) : (
                <p className="text-sm text-fg-muted">
                  An unexpected error occurred. Please try again.
                </p>
              )}
            </div>

            <button
              onClick={this.handleRetry}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-fg-on-primary transition-colors hover:bg-primary-hover focus-ring"
            >
              <RotateCcw className="h-4 w-4" />
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
