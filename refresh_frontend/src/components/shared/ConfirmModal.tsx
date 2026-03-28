import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const contentVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0 },
}

export default function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'default',
  onConfirm,
}: ConfirmModalProps) {
  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                variants={overlayVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                className={cn(
                  'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
                  'rounded-xl border border-border bg-bg-elevated p-6 shadow-2xl',
                  'focus:outline-none',
                )}
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              >
                <div className="flex items-start justify-between gap-4">
                  <Dialog.Title className="font-display text-lg font-semibold text-fg">
                    {title}
                  </Dialog.Title>
                  <Dialog.Close
                    className={cn(
                      'rounded-md p-1 text-fg-subtle hover:text-fg hover:bg-bg-sunken',
                      'transition-colors focus-ring',
                    )}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>

                <Dialog.Description className="mt-3 text-sm leading-relaxed text-fg-muted">
                  {description}
                </Dialog.Description>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <Dialog.Close
                    className={cn(
                      'rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg',
                      'hover:bg-bg-sunken transition-colors focus-ring',
                    )}
                  >
                    Cancel
                  </Dialog.Close>
                  <button
                    onClick={handleConfirm}
                    className={cn(
                      'rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-ring',
                      variant === 'danger'
                        ? 'bg-danger text-white hover:bg-danger/90'
                        : 'bg-primary text-fg-on-primary hover:bg-primary-hover',
                    )}
                  >
                    {confirmLabel}
                  </button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
