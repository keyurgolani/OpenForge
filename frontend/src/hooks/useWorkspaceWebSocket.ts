import { useEffect, useRef, useCallback, useState } from 'react'

export type WsHandler = (msg: Record<string, unknown>) => void

interface WsManager {
    send: (msg: object) => boolean
    on: (type: string, handler: WsHandler) => () => void
    isConnected: boolean
}

const managers = new Map<string, { ws: WebSocket; handlers: Map<string, Set<WsHandler>>; reconnectTimer: ReturnType<typeof setTimeout> | null; pingInterval: ReturnType<typeof setInterval> | null; statusListeners: Set<(connected: boolean) => void>; isConnected: boolean; reconnectAttempt: number }>()

function getOrCreateManager(key: string) {
    if (!managers.has(key)) {
        managers.set(key, { ws: null as unknown as WebSocket, handlers: new Map(), reconnectTimer: null, pingInterval: null, statusListeners: new Set(), isConnected: false, reconnectAttempt: 0 })
    }
    return managers.get(key)!
}

export function useWorkspaceWebSocket(workspaceId: string, channel: 'agent' | 'system'): WsManager {
    const managerKey = `${workspaceId}:${channel}`
    const managerRef = useRef(getOrCreateManager(managerKey))
    const [isConnected, setIsConnected] = useState(managerRef.current.isConnected)

    const connect = useCallback(() => {
        const manager = managerRef.current
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.host}/ws/workspace/${workspaceId}/${channel}`

        if (manager.ws && (manager.ws.readyState === WebSocket.OPEN || manager.ws.readyState === WebSocket.CONNECTING)) {
            return
        }

        const ws = new WebSocket(wsUrl)
        manager.ws = ws

        ws.onopen = () => {
            manager.isConnected = true
            manager.reconnectAttempt = 0
            manager.statusListeners.forEach(l => l(true))
            if (manager.reconnectTimer) {
                clearTimeout(manager.reconnectTimer)
                manager.reconnectTimer = null
            }
            // Send a ping every 20s to keep the Vite proxy connection alive
            if (manager.pingInterval) clearInterval(manager.pingInterval)
            manager.pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping' }))
                }
            }, 20000)
        }

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data)
                const type = msg.type as string
                const handlers = manager.handlers.get(type)
                if (handlers) {
                    handlers.forEach((h: WsHandler) => h(msg))
                }
                const wildcardHandlers = manager.handlers.get('*')
                if (wildcardHandlers) {
                    wildcardHandlers.forEach((h: WsHandler) => h(msg))
                }
            } catch { /* ignore parse errors */ }
        }

        ws.onclose = (event) => {
            manager.isConnected = false
            manager.statusListeners.forEach(l => l(false))
            if (manager.pingInterval) {
                clearInterval(manager.pingInterval)
                manager.pingInterval = null
            }
            // Auth rejection — don't retry, let AuthGuard handle it
            if (event.code === 4001) {
                window.dispatchEvent(new Event('openforge:unauthorized'))
                return
            }
            // Exponential backoff with jitter: min(30s, 1s × 2^attempt) + up to 1s random
            const attempt = manager.reconnectAttempt
            const baseDelay = Math.min(30000, 1000 * Math.pow(2, attempt))
            const jitter = Math.random() * 1000
            manager.reconnectAttempt = attempt + 1
            manager.reconnectTimer = setTimeout(connect, baseDelay + jitter)
        }

        ws.onerror = () => {
            ws.close()
        }
    }, [workspaceId, channel])

    useEffect(() => {
        const manager = managerRef.current;
        const listener = (status: boolean) => setIsConnected(status);
        manager.statusListeners.add(listener);
        setIsConnected(manager.isConnected);

        connect();

        return () => {
            manager.statusListeners.delete(listener);
        }
    }, [connect])

    const send = useCallback((msg: object) => {
        const { ws } = managerRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg))
            return true
        }
        return false
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
