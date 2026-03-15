export interface PromptVariableSchema {
  type: string
  required: boolean
  description?: string | null
}

export interface ManagedPrompt {
  id: string
  name: string
  slug: string
  description: string | null
  prompt_type: string
  template: string
  template_format: string
  variable_schema: Record<string, PromptVariableSchema>
  fallback_behavior: string
  owner_type: string
  owner_id: string | null
  is_system: boolean
  is_template: boolean
  status: string
  version: number
  created_at: string | null
  updated_at: string | null
  last_used_at: string | null
}

export interface PromptVersion {
  id: string
  prompt_definition_id: string
  version: number
  template: string
  template_format: string
  variable_schema: Record<string, PromptVariableSchema>
  status: string
  created_at: string | null
  created_by: string | null
}

export interface PromptPreviewResult {
  content: string
  metadata: {
    prompt_id: string
    prompt_version: number
    owner_type: string
    owner_id: string | null
    rendered_at: string
    variable_keys: string[]
  }
  validation_errors: Array<Record<string, unknown>>
}

export interface PolicyRecord {
  id: string
  policy_kind: 'tool' | 'safety' | 'approval'
  name: string
  description: string | null
  scope_type: string
  scope_id: string | null
  default_action: string | null
  status: string
  rule_count: number
  affected_tools: string[]
  approval_requirements: string[]
  rate_limits: Record<string, unknown>
  updated_at: string | null
  rules?: Array<Record<string, unknown>>
  allowed_tools?: string[]
  blocked_tools?: string[]
  approval_required_tools?: string[]
}

export interface PolicySimulationResult {
  decision: string
  matched_policy_id: string | null
  matched_rule_id: string | null
  matched_policy_scope: string | null
  reason_code: string
  reason_text: string
  risk_category: string
  rate_limit_state: Record<string, unknown> | null
}

export interface ApprovalRecord {
  id: string
  request_type: string
  scope_type: string
  scope_id: string | null
  source_run_id: string | null
  requested_action: string
  tool_name: string | null
  reason_code: string
  reason_text: string
  risk_category: string
  payload_preview: Record<string, unknown> | null
  matched_policy_id: string | null
  matched_rule_id: string | null
  status: string
  requested_at: string
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null
}
