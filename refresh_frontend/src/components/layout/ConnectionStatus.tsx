import { useEffect, useRef, useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '@/lib/cn'

type WsStatus = 'connected' | 'reconnecting' | 'disconnected'

const statusConfig: Record<WsStatus, { color: string; pulse: boolean; label: string }> = {
  connected: {
    color: 'bg-success',
    pulse: false,
    label: 'Connected',
  },
  reconnecting: {
    color: 'bg-warning',
    pulse: true,
    label: 'Reconnecting...',
  },
  disconnected: {
    color: 'bg-danger',
    pulse: false,
    label: 'Disconnected',
  },
}

export default function ConnectionStatus() {
  const [status, setStatus] = useState<WsStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    function connect() {
      if (cancelled) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/events`)
      wsRef.current = ws

      ws.addEventListener('open', () => {
        if (!cancelled) setStatus('connected')
      })

      ws.addEventListener('close', () => {
        if (cancelled) return
        setStatus('reconnecting')
        reconnectTimer.current = setTimeout(connect, 3000)
      })

      ws.addEventListener('error', () => {
        if (!cancelled) setStatus('reconnecting')
      })
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])

  const config = statusConfig[status]

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="group relative flex items-center justify-center rounded-md p-1.5 transition-colors duration-200 hover:bg-fg/5"
            aria-label={`Connection status: ${config.label}`}
          >
            <span className="relative flex h-2.5 w-2.5">
              {config.pulse && (
                <span
                  className={cn(
                    'absolute inset-0 rounded-full opacity-75 animate-ping',
                    config.color,
                  )}
                />
              )}
              <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', config.color)} />
            </span>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            sideOffset={6}
            className="z-50 rounded-md bg-bg-overlay px-2.5 py-1.5 font-label text-xs font-medium text-fg shadow-lg border border-border/40 animate-scale-in"
          >
            {config.label}
            <Tooltip.Arrow className="fill-bg-overlay" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
