import { useEffect, useRef, useCallback, useState } from 'react'
import type { WsHandler } from './useWorkspaceWebSocket'

interface ExecutionStreamManager {
    ws: WebSocket | null
    handlers: Map<string, Set<WsHandler>>
    reconnectTimer: ReturnType<typeof setTimeout> | null
    pingInterval: ReturnType<typeof setInterval> | null
    statusListeners: Set<(connected: boolean) => void>
    isConnected: boolean
    reconnectAttempt: number
}

const managers = new Map<string, ExecutionStreamManager>()

function getOrCreateManager(executionId: string): ExecutionStreamManager {
    if (!managers.has(executionId)) {
        managers.set(executionId, {
            ws: null,
            handlers: new Map(),
            reconnectTimer: null,
            pingInterval: null,
            statusListeners: new Set(),
            isConnected: false,
            reconnectAttempt: 0,
        })
    }
    return managers.get(executionId)!
}

export function useExecutionStream(executionId: string | null): {
    on: (type: string, handler: WsHandler) => () => void
    isConnected: boolean
} {
    const managerRef = useRef<ExecutionStreamManager | null>(executionId ? getOrCreateManager(executionId) : null)
    const [isConnected, setIsConnected] = useState(managerRef.current?.isConnected ?? false)

    const connect = useCallback(() => {
        if (!executionId) return
        const manager = managerRef.current
        if (!manager) return

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.host}/ws/agent/${executionId}`

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
            if (event.code === 4001) {
                window.dispatchEvent(new Event('openforge:unauthorized'))
                return
            }
            const attempt = manager.reconnectAttempt
            const baseDelay = Math.min(30000, 1000 * Math.pow(2, attempt))
            const jitter = Math.random() * 1000
            manager.reconnectAttempt = attempt + 1
            manager.reconnectTimer = setTimeout(connect, baseDelay + jitter)
        }

        ws.onerror = () => {
            ws.close()
        }
    }, [executionId])

    useEffect(() => {
        if (!executionId) {
            managerRef.current = null
            setIsConnected(false)
            return
        }

        const manager = getOrCreateManager(executionId)
        managerRef.current = manager

        const listener = (status: boolean) => setIsConnected(status)
        manager.statusListeners.add(listener)
        setIsConnected(manager.isConnected)

        connect()

        return () => {
            manager.statusListeners.delete(listener)
        }
    }, [connect, executionId])

    const on = useCallback((type: string, handler: WsHandler) => {
        const manager = managerRef.current
        if (!manager) return () => {}
        if (!manager.handlers.has(type)) {
            manager.handlers.set(type, new Set())
        }
        manager.handlers.get(type)!.add(handler)
        return () => {
            manager.handlers.get(type)?.delete(handler)
        }
    }, [])

    return { on, isConnected }
}
