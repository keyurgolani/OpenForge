import { useMemo } from 'react'
import MarkdownIt from 'markdown-it'
import { partitionForRender } from '@/lib/markdown-zones'
import { StreamingCursor } from './StreamingCursor'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

interface StreamedResponseProps {
  text: string
  isStreaming: boolean
}

export function StreamedResponse({ text, isStreaming }: StreamedResponseProps) {
  const { stable, active } = useMemo(() => {
    if (isStreaming) return partitionForRender(text)
    return { stable: text, active: '' }
  }, [text, isStreaming])

  const stableHtml = useMemo(() => {
    if (!stable) return ''
    return md.render(stable)
  }, [stable])

  if (!text && !isStreaming) return null

  return (
    <div className="text-foreground text-sm leading-relaxed pl-[30px]">
      {stableHtml && (
        <div
          className="prose prose-sm prose-invert max-w-none [&_pre]:bg-muted/50 [&_pre]:rounded-md [&_pre]:p-3 [&_code]:font-mono [&_code]:text-xs [&_h1]:font-display [&_h2]:font-display [&_h3]:font-display"
          dangerouslySetInnerHTML={{ __html: stableHtml }}
        />
      )}
      {active && (
        <span className="whitespace-pre-wrap">
          {active}
          {isStreaming && <StreamingCursor />}
        </span>
      )}
      {isStreaming && !active && <StreamingCursor />}
    </div>
  )
}
