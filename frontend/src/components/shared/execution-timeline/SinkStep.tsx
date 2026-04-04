import { Download, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { SinkExecutionTimelineItem } from '@/types/timeline'

interface SinkStepProps {
  item: SinkExecutionTimelineItem
}

export function SinkStep({ item }: SinkStepProps) {
  const isRunning = item.status === 'running'
  const isComplete = item.status === 'complete'
  const isError = item.status === 'error'

  return (
    <div className="chat-workflow-step chat-workflow-step--iconic chat-workflow-step--source">
      <div className="chat-timeline-dot">
        <Download className="w-3.5 h-3.5 text-accent/70" />
      </div>
      <div>
        <div className="flex items-center gap-1.5 py-0.5">
          <span className="font-mono text-[11px] text-foreground/80">{item.node_key}</span>
          <span className="text-[10px] text-muted-foreground/50 border border-border/25 bg-background/50 rounded-md px-1.5 py-0.5">
            {item.sink_type}
          </span>
          {isRunning && <Loader2 className="h-3 w-3 text-accent animate-spin flex-shrink-0" />}
          {isComplete && <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />}
          {isError && <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />}
          {item.duration_ms != null && !isRunning && (
            <span className="text-[10px] text-muted-foreground/70 ml-auto">{(item.duration_ms / 1000).toFixed(1)}s</span>
          )}
        </div>

        {/* Output preview for completed sinks */}
        {isComplete && item.output_preview && (
          <div className="text-[11px] text-foreground/60 leading-relaxed mt-0.5 pl-1 border-l-2 border-border/25 ml-1.5">
            <div className="pl-3 py-1">
              {item.output_preview.length > 300 ? item.output_preview.slice(0, 300) + '…' : item.output_preview}
            </div>
          </div>
        )}

        {/* Error message */}
        {isError && item.error && (
          <div className="mt-1 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-400">
            {item.error}
          </div>
        )}
      </div>
    </div>
  )
}
