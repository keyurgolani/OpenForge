import { AlertTriangle, Trash2, Info, CheckCircle, X } from 'lucide-react'

interface ConfirmModalProps {
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'danger' | 'warning' | 'info' | 'success'
    onConfirm: () => void
    onCancel: () => void
    loading?: boolean
}

const VARIANT_CONFIG = {
    danger: {
        icon: Trash2,
        iconClass: 'text-red-400 bg-red-500/15',
        confirmClass: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    },
    warning: {
        icon: AlertTriangle,
        iconClass: 'text-amber-400 bg-amber-500/15',
        confirmClass: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    },
    info: {
        icon: Info,
        iconClass: 'text-blue-400 bg-blue-500/15',
        confirmClass: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    },
    success: {
        icon: CheckCircle,
        iconClass: 'text-emerald-400 bg-emerald-500/15',
        confirmClass: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
    },
}

export function ConfirmModal({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'warning',
    onConfirm,
    onCancel,
    loading = false,
}: ConfirmModalProps) {
    if (!open) return null

    const config = VARIANT_CONFIG[variant]
    const IconComponent = config.icon

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
                onClick={onCancel}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md glass-card rounded-2xl border border-border/60 p-6 shadow-2xl animate-fade-in">
                {/* Close button */}
                <button
                    type="button"
                    onClick={onCancel}
                    className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                    aria-label="Close"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Content */}
                <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${config.iconClass}`}>
                        <IconComponent className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{message}</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                        className="btn-ghost px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading}
                        className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${config.confirmClass}`}
                    >
                        {loading && (
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                        )}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}