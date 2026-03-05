import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type CopyState = 'idle' | 'copying' | 'copied'

interface CopyButtonProps {
    content: string
    className?: string
    label?: string
    copiedLabel?: string
    iconOnly?: boolean
    stopPropagation?: boolean
    resetAfterMs?: number
}

export function CopyButton({
    content,
    className,
    label = 'Copy',
    copiedLabel = 'Copied',
    iconOnly = false,
    stopPropagation = false,
    resetAfterMs = 1400,
}: CopyButtonProps) {
    const [state, setState] = useState<CopyState>('idle')
    const timerRef = useRef<number | null>(null)

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                window.clearTimeout(timerRef.current)
            }
        }
    }, [])

    const handleCopy = async (e: MouseEvent<HTMLButtonElement>) => {
        if (stopPropagation) e.stopPropagation()
        if (!content || state === 'copying') return

        setState('copying')
        try {
            await navigator.clipboard.writeText(content)
            setState('copied')
            if (timerRef.current) window.clearTimeout(timerRef.current)
            timerRef.current = window.setTimeout(() => setState('idle'), resetAfterMs)
        } catch {
            setState('idle')
        }
    }

    const isCopying = state === 'copying'
    const isCopied = state === 'copied'

    return (
        <button
            type="button"
            className={cn(className)}
            onClick={handleCopy}
            disabled={isCopying}
            aria-label={isCopied ? copiedLabel : label}
            title={isCopied ? copiedLabel : label}
        >
            <AnimatePresence mode="wait" initial={false}>
                {isCopying ? (
                    <motion.span
                        key="copying"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={{ duration: 0.12 }}
                        className={`inline-flex items-center ${iconOnly ? '' : 'gap-1'}`}
                    >
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {!iconOnly && <span>Copying</span>}
                    </motion.span>
                ) : isCopied ? (
                    <motion.span
                        key="copied"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={{ duration: 0.14 }}
                        className={`inline-flex items-center text-emerald-400 ${iconOnly ? '' : 'gap-1'}`}
                    >
                        <Check className="w-3 h-3" />
                        {!iconOnly && <span>{copiedLabel}</span>}
                    </motion.span>
                ) : (
                    <motion.span
                        key="idle"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={{ duration: 0.14 }}
                        className={`inline-flex items-center ${iconOnly ? '' : 'gap-1'}`}
                    >
                        <Copy className="w-3 h-3" />
                        {!iconOnly && <span>{label}</span>}
                    </motion.span>
                )}
            </AnimatePresence>
        </button>
    )
}
