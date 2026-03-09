import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

interface ToolResult {
    success: boolean
    output: unknown
    error?: string
}

interface ToolCallCardProps {
    callId: string
    toolName: string
    arguments: Record<string, unknown>
    result?: ToolResult
    isRunning: boolean
}

function ArgValue({ value }: { value: unknown }) {
    if (value === null || value === undefined) {
        return <span className="italic text-muted-foreground/40">null</span>
    }
    if (typeof value === 'boolean') {
        return <span className={value ? 'text-emerald-400' : 'text-red-400'}>{String(value)}</span>
    }
    if (typeof value === 'number') {
        return <span className="text-sky-400/80">{value}</span>
    }
    if (typeof value === 'string') {
        if (value.includes('\n')) {
            return (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/30 px-2 py-1.5 text-[11px] text-foreground/70 max-h-48">
                    {value}
                </pre>
            )
        }
        return <span className="break-all text-foreground/75">{value}</span>
    }
    return (
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/30 px-2 py-1.5 text-[11px] text-foreground/70 max-h-48">
            {JSON.stringify(value, null, 2)}
        </pre>
    )
}

export function ToolCallCard({ callId: _callId, toolName, arguments: args, result, isRunning }: ToolCallCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [userInteracted, setUserInteracted] = useState(false)
    const wasRunning = useRef(isRunning)
    const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // When tool completes: auto-expand to show result, then collapse after 2s
    useEffect(() => {
        if (!isRunning && wasRunning.current && !userInteracted) {
            setIsExpanded(true)
            autoCollapseTimer.current = setTimeout(() => {
                setIsExpanded(false)
                autoCollapseTimer.current = null
            }, 2000)
        }
        wasRunning.current = isRunning
    }, [isRunning]) // eslint-disable-line react-hooks/exhaustive-deps

    // Clear timer on unmount
    useEffect(() => {
        return () => {
            if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current)
        }
    }, [])

    const toggle = () => {
        // Cancel any pending auto-collapse when user takes control
        if (autoCollapseTimer.current) {
            clearTimeout(autoCollapseTimer.current)
            autoCollapseTimer.current = null
        }
        setUserInteracted(true)
        setIsExpanded(prev => !prev)
    }

    const category = toolName.split('.')[0] ?? toolName
    const action = toolName.split('.').slice(1).join('.')

    const statusIcon = isRunning
        ? <Loader2 className="h-3 w-3 animate-spin text-accent/70" />
        : result?.success
            ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            : <XCircle className="h-3 w-3 text-red-400" />

    const hasArgs = Object.keys(args).length > 0
    const hasDetails = hasArgs || result !== undefined

    const argEntries = Object.entries(args)

    return (
        <div>
            <button
                type="button"
                className="chat-subsection-toggle"
                onClick={() => hasDetails && toggle()}
                style={!hasDetails ? { cursor: 'default' } : undefined}
            >
                {hasDetails
                    ? (isExpanded
                        ? <ChevronDown className="h-3 w-3" />
                        : <ChevronRight className="h-3 w-3" />)
                    : <span className="w-3 h-3 inline-block" />}
                <Wrench className="h-3 w-3 text-accent/60" />
                <span>
                    <span className="text-muted-foreground/80">{category}</span>
                    {action && (
                        <>
                            <span className="text-muted-foreground/40">.</span>
                            <span className="text-foreground/70">{action}</span>
                        </>
                    )}
                </span>
                {statusIcon}
            </button>

            <div className={`chat-collapse w-full ${isExpanded ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
                <div className="chat-collapse-inner">
                    <div className="mt-2 rounded-xl border border-border/40 bg-muted/15 px-3 py-2.5 text-xs space-y-2.5">
                        {hasArgs && (
                            <div className="space-y-1.5">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/50">Arguments</div>
                                <div className="space-y-1.5">
                                    {argEntries.map(([key, val]) => {
                                        const isBlock = typeof val === 'string'
                                            ? val.includes('\n')
                                            : typeof val === 'object' && val !== null
                                        return (
                                            <div key={key} className={isBlock ? 'flex flex-col' : 'flex items-baseline gap-2'}>
                                                <span className="text-[10px] uppercase tracking-wide text-accent/55 font-medium shrink-0">
                                                    {key}
                                                </span>
                                                <ArgValue value={val} />
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {result !== undefined && (
                            <div className="space-y-1.5">
                                <div className={`text-[10px] uppercase tracking-wide font-medium ${result.success ? 'text-muted-foreground/50' : 'text-red-400/70'}`}>
                                    {result.success ? 'Output' : 'Error'}
                                </div>
                                {result.success
                                    ? <ArgValue value={result.output} />
                                    : <span className="break-words text-[11px] text-red-400">{result.error ?? 'Unknown error'}</span>
                                }
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
