/**
 * Observability domain types
 */

export interface UsageSummary {
  total_input_tokens: number;
  total_output_tokens: number;
  total_reasoning_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  total_requests: number;
  total_tool_calls: number;
  total_llm_calls: number;
  avg_latency_ms: number | null;
  model_breakdown: Record<string, { requests: number; tokens: number; cost: number }>;
  tool_breakdown: Record<string, { invocations: number; failures: number; avg_latency_ms: number }>;
  failure_count: number;
}

export interface FailureEvent {
  id: string;
  failure_class: string;
  error_code: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  retryability: 'retryable' | 'not_retryable' | 'conditional';
  summary: string;
  detail: Record<string, unknown>;
  affected_node_key: string | null;
  run_id: string | null;
  step_id: string | null;
  workflow_id: string | null;
  mission_id: string | null;
  resolved: boolean;
  created_at: string;
}

export interface FailureRollupItem {
  group_key: string;
  count: number;
  severity: string | null;
  retryability: string | null;
  latest_at: string | null;
}

export interface CostHotspot {
  object_type: string;
  object_id: string;
  object_name: string | null;
  total_cost_usd: number;
  total_tokens: number;
  request_count: number;
}

export interface RunTelemetrySummary {
  run_id: string;
  usage: UsageSummary;
  failures: { items: FailureEvent[]; count: number };
  event_count: number;
  step_count: number;
  artifact_count: number;
  child_run_count: number;
}

export interface EvaluationScenario {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  suite_name: string;
  scenario_type: string;
  input_payload: Record<string, unknown>;
  expected_behaviors: string[];
  evaluation_metrics: Array<{ name: string; threshold?: number }>;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EvaluationRun {
  id: string;
  suite_name: string | null;
  status: string;
  scenario_count: number;
  passed_count: number;
  failed_count: number;
  skipped_count: number;
  total_cost_usd: number | null;
  total_tokens: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface EvaluationResult {
  id: string;
  evaluation_run_id: string;
  scenario_id: string;
  run_id: string | null;
  status: string;
  metrics: Record<string, unknown>;
  threshold_results: Record<string, { threshold: number; actual: number; passed: boolean }>;
  cost_usd: number | null;
  tokens_used: number;
  duration_ms: number | null;
  error_message: string | null;
}
