// ── Unified Execution Timeline Types ──
// Shared data model for all execution contexts: chat, deployment runs, mission cycles.

export type TimelineItemType =
  | 'thinking'
  | 'tool_call'
  | 'hitl'
  | 'subagent'
  | 'intermediate_response'
  | 'node_execution'
  | 'sink_execution'
  | 'cycle'

export type TimelineItemStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'error'
  | 'awaiting_approval'
  | 'approved'
  | 'denied'

export type ExecutionPhase = 'idle' | 'running' | 'complete' | 'error'

export interface TimelineItemBase {
  id: string
  type: TimelineItemType
  status: TimelineItemStatus
  started_at?: number
  duration_ms?: number | null
}

export interface ThinkingTimelineItem extends TimelineItemBase {
  type: 'thinking'
  sentences: string[]
}

export interface ToolCallTimelineItem extends TimelineItemBase {
  type: 'tool_call'
  call_id: string
  tool_name: string
  arguments: Record<string, unknown>
  output?: unknown
  error?: string | null
  success?: boolean | null
  hitl?: {
    hitl_id: string
    action_summary: string
    risk_level: string
    status: string
    resolution_note?: string | null
  } | null
  nested_timeline?: TimelineItem[] | null
}

export interface HITLTimelineItem extends TimelineItemBase {
  type: 'hitl'
  hitl_id: string
  call_id: string
  action_summary: string
  risk_level: string
  tool_name: string
  resolution_note?: string | null
}

export interface SubAgentTimelineItem extends TimelineItemBase {
  type: 'subagent'
  agent_name: string
  call_id: string
  tool_name: string
  arguments: Record<string, unknown>
  delegated_conversation_id?: string
  output?: unknown
  error?: string | null
  success?: boolean | null
  children: TimelineItem[]
}

export interface IntermediateResponseTimelineItem extends TimelineItemBase {
  type: 'intermediate_response'
  content: string
}

export interface NodeExecutionTimelineItem extends TimelineItemBase {
  type: 'node_execution'
  node_key: string
  node_type: 'agent' | 'sink' | 'unknown'
  agent_name?: string
  child_run_id?: string
  output_preview?: string
  error?: string
  children: TimelineItem[]
}

export interface SinkExecutionTimelineItem extends TimelineItemBase {
  type: 'sink_execution'
  node_key: string
  sink_type: string
  output_preview?: string
  error?: string
}

export interface CycleTimelineItem extends TimelineItemBase {
  type: 'cycle'
  cycle_number: number
  ooda_phase: 'perceive' | 'plan' | 'act' | 'evaluate' | 'reflect' | 'completed'
  children: TimelineItem[]
  phase_summaries?: Record<string, string>
  evaluation_scores?: Record<string, number>
  ratchet_passed?: boolean | null
  actions_log?: Array<Record<string, unknown>>
  next_cycle_reason?: string
}

export type TimelineItem =
  | ThinkingTimelineItem
  | ToolCallTimelineItem
  | HITLTimelineItem
  | SubAgentTimelineItem
  | IntermediateResponseTimelineItem
  | NodeExecutionTimelineItem
  | SinkExecutionTimelineItem
  | CycleTimelineItem
