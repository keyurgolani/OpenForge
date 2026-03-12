import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { ChevronLeft, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'

const MIN_RAIL_PCT = 10
const MAX_RAIL_PCT = 40
const DEFAULT_RAIL_PCT = 25
const RAIL_WIDTH_KEY = 'openforge.editor.rail.pct'

interface EditorShellProps {
    toolbar: ReactNode
    siderail?: ReactNode | ((onCollapse: () => void) => ReactNode)
    railItemCount?: number
    children: ReactNode
}

export default function EditorShell({ toolbar, siderail, railItemCount, children }: EditorShellProps) {
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
    const containerRef = useRef<HTMLDivElement>(null)

    // Sync rail open state when siderail prop changes
    useEffect(() => {
        setRailOpen(!!siderail)
    }, [siderail])

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
            const containerWidth = containerRef.current?.offsetWidth || window.innerWidth
            const deltaPx = startXRef.current - e.clientX
            const deltaPct = (deltaPx / containerWidth) * 100
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

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Toolbar */}
            <div className="flex-shrink-0">
                {toolbar}
            </div>

            {/* Content area */}
            <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden flex gap-2 p-2">
                {/* Main content — scrollable */}
                <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col rounded-2xl border border-border/60 bg-card/28">
                    {children}
                </div>

                {/* Expanded siderail — desktop only */}
                {siderail && railOpen && (
                    <div
                        className="hidden lg:flex flex-col flex-shrink-0 relative overflow-hidden rounded-2xl border border-border/60 bg-card/28 py-4 transition-[width] duration-200 ease-out select-text"
                        style={{ width: `${railPct}%` }}
                    >
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
                    <div className="hidden lg:flex flex-col flex-shrink-0 items-center gap-3 rounded-2xl border border-border/60 bg-card/28 px-2 py-4 w-14">
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
                        {railItemCount != null && railItemCount > 0 && (
                            <span className="text-[10px] font-bold text-accent tabular-nums">
                                {railItemCount}
                            </span>
                        )}
                        <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-muted-foreground [writing-mode:vertical-rl] rotate-180">
                            Insights
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}
