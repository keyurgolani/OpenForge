import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalShellProps {
    isOpen: boolean
    onClose: () => void
    title: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    children: ReactNode
    footer?: ReactNode
}

const sizeClasses: Record<NonNullable<ModalShellProps['size']>, string> = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'w-[70vw] max-w-[70vw] h-[90vh] max-h-[90vh]',
}

export default function ModalShell({
    isOpen,
    onClose,
    title,
    size = 'md',
    children,
    footer,
}: ModalShellProps) {
    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
            <AnimatePresence>
                {isOpen && (
                    <Dialog.Portal forceMount>
                        {/* Backdrop */}
                        <Dialog.Overlay asChild>
                            <motion.div
                                className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            />
                        </Dialog.Overlay>

                        {/* Content */}
                        <Dialog.Content
                            asChild
                            onEscapeKeyDown={onClose}
                            onPointerDownOutside={onClose}
                        >
                            <motion.div
                                className={cn(
                                    'fixed left-1/2 top-1/2 z-[10000] w-[calc(100%-2rem)] max-h-[calc(100vh-4rem)]',
                                    'glass-card rounded-2xl border border-border/60 shadow-2xl',
                                    'flex flex-col overflow-hidden',
                                    sizeClasses[size],
                                )}
                                initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-48%' }}
                                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                                exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-48%' }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                            >
                                {/* Header */}
                                <Dialog.Description className="sr-only">
                                    {title}
                                </Dialog.Description>
                                <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
                                    <Dialog.Title className="text-lg font-semibold text-foreground">
                                        {title}
                                    </Dialog.Title>
                                    <Dialog.Close asChild>
                                        <button
                                            type="button"
                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                            aria-label="Close"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </Dialog.Close>
                                </div>

                                {/* Body */}
                                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
                                    {children}
                                </div>

                                {/* Footer */}
                                {footer && (
                                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/60">
                                        {footer}
                                    </div>
                                )}
                            </motion.div>
                        </Dialog.Content>
                    </Dialog.Portal>
                )}
            </AnimatePresence>
        </Dialog.Root>
    )
}
