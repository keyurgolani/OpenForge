/**
 * LiveTerminalLog - Real-time log viewer via WebSocket
 *
 * Connects to ws://.../ws/run/{runId}/terminal and renders
 * strategy execution events as append-only log entries.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Wifi, WifiOff } from 'lucide-react'

interface LogEntry {
  id: string
  timestamp: string
  type: string
  content: string
}

interface LiveTerminalLogProps {
  runId: string
}

export default function LiveTerminalLog({ runId }: LiveTerminalLogProps) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const entryCounter = useRef(0)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/run/${runId}/terminal`)

    ws.onopen = () => setConnected(true)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const entry: LogEntry = {
          id: `${Date.now()}-${entryCounter.current++}`,
          timestamp: data.timestamp ?? new Date().toISOString(),
          type: data.event_type ?? data.type ?? 'info',
          content: data.content ?? data.message ?? data.text ?? JSON.stringify(data),
        }
        setEntries(prev => [...prev, entry])
      } catch {
        setEntries(prev => [
          ...prev,
          {
            id: `${Date.now()}-${entryCounter.current++}`,
            timestamp: new Date().toISOString(),
            type: 'raw',
            content: event.data,
          },
        ])
      }
    }

    ws.onclose = () => {
      setConnected(false)
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => ws.close()

    wsRef.current = ws
  }, [runId])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [entries])

  const typeColor = (type: string) => {
    switch (type) {
      case 'step_started':
      case 'thinking':
        return 'text-blue-400'
      case 'tool_call':
        return 'text-amber-400'
      case 'observation':
        return 'text-green-400'
      case 'completion':
      case 'step_completed':
        return 'text-emerald-400'
      case 'error':
        return 'text-red-400'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <div className="flex flex-col h-full rounded-2xl border border-border/60 bg-background/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-card/30">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Live Terminal
        </span>
        <div className="flex items-center gap-1.5">
          {connected ? (
            <>
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span className="text-xs text-emerald-400">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-amber-400">Reconnecting...</span>
            </>
          )}
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1"
      >
        {entries.length === 0 ? (
          <p className="text-muted-foreground/60">Waiting for events...</p>
        ) : (
          entries.map(entry => (
            <div key={entry.id} className="flex gap-2">
              <span className="text-muted-foreground/50 flex-shrink-0">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span className={`flex-shrink-0 ${typeColor(entry.type)}`}>
                [{entry.type}]
              </span>
              <span className="text-foreground/90 break-all whitespace-pre-wrap">
                {entry.content}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
