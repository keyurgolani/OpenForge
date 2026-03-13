import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { TimelineBadge } from '@/components/shared/TimelineBadge'
import { AgentTimelineDot } from './AgentTimelineDot'
import type { TimelinePromptOptimized as TimelinePromptOptimizedEntry } from '@/hooks/useStreamingChat'

export function TimelinePromptOptimized({ entry }: { entry: TimelinePromptOptimizedEntry }) {
    const [expanded, setExpanded] = useState(false)
    return (
        <TimelineBadge
            type="prompt"
            open={expanded}
            onToggle={() => setExpanded(prev => !prev)}
            timelineDot={<AgentTimelineDot type="prompt" />}
            className="chat-section-reveal"
            label={<>
                <Sparkles className="h-3 w-3 text-violet-400" />
                <span>Prompt Optimized</span>
            </>}
        >
            <div className="space-y-2 text-xs">
                <div>
                    <span className="text-muted-foreground font-medium block mb-0.5">Original:</span>
                    <div className="bg-muted/20 rounded-lg px-3 py-2 text-foreground/80 whitespace-pre-wrap">{entry.original}</div>
                </div>
                <div>
                    <span className="text-accent/80 font-medium block mb-0.5">Optimized:</span>
                    <div className="bg-accent/5 border border-accent/15 rounded-lg px-3 py-2 text-foreground/90 whitespace-pre-wrap">{entry.optimized}</div>
                </div>
            </div>
        </TimelineBadge>
    )
}
