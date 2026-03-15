import { type ReactNode, type RefObject } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export interface TimelineBadgeProps {
    /** Timeline step type — drives CSS color theming (e.g. 'thinking', 'tool', 'hitl', 'delegation') */
    type: string
    /** Whether the detail panel is currently open */
    open: boolean
    /** Toggle callback */
    onToggle: () => void
    /** Badge label content (rendered inside the toggle button, after the chevron) */
    label: ReactNode
    /** Detail card content (rendered inside the collapsible panel) */
    children: ReactNode
    /** Timeline dot element to render in the gutter */
    timelineDot?: ReactNode
    /** Optional status icon rendered at the trailing edge of the toggle */
    statusIcon?: ReactNode
    /** Whether clicking the toggle should work (default true) */
    hasDetails?: boolean
    /** Extra classes on the outer wrapper div */
    className?: string
    /** Extra classes on the detail card div */
    detailCardClassName?: string
    /** Ref forwarded to the collapse container (for scroll-into-view / requestVisibility) */
    blockRef?: RefObject<HTMLDivElement>
    /**
     * When true, omits the outer `.chat-workflow-step` wrapper and timeline dot.
     * Use this when the parent already provides the timeline step container
     * (e.g. ToolCallCard used inside a parent-managed timeline step).
     */
    bare?: boolean
}

/**
 * Generic expandable badge for the chat execution timeline.
 *
 * Handles the full structural layout:
 *   wrapper (.chat-workflow-step) → timeline dot → toggle button → collapse container → detail card
 *
 * In `bare` mode, only the toggle button + collapse container are rendered,
 * letting the parent control the outer wrapper.
 *
 * State management (open/closed, auto-collapse timers, user-interaction tracking) is
 * owned by the consumer — this component is a controlled, presentational shell.
 */
export function TimelineBadge({
    type,
    open,
    onToggle,
    label,
    children,
    timelineDot,
    statusIcon,
    hasDetails = true,
    className,
    detailCardClassName,
    blockRef,
    bare = false,
}: TimelineBadgeProps) {
    const toggle = (
        <button
            type="button"
            className={`chat-subsection-toggle${open ? ' chat-subsection-toggle-open' : ''}`}
            onClick={() => hasDetails && onToggle()}
            style={!hasDetails ? { cursor: 'default' } : undefined}
        >
            {hasDetails
                ? (open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)
                : <span className="w-3 h-3 inline-block" />}
            {label}
            {statusIcon}
        </button>
    )

    const collapse = (
        <div
            ref={blockRef}
            className={`chat-collapse w-full ${open ? 'chat-collapse-open' : 'chat-collapse-closed'}`}
        >
            <div className="chat-collapse-inner">
                <div className={`chat-step-detail-card${detailCardClassName ? ` ${detailCardClassName}` : ''}`}>
                    {children}
                </div>
            </div>
        </div>
    )

    if (bare) {
        return (
            <div className={className}>
                {toggle}
                {collapse}
            </div>
        )
    }

    return (
        <div className={`chat-workflow-step chat-workflow-step--iconic chat-workflow-step--${type}${className ? ` ${className}` : ''}`}>
            {timelineDot}
            {toggle}
            {collapse}
        </div>
    )
}
