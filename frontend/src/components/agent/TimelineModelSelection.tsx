import { Bot } from 'lucide-react'
import type { TimelineModelSelection as TimelineModelSelectionEntry } from '@/hooks/useStreamingChat'
import { AgentTimelineDot } from './AgentTimelineDot'

export function TimelineModelSelection({ entry }: { entry: TimelineModelSelectionEntry }) {
    const label = entry.provider_display_name && entry.model
        ? `${entry.provider_display_name} · ${entry.model}`
        : entry.model || entry.provider_name || 'Unknown'

    return (
        <div className="chat-workflow-step chat-workflow-step--iconic chat-workflow-step--llm chat-section-reveal w-fit">
            <AgentTimelineDot type="model_selection" />
            <span className="chat-subsection-toggle" style={{ cursor: 'default' }}>
                <Bot className="h-3 w-3 text-accent/80" />
                <span>LLM</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="truncate">{label}</span>
                {entry.is_override && (
                    <span className="text-[9px] uppercase tracking-wide text-accent/50 ml-1">(override)</span>
                )}
            </span>
        </div>
    )
}
