import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { ChevronLeft, Brain, type LucideIcon } from 'lucide-react'

interface SiderailProps {
    /** Content for the expanded rail. Function form receives an onCollapse callback. */
    children: ReactNode | ((onCollapse: () => void) => ReactNode)
    /** localStorage key for persisting width percentage */
    storageKey: string
    /** Icon shown in collapsed strip */
    icon?: LucideIcon
    /** Vertical label in collapsed strip */
    label?: string
    /** Item count badge in collapsed strip */
    itemCount?: number
    /** Extra elements rendered in collapsed strip between expand button and divider */
    collapsedExtra?: ReactNode
    /** Minimum width percentage (default: 10) */
    minPct?: number
    /** Maximum width percentage (default: 40) */
    maxPct?: number
    /** Default width percentage (default: 25) */
    defaultPct?: number
    /** Breakpoint for desktop-only visibility (default: 'lg'). Use 'always' to show at all sizes. */
    breakpoint?: 'md' | 'lg' | 'xl' | 'always'
    /** Controlled open state — omit for uncontrolled mode */
    open?: boolean
    /** Called when open state changes */
    onOpenChange?: (open: boolean) => void
    /** localStorage key for persisting collapsed state */
    collapsedStorageKey?: string
    /** Ref to the parent container used for resize percentage calculations.
     *  Falls back to the siderail element's parentElement. */
    containerRef?: React.RefObject<HTMLElement | null>
}

export default function Siderail({
    children,
    storageKey,
    icon: Icon = Brain,
    label = 'Insights',
    itemCount,
    collapsedExtra,
    minPct = 10,
    maxPct = 40,
    defaultPct = 25,
    breakpoint = 'lg',
    open: controlledOpen,
    onOpenChange,
    collapsedStorageKey,
    containerRef,
}: SiderailProps) {
    // ── Width percentage ──
    const [railPct, setRailPct] = useState<number>(() => {
        if (typeof window === 'undefined') return defaultPct
        const stored = window.localStorage.getItem(storageKey)
        if (stored) {
            const n = parseFloat(stored)
            if (n >= minPct && n <= maxPct) return n
        }
        return defaultPct
    })

    // ── Open / collapsed state ──
    const [internalOpen, setInternalOpen] = useState(() => {
        if (controlledOpen !== undefined) return controlledOpen
        if (collapsedStorageKey && typeof window !== 'undefined') {
            return window.localStorage.getItem(collapsedStorageKey) !== '1'
        }
        return true
    })

    const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen

    const setOpen = useCallback((value: boolean) => {
        if (onOpenChange) {
            onOpenChange(value)
        } else {
            setInternalOpen(value)
        }
        if (collapsedStorageKey && typeof window !== 'undefined') {
            window.localStorage.setItem(collapsedStorageKey, value ? '0' : '1')
        }
    }, [onOpenChange, collapsedStorageKey])

    // Sync when controlled prop changes
    useEffect(() => {
        if (controlledOpen !== undefined) setInternalOpen(controlledOpen)
    }, [controlledOpen])

    // ── Resize logic ──
    const resizingRef = useRef(false)
    const startXRef = useRef(0)
    const startWidthRef = useRef(0)
    const selfRef = useRef<HTMLDivElement>(null)

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
            const container = containerRef?.current ?? selfRef.current?.parentElement
            const containerWidth = container?.offsetWidth || window.innerWidth
            const deltaPx = startXRef.current - e.clientX
            const deltaPct = (deltaPx / containerWidth) * 100
            const newPct = Math.min(maxPct, Math.max(minPct, startWidthRef.current + deltaPct))
            setRailPct(newPct)
        }
        const handleUp = () => {
            if (!resizingRef.current) return
            resizingRef.current = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            window.localStorage.setItem(storageKey, String(railPct))
        }
        window.addEventListener('pointermove', handleMove)
        window.addEventListener('pointerup', handleUp)
        return () => {
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('pointerup', handleUp)
        }
    }, [railPct, minPct, maxPct, storageKey, containerRef])

    // Static map so Tailwind JIT detects all breakpoint classes
    const visibilityClass = {
        md: 'hidden md:flex',
        lg: 'hidden lg:flex',
        xl: 'hidden xl:flex',
        always: 'flex',
    }[breakpoint]

    if (isOpen) {
        return (
            <div
                ref={selfRef}
                className={`${visibilityClass} flex-col flex-shrink-0 relative overflow-hidden rounded-2xl border border-border/60 bg-card/28 py-4 transition-[width] duration-200 ease-out select-text`}
                style={{ width: `${railPct}%` }}
            >
                {/* Resize handle */}
                <div
                    className="absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize bg-transparent hover:bg-accent/25 active:bg-accent/35 transition-colors z-10"
                    onPointerDown={handleResizeStart}
                />
                {typeof children === 'function' ? children(() => setOpen(false)) : children}
            </div>
        )
    }

    return (
        <div className={`${visibilityClass} flex-col flex-shrink-0 items-center gap-3 rounded-2xl border border-border/60 bg-card/28 px-2 py-4 w-14`}>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-8 h-8 rounded-lg border border-border/70 bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                aria-label={`Expand ${label.toLowerCase()} sidebar`}
                title={`Expand ${label.toLowerCase()}`}
            >
                <ChevronLeft className="w-4 h-4" />
            </button>
            {collapsedExtra}
            <div className="w-6 h-px bg-border/70" />
            <Icon className="w-4 h-4 text-accent mt-1" />
            {itemCount != null && itemCount > 0 && (
                <span className="text-[10px] font-bold text-accent tabular-nums">
                    {itemCount}
                </span>
            )}
            <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-muted-foreground [writing-mode:vertical-rl] rotate-180">
                {label}
            </span>
        </div>
    )
}
