import { useEffect, useRef, useState } from 'react'
import { StreamRenderer } from '@/lib/stream-renderer'
import type { AgentEmitter } from '@/hooks/chat/useAgentStream'

export function useStreamRenderer(emitter: AgentEmitter) {
  const [displayText, setDisplayText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const rendererRef = useRef<StreamRenderer | null>(null)

  useEffect(() => {
    const renderer = new StreamRenderer()
    rendererRef.current = renderer

    renderer.on('render', (text) => {
      setDisplayText(text)
    })

    renderer.on('complete', () => {
      setIsStreaming(false)
    })

    const onToken = (token: string) => {
      setIsStreaming(true)
      renderer.ingest(token)
    }

    const onDone = () => {
      renderer.complete()
      setIsStreaming(false)
    }

    const onIntermediateResponse = () => {
      renderer.reset()
      setDisplayText('')
      setIsStreaming(false)
    }

    const onError = () => {
      renderer.complete()
    }

    emitter.on('token', onToken)
    emitter.on('done', onDone)
    emitter.on('intermediate_response', onIntermediateResponse)
    emitter.on('error', onError)

    return () => {
      emitter.off('token', onToken)
      emitter.off('done', onDone)
      emitter.off('intermediate_response', onIntermediateResponse)
      emitter.off('error', onError)
      renderer.destroy()
    }
  }, [emitter])

  const reset = () => {
    rendererRef.current?.reset()
    setDisplayText('')
    setIsStreaming(false)
  }

  return { displayText, isStreaming, reset }
}
