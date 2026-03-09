/**
 * ConfirmModal — A custom confirmation dialog that matches the website theme.
 * Features:
 *  - Glass morphism styling consistent with the app
 *  - Animated entrance/exit with framer-motion
 *  - Keyboard support (Enter to confirm, Escape to cancel)
 *  - Click backdrop to close
 *  - Customizable title, message, and button labels
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X, Trash2, Download, Info } from 'lucide-react'

export type ConfirmModalVariant = 'danger' | 'warning' | 'info'

interface ConfirmModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: ConfirmModalVariant
    icon?: 'trash' | 'download' | 'info' | 'warning' | 'none'
    loading?: boolean
}

const variantStyles: Record<ConfirmModalVariant, {
    iconBg: string
    iconColor: string
    confirmBtn: string
    confirmBtnHover: string
}> = {
    danger: {
        iconBg: 'bg-red-500/10',
        iconColor: 'text-red-500',
        confirmBtn: 'bg-red-500 hover:bg-red-600 text-white',
        confirmBtnHover: 'hover:bg-red-600',
    },
    warning: {
        iconBg: 'bg-amber-500/10',
        iconColor: 'text-amber-500',
        confirmBtn: 'bg-amber-500 hover:bg-amber-600 text-white',
        confirmBtnHover: 'hover:bg-amber-600',
    },
    info: {
        iconBg: 'bg-blue-500/10',
        iconColor: 'text-blue-500',
        confirmBtn: 'bg-accent hover:bg-accent/90 text-accent-foreground',
        confirmBtnHover: 'hover:bg-accent/90',
    },
}

const iconMap = {
    trash: Trash2,
    download: Download,
    info: Info,
    warning: AlertTriangle,
    none: null,
}

export function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'danger',
    icon = 'warning',
    loading = false,
}: ConfirmModalProps) {
    const backdropRef = useRef<HTMLDivElement>(null)
    const styles = variantStyles[variant]
    const IconComponent = iconMap[icon]

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
            }
            if (e.key === 'Enter' && !loading) {
                e.preventDefault()
                onConfirm()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose, onConfirm, loading])

    // Lock body scroll
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
            return () => {
                document.body.style.overflow = ''
            }
        }
    }, [isOpen])

    // Handle backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === backdropRef.current && !loading) {
            onClose()
        }
    }

    if (typeof window === 'undefined') return null

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div
                    ref={backdropRef}
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
                    onClick={handleBackdropClick}
                >
                    {/* Backdrop */}
                    <motion.div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    />

                    {/* Modal */}
                    <motion.div
                        className="relative w-full max-w-md glass-card p-6 rounded-2xl shadow-2xl"
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                        {/* Close button */}
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                            aria-label="Close"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        {/* Content */}
                        <div className="flex gap-4">
                            {/* Icon */}
                            {IconComponent && (
                                <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${styles.iconBg} flex items-center justify-center`}>
                                    <IconComponent className={`w-6 h-6 ${styles.iconColor}`} />
                                </div>
                            )}

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-semibold text-foreground mb-2">
                                    {title}
                                </h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    {message}
                                </p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 mt-6 justify-end">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                className="px-4 py-2 text-sm font-medium rounded-xl border border-border/60 bg-card/50 text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                            >
                                {cancelLabel}
                            </button>
                            <button
                                type="button"
                                onClick={onConfirm}
                                disabled={loading}
                                className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 ${styles.confirmBtn}`}
                            >
                                {loading && (
                                    <svg
                                        className="animate-spin w-4 h-4"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        />
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        />
                                    </svg>
                                )}
                                {confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    )
}
