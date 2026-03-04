import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
    children: ReactNode
    fallback?: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

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
                <div className="flex items-center justify-center min-h-[200px] p-8">
                    <div className="glass-card p-6 max-w-md w-full text-center space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
                            <AlertTriangle className="w-6 h-6 text-red-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm mb-1">Something went wrong</h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {this.state.error?.message ?? 'An unexpected error occurred.'}
                            </p>
                        </div>
                        <button
                            className="btn-primary text-sm mx-auto"
                            onClick={this.handleRetry}
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Try Again
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
