import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
    id: string
    type: ToastType
    title: string
    description?: string
    duration?: number
}

interface ToastContextValue {
    toast: (opts: Omit<Toast, 'id'>) => void
    success: (title: string, description?: string) => void
    error: (title: string, description?: string) => void
    warning: (title: string, description?: string) => void
    info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
    const ctx = useContext(ToastContext)
    if (!ctx) throw new Error('useToast must be used within ToastProvider')
    return ctx
}

const ICONS: Record<ToastType, ReactNode> = {
    success: <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
    error: <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />,
    info: <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />,
}

const STYLES: Record<ToastType, string> = {
    success: 'border-emerald-500/20 bg-emerald-500/5',
    error: 'border-red-500/20 bg-red-500/5',
    warning: 'border-amber-500/20 bg-amber-500/5',
    info: 'border-blue-500/20 bg-blue-500/5',
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const toast = useCallback((opts: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).slice(2)
        const duration = opts.duration ?? 4000
        setToasts(prev => [...prev.slice(-4), { ...opts, id }])
        setTimeout(() => dismiss(id), duration)
        return id
    }, [dismiss])

    const ctx: ToastContextValue = {
        toast,
        success: (title, description) => toast({ type: 'success', title, description }),
        error: (title, description) => toast({ type: 'error', title, description }),
        warning: (title, description) => toast({ type: 'warning', title, description }),
        info: (title, description) => toast({ type: 'info', title, description }),
    }

    return (
        <ToastContext.Provider value={ctx}>
            {children}
            {/* Toast container */}
            <div
                className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 pointer-events-none"
                aria-live="polite"
                aria-atomic="false"
            >
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`pointer-events-auto glass-card border p-3 flex items-start gap-3 animate-slide-up ${STYLES[t.type]}`}
                    >
                        {ICONS[t.type]}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug">{t.title}</p>
                            {t.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t.description}</p>
                            )}
                        </div>
                        <button
                            className="btn-ghost p-0.5 flex-shrink-0 -mt-0.5"
                            onClick={() => dismiss(t.id)}
                            aria-label="Dismiss"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}
