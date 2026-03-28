import { useState, useMemo, useEffect, useRef } from 'react'
import { Loader2, Trash2, Search, Play, Clock, Terminal } from 'lucide-react'
import { useSettingsWebSocket } from '@/hooks/useSettingsWebSocket'
import type { ContainerLogLine, LogLevel } from '../types'
import { LOG_LEVEL_OPTIONS, LOG_LEVEL_CLASS, stripAnsiCodes, getLogLevel } from '../constants'

export function ContainerLogsSubTab() {
    const { send, on, isConnected } = useSettingsWebSocket()
    const [logs, setLogs] = useState<ContainerLogLine[]>([])
    const [filter, setFilter] = useState('')
    const [levelFilter, setLevelFilter] = useState<'all' | LogLevel>('all')
    const [containerFilter, setContainerFilter] = useState<string>('all')
    const [paused, setPaused] = useState(false)
    const logsEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!isConnected) return
        send({ type: 'stream_logs' })

        const offLog = on('container_log', (msg: any) => {
            setLogs(prev => {
                if (paused) return prev
                const normalizedData = String(msg.data ?? '')
                const newLogs = [...prev, {
                    id: Date.now() + Math.random(),
                    container: String(msg.container ?? 'Unknown'),
                    data: normalizedData,
                    level: getLogLevel(normalizedData),
                }]
                return newLogs.slice(-1000) // Keep last 1000 lines
            })
        })

        const offErr = on('container_log_error', (msg: any) => {
            setLogs(prev => [...prev, {
                id: Date.now(),
                container: 'System',
                data: String(msg.detail ?? 'Unknown log stream error'),
                level: 'error',
            }])
        })

        return () => {
            offLog()
            offErr()
            send({ type: 'stop_logs' })
        }
    }, [isConnected, send, on, paused])

    useEffect(() => {
        if (!paused) {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [logs, paused])

    const containerOptions = useMemo(() => {
        return Array.from(new Set(logs.map(log => log.container))).sort((a, b) => a.localeCompare(b))
    }, [logs])

    useEffect(() => {
        if (containerFilter === 'all') return
        if (!containerOptions.includes(containerFilter)) {
            setContainerFilter('all')
        }
    }, [containerFilter, containerOptions])

    const filteredLogs = useMemo(() => {
        const normalizedFilter = filter.trim().toLowerCase()
        return logs.filter(log => {
            const matchesLevel = levelFilter === 'all' || log.level === levelFilter
            if (!matchesLevel) return false
            const matchesContainer = containerFilter === 'all' || log.container === containerFilter
            if (!matchesContainer) return false
            if (!normalizedFilter) return true
            return (
                log.container.toLowerCase().includes(normalizedFilter) ||
                stripAnsiCodes(log.data).toLowerCase().includes(normalizedFilter)
            )
        })
    }, [logs, filter, levelFilter, containerFilter])

    return (
        <div className="animate-fade-in flex h-full min-h-0 flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">Real-time Stack Logs</h3>
                    {!isConnected && <span className="text-xs text-amber-400 animate-pulse">(Connecting...)</span>}
                </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="relative shrink-0">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search logs..."
                        className="input text-xs py-1.5 pl-8 pr-3 w-48"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>
                <select
                    className="input text-xs py-1.5 pr-7 w-auto shrink-0"
                    value={levelFilter}
                    onChange={e => setLevelFilter(e.target.value as 'all' | LogLevel)}
                    aria-label="Filter log level"
                >
                    {LOG_LEVEL_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <select
                    className="input text-xs py-1.5 pr-7 min-w-[170px] shrink-0"
                    value={containerFilter}
                    onChange={e => setContainerFilter(e.target.value)}
                    aria-label="Filter container name"
                >
                    <option value="all">All containers</option>
                    {containerOptions.map(container => (
                        <option key={container} value={container}>
                            {container}
                        </option>
                    ))}
                </select>
                <button
                    className={`btn-ghost text-xs py-1.5 px-2.5 gap-1.5 shrink-0 ${paused ? 'text-accent bg-accent/15' : ''}`}
                    onClick={() => setPaused(p => !p)}
                >
                    {paused ? <Play className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    {paused ? 'Resume' : 'Pause'}
                </button>
                <button
                    className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 shrink-0"
                    onClick={() => setLogs([])}
                >
                    <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
            </div>

            <div className="min-h-0 flex-1 glass-card border border-border/50 rounded-xl overflow-y-auto p-4 font-mono text-xs bg-black/40 text-gray-300 flex flex-col gap-1 relative">
                {filteredLogs.length === 0 ? (
                    <div className="m-auto text-muted-foreground opacity-50 flex items-center gap-2">
                        {isConnected ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Waiting for logs...</span>
                            </>
                        ) : (
                            <span>WebSocket not connected.</span>
                        )}
                    </div>
                ) : (
                    filteredLogs.map(log => {
                        const rawText = stripAnsiCodes(log.data)
                        const hash = Array.from(log.container).reduce((acc, char) => acc + char.charCodeAt(0), 0)
                        const colors = ['text-emerald-400', 'text-blue-400', 'text-orange-400', 'text-purple-400', 'text-pink-400', 'text-cyan-400']
                        const colorClass = colors[hash % colors.length]

                        return (
                            <div key={log.id} className="flex items-start gap-2 hover:bg-white/5 px-1 py-0.5 rounded">
                                <span className={`w-16 flex-shrink-0 text-[10px] leading-5 uppercase tracking-wide px-2 py-0.5 rounded-full border text-center ${LOG_LEVEL_CLASS[log.level]}`}>
                                    {log.level}
                                </span>
                                <span className={`w-32 flex-shrink-0 truncate font-semibold opacity-90 leading-5 ${colorClass}`}>
                                    [{log.container}]
                                </span>
                                <span className="flex-1 break-all whitespace-pre-wrap leading-5">{rawText}</span>
                            </div>
                        )
                    })
                )}
                <div ref={logsEndRef} />
            </div>
        </div>
    )
}
