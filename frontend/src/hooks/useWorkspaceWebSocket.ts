import { useEffect, useRef, useCallback, useState } from 'react'

type WsHandler = (msg: Record<string, unknown>) => void

interface WsManager {
    send: (msg: object) => void
    on: (type: string, handler: WsHandler) => () => void
    isConnected: boolean
}

const managers = new Map<string, { ws: WebSocket; handlers: Map<string, Set<WsHandler>>; reconnectTimer: ReturnType<typeof setTimeout> | null }>()

function getOrCreateManager(workspaceId: string) {
    if (!managers.has(workspaceId)) {
        managers.set(workspaceId, { ws: null as unknown as WebSocket, handlers: new Map(), reconnectTimer: null })
    }
    return managers.get(workspaceId)!
}

export function useWorkspaceWebSocket(workspaceId: string): WsManager {
    const [isConnected, setIsConnected] = useState(false)
    const managerRef = useRef(getOrCreateManager(workspaceId))

    const connect = useCallback(() => {
        const manager = managerRef.current
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.host}/ws/workspace/${workspaceId}`

        if (manager.ws && (manager.ws.readyState === WebSocket.OPEN || manager.ws.readyState === WebSocket.CONNECTING)) {
            return
        }

        const ws = new WebSocket(wsUrl)
        manager.ws = ws

        ws.onopen = () => {
            setIsConnected(true)
            if (manager.reconnectTimer) {
                clearTimeout(manager.reconnectTimer)
                manager.reconnectTimer = null
            }
        }

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data)
                const type = msg.type as string
                const handlers = manager.handlers.get(type)
                if (handlers) {
                    handlers.forEach((h: WsHandler) => h(msg))
                }
                // Also dispatch to '*' handlers
                const wildcardHandlers = manager.handlers.get('*')
                if (wildcardHandlers) {
                    wildcardHandlers.forEach((h: WsHandler) => h(msg))
                }
            } catch { /* ignore parse errors */ }
        }

        ws.onclose = () => {
            setIsConnected(false)
            // Auto-reconnect after 3s
            manager.reconnectTimer = setTimeout(connect, 3000)
        }

        ws.onerror = () => {
            ws.close()
        }
    }, [workspaceId])

    useEffect(() => {
        connect()
        return () => {
            // Don't disconnect on unmount — keep alive for other components
        }
    }, [connect])

    const send = useCallback((msg: object) => {
        const { ws } = managerRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg))
        }
    }, [])

    const on = useCallback((type: string, handler: WsHandler) => {
        const manager = managerRef.current
        if (!manager.handlers.has(type)) {
            manager.handlers.set(type, new Set())
        }
        manager.handlers.get(type)!.add(handler)
        return () => {
            manager.handlers.get(type)?.delete(handler)
        }
    }, [])

    return { send, on, isConnected }
}
