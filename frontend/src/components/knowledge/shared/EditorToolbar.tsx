import type { ReactNode } from 'react'
import { ArrowLeft, Check, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface EditorToolbarProps {
    onBack: () => void
    title?: string
    saveStatus: SaveStatus
    actions?: ReactNode
}

const statusConfig: Record<SaveStatus, {
    icon: React.ComponentType<{ className?: string }> | null
    label: string
    className: string
}> = {
    idle: {
        icon: null,
        label: '',
        className: '',
    },
    saving: {
        icon: Loader2,
        label: 'Saving...',
        className: 'text-muted-foreground',
    },
    saved: {
        icon: Check,
        label: 'Saved',
        className: 'text-emerald-400',
    },
    error: {
        icon: AlertCircle,
        label: 'Error saving',
        className: 'text-red-400',
    },
}

export default function EditorToolbar({
    onBack,
    title,
    saveStatus,
    actions,
}: EditorToolbarProps) {
    const status = statusConfig[saveStatus]
    const StatusIcon = status.icon

    return (
        <div className="flex items-center gap-3 px-4 py-3">
            {/* Back button */}
            <button
                type="button"
                onClick={onBack}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
                aria-label="Go back"
            >
                <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Title */}
            {title && (
                <h1 className="text-sm font-medium text-foreground truncate min-w-0">
                    {title}
                </h1>
            )}

            {/* Save status indicator */}
            {saveStatus !== 'idle' && (
                <div className={cn('flex items-center gap-1.5 text-xs flex-shrink-0', status.className)}>
                    {StatusIcon && (
                        <StatusIcon
                            className={cn('w-3.5 h-3.5', saveStatus === 'saving' && 'animate-spin')}
                        />
                    )}
                    <span>{status.label}</span>
                </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Actions slot */}
            {actions && (
                <div className="flex items-center gap-2 flex-shrink-0">
                    {actions}
                </div>
            )}
        </div>
    )
}
