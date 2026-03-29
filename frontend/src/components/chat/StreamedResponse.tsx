import { useMemo } from 'react'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

interface StreamedResponseProps {
  text: string
  isStreaming: boolean
}

/** Strip LLM citation artifacts like 【untrusted_content source="..."】or mixed bracket variants */
function stripCitationTags(s: string): string {
  return s
    .replace(/【[^】\]]*[】\]]/g, '')           // 【...】 or 【...]
    .replace(/\[untrusted_content[^\]]*\]/g, '') // [untrusted_content ...]
    .replace(/\[citation[^\]]*\]/g, '')          // [citation ...]
}

const PROSE_CLASSES = "prose prose-sm dark:prose-invert max-w-none [&_pre]:bg-muted/50 [&_pre]:rounded-md [&_pre]:p-3 [&_code]:font-mono [&_code]:text-xs [&_h1]:font-display [&_h2]:font-display [&_h3]:font-display [&_table]:text-xs [&_th]:px-3 [&_th]:py-1.5 [&_td]:px-3 [&_td]:py-1.5"

export function StreamedResponse({ text, isStreaming }: StreamedResponseProps) {
  const cleanText = useMemo(() => stripCitationTags(text), [text])

  const renderedHtml = useMemo(() => {
    if (!cleanText) return ''
    const html = md.render(cleanText)
    if (!isStreaming) return html
    // Inject blinking cursor inline at the end of the last block element
    // so the cursor appears right after the last character, not below the content.
    const cursorSpan = '<span class="streaming-cursor-inline"></span>'
    // Find the last closing block tag and insert cursor before it
    const lastClose = html.lastIndexOf('</')
    if (lastClose > 0) {
      return html.slice(0, lastClose) + cursorSpan + html.slice(lastClose)
    }
    return html + cursorSpan
  }, [cleanText, isStreaming])

  if (!text && !isStreaming) return null

  return (
    <div className="markdown-content text-foreground text-sm leading-relaxed px-4 py-3">
      <div
        className={PROSE_CLASSES}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  )
}
