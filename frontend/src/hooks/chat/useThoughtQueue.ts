import { useEffect, useRef, useState } from 'react'
import { extractSentences } from '@/lib/thought-extractor'
import type { AgentEmitter } from '@/hooks/chat/useAgentStream'

const THINKING_DRAIN_MS = 1200
const FAST_DRAIN_MS = 600
const MIN_DISPLAY_MS = 800
const MAX_QUEUE = 8

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
        queueRef.current = queueRef.current.slice(-5)
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
      } else if (remainder.length > 20 && !drainTimerRef.current) {
        // No complete sentence yet, but enough text buffered — show it
        // as a live "working thought" so the user sees streaming progress
        const preview = remainder.length > 120 ? remainder.slice(0, 117) + '...' : remainder
        setCurrentThought(preview)
        setIsDraining(true)
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

    const onSnapshot = (data: { content: string; thinking: string; timeline: unknown[]; status?: string }) => {
      // Clear internal state before restoring from snapshot
      if (drainTimerRef.current) {
        clearTimeout(drainTimerRef.current)
        drainTimerRef.current = null
      }
      queueRef.current = []
      bufferRef.current = ''

      // Collect all thinking content from the snapshot timeline
      const allSentences: string[] = []
      if (Array.isArray(data.timeline)) {
        for (const e of data.timeline) {
          const entry = e as Record<string, unknown>
          if (entry.type === 'thinking' && typeof entry.content === 'string') {
            const sentences = entry.content.split(/(?<=[.!?])\s+/).filter(Boolean)
            allSentences.push(...sentences)
          }
        }
      }
      // Fall back to the top-level thinking field if no timeline entries
      if (allSentences.length === 0 && data.thinking) {
        const sentences = data.thinking.split(/(?<=[.!?])\s+/).filter(Boolean)
        allSentences.push(...sentences)
      }

      allThoughtsRef.current = allSentences
      setAllThoughts(allSentences)

      // Determine if thinking is still active from snapshot status
      const isComplete = data.status === 'completed' || data.status === 'cancelled' || data.status === 'failed' || data.status === 'timeout'
      const hasActiveThinking = !!data.thinking && !isComplete
      thinkingDone.current = !hasActiveThinking

      if (allSentences.length > 0) {
        // Display the last thought without animation
        setCurrentThought(allSentences[allSentences.length - 1])
        setIsDraining(!thinkingDone.current)
      } else {
        setCurrentThought(null)
        setIsDraining(false)
      }
      startTimeRef.current = Date.now()
    }

    emitter.on('thinking_chunk', onThinkingChunk)
    emitter.on('done', onDone)
    emitter.on('snapshot', onSnapshot)

    return () => {
      emitter.off('thinking_chunk', onThinkingChunk)
      emitter.off('done', onDone)
      emitter.off('snapshot', onSnapshot)
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
