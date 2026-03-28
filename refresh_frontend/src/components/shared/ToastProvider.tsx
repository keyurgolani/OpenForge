import {
  createContext,
  useCallback,
  useContext,
  useState,
  useRef,
} from 'react'
import * as Toast from '@radix-ui/react-toast'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  variant: ToastVariant
  title: string
  description?: string
}

interface ToastContextValue {
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

const variantConfig: Record<ToastVariant, { icon: typeof CheckCircle2; className: string }> = {
  success: {
    icon: CheckCircle2,
    className: 'text-success',
  },
  error: {
    icon: AlertCircle,
    className: 'text-danger',
  },
  info: {
    icon: Info,
    className: 'text-primary',
  },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counterRef = useRef(0)

  const addToast = useCallback((variant: ToastVariant, title: string, description?: string) => {
    const id = `toast-${++counterRef.current}`
    setToasts((prev) => [...prev, { id, variant, title, description }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const value: ToastContextValue = {
    success: useCallback((title: string, description?: string) => addToast('success', title, description), [addToast]),
    error: useCallback((title: string, description?: string) => addToast('error', title, description), [addToast]),
    info: useCallback((title: string, description?: string) => addToast('info', title, description), [addToast]),
  }

  return (
    <ToastContext.Provider value={value}>
      <Toast.Provider swipeDirection="right" duration={5000}>
        {children}

        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => {
            const config = variantConfig[toast.variant]
            const Icon = config.icon
            return (
              <Toast.Root
                key={toast.id}
                asChild
                forceMount
                onOpenChange={(open) => {
                  if (!open) removeToast(toast.id)
                }}
              >
                <motion.li
                  initial={{ opacity: 0, x: 40, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 40, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border border-border p-4',
                    'bg-bg-elevated shadow-lg backdrop-blur-sm',
                    'pointer-events-auto w-[360px]',
                  )}
                >
                  <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', config.className)} />
                  <div className="flex-1 min-w-0">
                    <Toast.Title className="font-label text-sm font-medium text-fg">
                      {toast.title}
                    </Toast.Title>
                    {toast.description && (
                      <Toast.Description className="mt-1 text-sm text-fg-muted leading-relaxed">
                        {toast.description}
                      </Toast.Description>
                    )}
                  </div>
                  <Toast.Close
                    className={cn(
                      'shrink-0 rounded-md p-1 text-fg-subtle',
                      'hover:text-fg hover:bg-bg-sunken',
                      'transition-colors focus-ring',
                    )}
                    aria-label="Close notification"
                  >
                    <X className="h-4 w-4" />
                  </Toast.Close>
                </motion.li>
              </Toast.Root>
            )
          })}
        </AnimatePresence>

        <Toast.Viewport
          className={cn(
            'fixed bottom-0 right-0 z-[9999] m-0 flex w-[400px] max-w-[100vw]',
            'list-none flex-col gap-2 p-6 outline-none',
          )}
        />
      </Toast.Provider>
    </ToastContext.Provider>
  )
}
