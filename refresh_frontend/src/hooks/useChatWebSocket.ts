import { useEffect, useRef, useCallback, useState } from 'react'

/**
 * Message types emitted by the agent WebSocket stream.
 */
export type ChatWsMessageType =
  | 'model_selection'
  | 'thinking'
  | 'tool_call'
  | 'attachments_processed'
  | 'prompt_optimized'
  | 'intermediate_response'
  | 'follow_up_request'
  | 'content'
  | 'error'
  | 'done'
  | 'pong'
  | string

export interface ChatWsMessage {
  type: ChatWsMessageType
  content?: string
  timeline?: any
  [key: string]: any
}

interface UseChatWebSocketOptions {
  /** Full WebSocket URL (without protocol; protocol is derived from window.location) */
  url: string
  /** Optional callback invoked for each parsed message */
  onMessage?: (msg: ChatWsMessage) => void
  /** Set to false to defer connection (default true) */
  enabled?: boolean
}

interface UseChatWebSocketReturn {
  connected: boolean
  messages: ChatWsMessage[]
  sendMessage: (msg: object) => boolean
  clearMessages: () => void
}

/**
 * Generic chat WebSocket hook with reconnection, ping keep-alive, and message accumulation.
 *
 * Connects to the given URL (e.g. `/ws/chat/{conversationId}/agent`).
 * Handles:
 * - Exponential backoff reconnection (max 30 s) with jitter
 * - Ping every 20 s to keep the proxy alive
 * - JSON message parsing and dispatch
 */
export function useChatWebSocket({
  url,
  onMessage,
  enabled = true,
}: UseChatWebSocketOptions): UseChatWebSocketReturn {
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<ChatWsMessage[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const onMessageRef = useRef(onMessage)
  const enabledRef = useRef(enabled)
  const urlRef = useRef(url)

  // Keep refs in sync without re-triggering effects
  onMessageRef.current = onMessage
  enabledRef.current = enabled
  urlRef.current = url

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!enabledRef.current) return

    // Close any existing connection first
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close()
    }
    clearTimers()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}${urlRef.current}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      reconnectAttemptRef.current = 0

      // Ping every 20 s to keep the proxy connection alive
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 20_000)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ChatWsMessage
        // Skip pong messages from accumulation
        if (msg.type !== 'pong') {
          setMessages((prev) => [...prev, msg])
        }
        onMessageRef.current?.(msg)
      } catch {
        // Ignore unparseable frames
      }
    }

    ws.onclose = (event) => {
      setConnected(false)
      clearTimers()

      // Auth rejection -- do not retry; let the auth guard handle it
      if (event.code === 4001) {
        window.dispatchEvent(new Event('openforge:unauthorized'))
        return
      }

      // Exponential backoff with jitter: min(30 s, 1 s * 2^attempt) + up to 1 s random
      if (enabledRef.current) {
        const attempt = reconnectAttemptRef.current
        const baseDelay = Math.min(30_000, 1_000 * Math.pow(2, attempt))
        const jitter = Math.random() * 1_000
        reconnectAttemptRef.current = attempt + 1
        reconnectTimerRef.current = setTimeout(connect, baseDelay + jitter)
      }
    }

    ws.onerror = () => {
      // Let onclose handle reconnection
      ws.close()
    }
  }, [clearTimers])

  // Connect / disconnect when url or enabled changes
  useEffect(() => {
    if (!enabled) {
      clearTimers()
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close()
      }
      wsRef.current = null
      setConnected(false)
      return
    }

    connect()

    return () => {
      clearTimers()
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close()
      }
      wsRef.current = null
    }
  }, [url, enabled, connect, clearTimers])

  const sendMessage = useCallback((msg: object): boolean => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
      return true
    }
    return false
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return { connected, messages, sendMessage, clearMessages }
}
