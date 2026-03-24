import { useEffect, useRef, useState } from 'react'
import { extractSentences } from '@/lib/thought-extractor'
import type { AgentEmitter } from '@/hooks/chat/useAgentStream'

const THINKING_DRAIN_MS = 2500
const FAST_DRAIN_MS = 800
const MIN_DISPLAY_MS = 1200
const MAX_QUEUE = 5

export function useThoughtQueue(emitter: AgentEmitter, onDrainComplete?: () => void) {
  const [currentThought, setCurrentThought] = useState<string | null>(null)
  const [isDraining, setIsDraining] = useState(false)
  const allThoughtsRef = useRef<string[]>([])
  const [allThoughts, setAllThoughts] = useState<string[]>([])
  const queueRef = useRef<string[]>([])
  const bufferRef = useRef('')
  const thinkingDone = useRef(false)
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTimeRef = useRef(0)

  useEffect(() => {
    const drainNext = () => {
      if (queueRef.current.length === 0) {
        if (thinkingDone.current) {
          setIsDraining(false)
          setCurrentThought(null)
          onDrainComplete?.()
        }
        return
      }

      // Skip to last 3 if backed up
      if (queueRef.current.length > MAX_QUEUE) {
        queueRef.current = queueRef.current.slice(-3)
      }

      const next = queueRef.current.shift()!
      setCurrentThought(next)
      setIsDraining(true)

      const interval = thinkingDone.current
        ? Math.max(FAST_DRAIN_MS, FAST_DRAIN_MS * (1 / (queueRef.current.length + 1)))
        : THINKING_DRAIN_MS

      drainTimerRef.current = setTimeout(drainNext, interval)
    }

    const onThinkingChunk = (text: string) => {
      if (!startTimeRef.current) startTimeRef.current = Date.now()
      bufferRef.current += text
      const { sentences, remainder } = extractSentences(bufferRef.current)
      bufferRef.current = remainder

      if (sentences.length > 0) {
        allThoughtsRef.current = [...allThoughtsRef.current, ...sentences]
        setAllThoughts([...allThoughtsRef.current])
        queueRef.current.push(...sentences)

        if (!drainTimerRef.current) {
          drainNext()
        }
      }
    }

    const onDone = () => {
      thinkingDone.current = true
      const elapsed = Date.now() - startTimeRef.current
      if (elapsed < 500 && allThoughtsRef.current.length <= 2 && allThoughtsRef.current.length > 0) {
        if (drainTimerRef.current) clearTimeout(drainTimerRef.current)
        drainTimerRef.current = setTimeout(() => {
          drainTimerRef.current = null
          setIsDraining(false)
          setCurrentThought(null)
          onDrainComplete?.()
        }, MIN_DISPLAY_MS)
        return
      }
      if (queueRef.current.length === 0 && !drainTimerRef.current) {
        setIsDraining(false)
        setCurrentThought(null)
        onDrainComplete?.()
      }
    }

    emitter.on('thinking_chunk', onThinkingChunk)
    emitter.on('done', onDone)

    return () => {
      emitter.off('thinking_chunk', onThinkingChunk)
      emitter.off('done', onDone)
      if (drainTimerRef.current) clearTimeout(drainTimerRef.current)
    }
  }, [emitter, onDrainComplete])

  const reset = () => {
    setCurrentThought(null)
    setIsDraining(false)
    allThoughtsRef.current = []
    setAllThoughts([])
    queueRef.current = []
    bufferRef.current = ''
    thinkingDone.current = false
    startTimeRef.current = 0
    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current)
      drainTimerRef.current = null
    }
  }

  return { currentThought, allThoughts, isDraining, reset }
}
