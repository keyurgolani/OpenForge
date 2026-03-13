import type { TimelineEntry } from '@/hooks/useStreamingChat'
import { TimelineModelSelection } from './TimelineModelSelection'
import { TimelineThinkingBlock } from './TimelineThinkingBlock'
import { TimelineToolCallNode } from './TimelineToolCallNode'
import { TimelinePromptOptimized } from './TimelinePromptOptimized'
import { TimelineAttachments } from './TimelineAttachments'

interface MentionResolutionMaps {
    workspacesById: Map<string, string>
    chatsById: Map<string, string>
    knowledgeById: Map<string, string>
    knowledgeTypeById: Map<string, string>
    knowledgeWorkspaceById: Map<string, { workspaceId: string; workspaceName: string }>
    workspacesByName: Map<string, string>
    chatsByName: Map<string, string>
}

export interface AgentTimelineProps {
    timeline: TimelineEntry[]
    isStreaming?: boolean
    workspaceId: string
    conversationId?: string
    readonly?: boolean
    depth?: number
    requestVisibility?: (el: HTMLElement | null) => void
    mentionMaps?: MentionResolutionMaps
    /** Optional content renderer for subagent response text (e.g. markdown with @mention resolution) */
    renderContent?: (content: string) => string
}

export function AgentTimeline({
    timeline,
    isStreaming = false,
    workspaceId,
    conversationId,
    readonly = false,
    depth = 0,
    requestVisibility,
    mentionMaps,
    renderContent,
}: AgentTimelineProps) {
    const renderNestedTimeline = (props: {
        timeline: TimelineEntry[]
        depth: number
        workspaceId: string
        conversationId?: string
        isStreaming?: boolean
        readonly?: boolean
    }) => (
        <AgentTimeline
            timeline={props.timeline}
            depth={props.depth}
            workspaceId={props.workspaceId}
            conversationId={props.conversationId}
            isStreaming={props.isStreaming}
            readonly={props.readonly}
            requestVisibility={requestVisibility}
            mentionMaps={mentionMaps}
            renderContent={renderContent}
        />
    )

    return (
        <div className={depth > 0 ? 'chat-workflow-stack' : 'flex flex-col gap-[0.65rem]'}>
            {timeline.map((entry, i) => {
                switch (entry.type) {
                    case 'model_selection':
                        return <TimelineModelSelection key={`model-${i}`} entry={entry} />

                    case 'thinking':
                        return (
                            <TimelineThinkingBlock
                                key={`thinking-${i}`}
                                content={entry.content}
                                requestVisibility={requestVisibility}
                                isActiveStream={isStreaming && i === timeline.length - 1 && !entry.done}
                                durationMs={entry.durationMs}
                            />
                        )

                    case 'tool_call':
                        return (
                            <TimelineToolCallNode
                                key={entry.call_id}
                                entry={entry}
                                workspaceId={workspaceId}
                                conversationId={conversationId}
                                isStreaming={isStreaming}
                                readonly={readonly}
                                depth={depth}
                                requestVisibility={requestVisibility}
                                mentionMaps={mentionMaps}
                                renderNestedTimeline={renderNestedTimeline}
                                renderContent={renderContent}
                            />
                        )

                    case 'prompt_optimized':
                        return <TimelinePromptOptimized key={`optimized-${i}`} entry={entry} />

                    case 'attachments_processed':
                        return (
                            <TimelineAttachments
                                key={`attachments-${i}`}
                                entry={entry}
                                workspaceId={workspaceId}
                                requestVisibility={requestVisibility}
                            />
                        )

                    default:
                        return null
                }
            })}
        </div>
    )
}
