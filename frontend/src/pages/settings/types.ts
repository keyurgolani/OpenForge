export type SettingsTab = 'workspaces' | 'llm' | 'prompts' | 'policies' | 'approvals' | 'jobs' | 'skills' | 'mcp' | 'audit' | 'export' | 'import'

export type WorkspaceRow = {
    id: string; name: string; description: string | null
    icon: string | null; color: string | null
    llm_provider_id: string | null; llm_model: string | null
    knowledge_intelligence_provider_id: string | null; knowledge_intelligence_model: string | null
    vision_provider_id: string | null; vision_model: string | null
    knowledge_count: number
    conversation_count: number
}

export type ProviderRow = { id: string; display_name: string; provider_name: string; default_model: string | null; is_system_default: boolean; has_api_key: boolean; base_url: string | null; enabled_models: { id: string; name: string }[] }

export type LLMSubTab = 'providers' | 'chat' | 'vision' | 'embedding' | 'audio' | 'clip' | 'pdf'

export interface TypedModel { provider_id: string; model_id: string; model_name: string; is_default?: boolean }

export type ModelQuality = 'Fast' | 'Balanced' | 'Best'
export type VramTier = '≤2GB' | '≤4GB' | '≤8GB' | '≤16GB' | '32GB+'

export interface LocalModel {
    id: string
    name: string
    diskSize: string
    vramReq: string
    dims?: number
    quality: ModelQuality
    desc: string
    recommendedFor?: VramTier[]
}

export interface CLIPModelInfo {
    id: string
    name: string
    diskSize: string
    vramReq: string
    dimension: number
    quality: ModelQuality
    desc: string
    recommendedFor?: VramTier[]
}

export interface PromptEntry {
    id: string
    label: string
    description: string
    category: string
    role: string
    variables: string[]
    default: string
    override: string | null
    updated_at: string | null
}

export type PromptsSubTab = 'agent' | 'knowledge' | 'extraction'

export type JobsSubTab = 'pipelines' | 'schedules' | 'automated-triggers' | 'indexing'

export interface ScheduleEntry {
    id: string
    label: string
    description: string
    category: string
    default_enabled: boolean
    default_interval_hours: number
    enabled: boolean
    interval_hours: number
    supports_target_scope?: boolean
    target_scope?: 'one' | 'remaining' | 'all' | null
    knowledge_id?: string | null
    last_run: string | null
}

export interface ToolParam {
    name: string
    type: string
    description?: string
    required: boolean
    enumValues?: string[]
    default?: unknown
}

export interface ToolMeta {
    id: string
    category: string
    display_name: string
    description: string
    input_schema: {
        type: string
        properties?: Record<string, {
            type?: string
            description?: string
            enum?: string[]
            default?: unknown
            items?: { type?: string }
        }>
        required?: string[]
    }
    risk_level: string
}

export interface InstalledSkill {
    name: string
    description: string
    path: string
}

export interface TaskLogEntry {
    id: string
    task_type: string
    status: string
    workspace_id: string | null
    started_at: string
    finished_at: string | null
    duration_ms: number | null
    item_count: number | null
    error_message: string | null
    target_link: string | null
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'unknown'
export type ContainerLogLine = { id: number; container: string; data: string; level: LogLevel }

export interface HITLRequest {
    id: string
    workspace_id: string
    conversation_id: string
    tool_id: string
    tool_input: Record<string, unknown>
    action_summary: string
    risk_level: string
    status: string
    resolution_note: string | null
    created_at: string
    resolved_at: string | null
}

export interface ToolCallLogEntry {
    id: string
    workspace_id: string | null
    conversation_id: string
    call_id: string
    tool_name: string
    arguments: Record<string, unknown> | null
    success: boolean | null
    output: string | null
    error: string | null
    duration_ms: number | null
    started_at: string
    finished_at: string | null
}

export interface MCPToolDef {
    name: string
    description: string
    inputSchema?: object
}

export interface MCPServerRow {
    id: string
    name: string
    url: string
    description: string | null
    transport: string
    auth_type: string
    has_auth: boolean
    is_enabled: boolean
    discovered_tools: MCPToolDef[]
    tool_count: number
    last_discovered_at: string | null
    default_risk_level: string
    created_at: string
    updated_at: string
}
