import { useState, useEffect, useRef } from 'react'
import { MessageSquare, ChevronRight } from 'lucide-react'
import type { IntermediateResponseTimelineItem } from '@/types/timeline'

interface IntermediateResponseStepProps {
  item: IntermediateResponseTimelineItem
}

export function IntermediateResponseStep({ item }: IntermediateResponseStepProps) {
  const [collapsed, setCollapsed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Auto-collapse after 1.5 seconds
    timerRef.current = setTimeout(() => setCollapsed(true), 1500)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return (
    <div className="chat-workflow-step chat-workflow-step--iconic chat-workflow-step--response">
      <div className="chat-timeline-dot">
        <MessageSquare className="w-3.5 h-3.5 text-blue-400/70" />
      </div>
      <div>
        <button
          type="button"
          onClick={() => setCollapsed(prev => !prev)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors py-0.5"
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
          <span>Intermediate response</span>
        </button>
        {!collapsed && (
          <div className="text-sm text-foreground/75 leading-relaxed mt-1 pl-1 border-l-2 border-border/25 ml-1.5">
            <div className="pl-3 py-1">
              {item.content.length > 300 ? item.content.slice(0, 300) + '…' : item.content}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
