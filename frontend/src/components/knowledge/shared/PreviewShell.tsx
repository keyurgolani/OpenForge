import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls, type PanInfo } from 'framer-motion'
import { X, ChevronLeft, Brain } from 'lucide-react'

interface PreviewShellProps {
    isOpen: boolean
    onClose: () => void
    title?: string
    actions?: ReactNode
    children: ReactNode
    siderail?: ReactNode | ((onCollapse: () => void) => ReactNode)
    leftRail?: ReactNode
}

const DISMISS_THRESHOLD = 120
const MIN_RAIL_PCT = 10
const MAX_RAIL_PCT = 40
const DEFAULT_RAIL_PCT = 25
const RAIL_WIDTH_KEY = 'openforge.preview.rail.pct'

export default function PreviewShell({
    isOpen,
    onClose,
    title,
    actions,
    children,
    siderail,
    leftRail,
}: PreviewShellProps) {
    const sheetRef = useRef<HTMLDivElement>(null)
    const y = useMotionValue(0)
    const backdropOpacity = useTransform(y, [0, 300], [1, 0])
    const dragControls = useDragControls()

    // Siderail open by default on desktop when siderail content is provided
    const [railOpen, setRailOpen] = useState(!!siderail)
    const [railPct, setRailPct] = useState<number>(() => {
        if (typeof window === 'undefined') return DEFAULT_RAIL_PCT
        const stored = window.localStorage.getItem(RAIL_WIDTH_KEY)
        if (stored) {
            const n = parseFloat(stored)
            if (n >= MIN_RAIL_PCT && n <= MAX_RAIL_PCT) return n
        }
        return DEFAULT_RAIL_PCT
    })

    // Resize state
    const resizingRef = useRef(false)
    const startXRef = useRef(0)
    const startWidthRef = useRef(0)

    // Open rail by default when sheet opens with siderail content
    useEffect(() => {
        if (isOpen && siderail) setRailOpen(true)
        if (!isOpen) setRailOpen(false)
    }, [isOpen, siderail])

    // Lock body scroll and blur app content when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
            const root = document.getElementById('root')
            if (root) {
                root.style.filter = 'blur(6px) saturate(0.7)'
                root.style.transition = 'filter 0.2s ease'
            }
            return () => {
                document.body.style.overflow = ''
                if (root) root.style.filter = ''
            }
        }
    }, [isOpen])

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [isOpen, onClose])

    const handleDragEnd = (_: unknown, info: PanInfo) => {
        if (info.offset.y > DISMISS_THRESHOLD || info.velocity.y > 500) {
            onClose()
        }
    }

    // --- Resize handlers ---
    const handleResizeStart = useCallback((e: React.PointerEvent) => {
        e.preventDefault()
        resizingRef.current = true
        startXRef.current = e.clientX
        startWidthRef.current = railPct
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [railPct])

    useEffect(() => {
        const handleMove = (e: PointerEvent) => {
            if (!resizingRef.current) return
            const sheetWidth = sheetRef.current?.offsetWidth || window.innerWidth
            const deltaPx = startXRef.current - e.clientX
            const deltaPct = (deltaPx / sheetWidth) * 100
            const newPct = Math.min(MAX_RAIL_PCT, Math.max(MIN_RAIL_PCT, startWidthRef.current + deltaPct))
            setRailPct(newPct)
        }
        const handleUp = () => {
            if (!resizingRef.current) return
            resizingRef.current = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            window.localStorage.setItem(RAIL_WIDTH_KEY, String(railPct))
        }
        window.addEventListener('pointermove', handleMove)
        window.addEventListener('pointerup', handleUp)
        return () => {
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('pointerup', handleUp)
        }
    }, [railPct])

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 z-[60] bg-black/60"
                        style={{ opacity: backdropOpacity }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                    />

                    {/* Bottom sheet */}
                    <motion.div
                        ref={sheetRef}
                        className="fixed bottom-0 left-0 right-0 z-[61] glass-card border-t border-border/40 shadow-2xl rounded-t-2xl flex flex-col max-h-[85vh]"
                        style={{ y }}
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                        drag="y"
                        dragControls={dragControls}
                        dragListener={false}
                        dragConstraints={{ top: 0 }}
                        dragElastic={0.2}
                        onDragEnd={handleDragEnd}
                    >
                        {/* Drag handle — only this area initiates drag */}
                        <div
                            className="flex justify-center py-2.5 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
                            onPointerDown={(e) => dragControls.start(e)}
                        >
                            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                        </div>

                        {/* Header */}
                        <div className="relative flex items-center justify-center px-5 py-2 flex-shrink-0">
                            {title && (
                                <h2 className="text-base font-semibold text-foreground truncate text-center px-24">
                                    {title}
                                </h2>
                            )}
                            <div className="absolute right-5 flex items-center gap-2">
                                {actions}
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                    aria-label="Close preview"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Body: left rail + content + right siderail */}
                        <div className="flex min-h-0 overflow-hidden gap-2 p-2 pt-0">
                            {/* Left rail — metadata, desktop only */}
                            {leftRail && (
                                <div className="hidden md:flex flex-shrink-0 w-72 overflow-y-auto rounded-2xl border border-border/60 bg-card/28 px-4 py-4 select-text">
                                    {leftRail}
                                </div>
                            )}

                            {/* Main content — drives the height */}
                            <div className="flex-1 overflow-y-auto px-3 py-4 select-text">
                                {children}
                            </div>

                            {/* Right siderail — desktop only */}
                            {siderail && railOpen && (
                                <div className="hidden md:flex flex-col flex-shrink-0 relative overflow-hidden rounded-2xl border border-border/60 bg-card/28 py-4 transition-[width] duration-200 ease-out select-text" style={{ width: `${railPct}%` }}>
                                    {/* Resize handle */}
                                    <div
                                        className="absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-accent/25 active:bg-accent/35 transition-colors z-10"
                                        onPointerDown={handleResizeStart}
                                    />
                                    {typeof siderail === 'function' ? siderail(() => setRailOpen(false)) : siderail}
                                </div>
                            )}

                            {/* Collapsed siderail strip — desktop only */}
                            {siderail && !railOpen && (
                                <div className="hidden md:flex flex-col flex-shrink-0 items-center gap-3 rounded-2xl border border-border/60 bg-card/28 px-2 py-4 w-14">
                                    <button
                                        type="button"
                                        onClick={() => setRailOpen(true)}
                                        className="w-8 h-8 rounded-lg border border-border/70 bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                                        aria-label="Expand intelligence sidebar"
                                        title="Expand intelligence"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <div className="w-6 h-px bg-border/70" />
                                    <Brain className="w-4 h-4 text-accent mt-1" />
                                    <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-muted-foreground [writing-mode:vertical-rl] rotate-180">
                                        Insights
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Left rail — mobile: inline above siderail */}
                        {leftRail && (
                            <div className="md:hidden border-t border-border/30 px-5 py-4 overflow-y-auto max-h-[30vh] select-text">
                                {leftRail}
                            </div>
                        )}

                        {/* Siderail — mobile: inline below content */}
                        {siderail && (
                            <div className="md:hidden border-t border-border/30 px-5 py-4 overflow-y-auto max-h-[40vh] select-text">
                                {typeof siderail === 'function' ? siderail(() => setRailOpen(false)) : siderail}
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body,
    )
}
