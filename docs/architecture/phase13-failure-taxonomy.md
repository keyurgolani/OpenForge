# Phase 13 Failure Taxonomy

## Why a Failure Taxonomy Exists

The workflow runtime (Phase 9), composite execution (Phase 10), and mission automation (Phase 11) all produce failures. Without a shared taxonomy, each layer invents its own error representation: some use HTTP status codes, some use unstructured error messages, some use ad hoc string constants. This makes it impossible to aggregate failures across layers, compute meaningful failure rates, or build retry logic that operates on stable categories rather than string matching.

The failure taxonomy defines a closed set of failure classes. Each class has a stable error code string, a retryability classification, a severity level, and a typical resolution path. Every failure that surfaces through `RunModel.error_code`, `RunStepModel.error_code`, or `RuntimeEventModel.payload_json` must use one of these codes.

## How Failure Codes Are Used

When a node executor, runtime coordinator, or mission launch path encounters a failure:

1. The failure is classified using the taxonomy below
2. The `error_code` field on the relevant `RunStepModel` or `RunModel` is set to the stable code string
3. The `error_message` field carries the human-readable detail (variable per instance)
4. A `step_failed` or `run_failed` runtime event is emitted with the error code in the event payload
5. Retry logic consults the `retryability` classification to decide whether to retry, propagate, or halt

The error code is the stable key for aggregation. The error message is the variable detail for debugging. These must not be conflated.

## Failure Classes

### prompt_render_failure

- **Code**: `prompt_render_failure`
- **Retryability**: not_retryable
- **Severity**: error
- **Description**: Template rendering or variable resolution failed during prompt construction. This indicates a mismatch between the prompt template's expected variables and the state available at render time.
- **Typical resolution**: Fix the prompt template or the upstream node's output mapping to ensure required variables are present in the state. Verify the workflow's state schema includes all variables referenced by the template.

### policy_denial

- **Code**: `policy_denial`
- **Retryability**: not_retryable
- **Severity**: warning
- **Description**: A tool invocation or action was blocked by policy evaluation. The `PolicyEngine` determined that the requested action violates a configured policy rule. This is the system working as intended, not a malfunction.
- **Typical resolution**: Review the matched policy rule (available via `matched_policy_id` and `matched_rule_id` on the approval request). Either adjust the policy to permit the action, modify the workflow to avoid the action, or route through an approval node.

### approval_timeout

- **Code**: `approval_timeout`
- **Retryability**: conditional
- **Severity**: warning
- **Description**: An approval request expired without being resolved by a human operator. The run was waiting for approval and the configured timeout elapsed.
- **Typical resolution**: Investigate why the approval was not handled. Check whether the approval queue is being monitored. Consider extending the timeout, adding notification mechanisms, or adjusting the autonomy mode to reduce approval frequency. Retryable if the approval can be re-requested with a new timeout.

### approval_denied

- **Code**: `approval_denied`
- **Retryability**: not_retryable
- **Severity**: info
- **Description**: A human operator explicitly denied the approval request. The run followed the `denied` edge in the workflow graph. This is a normal control flow outcome, not an error.
- **Typical resolution**: No technical resolution needed. The workflow should handle the denied path explicitly. If denials are frequent, review whether the workflow's actions align with operator expectations.

### retrieval_failure

- **Code**: `retrieval_failure`
- **Retryability**: retryable
- **Severity**: error
- **Description**: A search query, evidence assembly, or evidence packet construction failed. This may indicate a vector database connectivity issue, an invalid query, or a timeout during retrieval.
- **Typical resolution**: Check Qdrant connectivity and health. Verify the search query is well-formed. Check whether the evidence packet assembly pipeline has sufficient resources. Retry is appropriate since retrieval failures are often transient.

### tool_invocation_failure

- **Code**: `tool_invocation_failure`
- **Retryability**: retryable
- **Severity**: error
- **Description**: An external tool call returned an error. The tool server reported a failure during tool execution. This covers both tool-server-level errors (e.g., tool not found, invalid parameters) and tool-internal errors (e.g., the tool's logic raised an exception).
- **Typical resolution**: Check the tool server logs for the specific error. Verify the tool's input parameters match its schema. If the tool depends on external services, check those services. Retry is appropriate for transient failures; persistent failures indicate a tool bug or misconfiguration.

### tool_timeout

- **Code**: `tool_timeout`
- **Retryability**: retryable
- **Severity**: warning
- **Description**: A tool call exceeded its configured time limit. The tool server did not return a response within the allowed duration.
- **Typical resolution**: Check whether the tool's operation is inherently slow or whether it is stuck. Consider increasing the timeout if the operation legitimately requires more time. If the tool depends on external services, check those services for latency. Retry is appropriate since timeouts are often transient.

### model_invocation_failure

- **Code**: `model_invocation_failure`
- **Retryability**: retryable
- **Severity**: error
- **Description**: The LLM provider returned an error during a model call. This covers provider-side errors (e.g., 500 responses, malformed responses, authentication failures) but not rate limits (which have their own code).
- **Typical resolution**: Check the LLM provider's status page for outages. Verify API keys and provider configuration. Check whether the request payload exceeds the model's context limit. Retry is appropriate for transient provider errors. Persistent failures indicate a configuration or provider issue.

### model_timeout

- **Code**: `model_timeout`
- **Retryability**: retryable
- **Severity**: warning
- **Description**: An LLM provider call exceeded its configured time limit. The provider did not return a response within the allowed duration.
- **Typical resolution**: Check provider latency. Consider whether the prompt is unusually large (causing slow processing). Retry is appropriate since model timeouts are often transient load-related events. If timeouts are persistent, consider switching to a faster model or reducing prompt size.

### rate_limit_exceeded

- **Code**: `rate_limit_exceeded`
- **Retryability**: retryable
- **Severity**: warning
- **Description**: A provider or internal rate limit was hit. The LLM provider returned a 429 response, or an internal rate limiter blocked the request.
- **Typical resolution**: Wait and retry with backoff. Check rate limit quotas on the provider. If internal rate limits are the cause, review the mission's budget policy and concurrent run limits. The retry should include appropriate backoff to avoid compounding the rate limit pressure.

### workflow_schema_failure

- **Code**: `workflow_schema_failure`
- **Retryability**: not_retryable
- **Severity**: error
- **Description**: State mapping or validation failed during workflow execution. An input mapping, output mapping, or state schema validation produced an error. This indicates a structural mismatch in the workflow definition, not a transient runtime issue.
- **Typical resolution**: Review the workflow's node input/output mappings and state schema. Verify that upstream nodes produce the state keys expected by downstream nodes. Check the workflow version's compiled graph for mapping inconsistencies. This requires a workflow definition fix, not a retry.

### join_reduce_failure

- **Code**: `join_reduce_failure`
- **Retryability**: conditional
- **Severity**: error
- **Description**: A fan-out join or reduce operation failed. This may occur because required branches did not complete, the merge strategy encountered incompatible results, or the reduce function raised an error.
- **Typical resolution**: Check which branches completed and which failed. Review the join node's merge strategy and reduce function configuration. If some branches failed due to transient issues, retrying those branches (not the join itself) may resolve the problem. If the merge strategy is incompatible with the branch results, the workflow definition needs adjustment.

### artifact_emission_failure

- **Code**: `artifact_emission_failure`
- **Retryability**: retryable
- **Severity**: error
- **Description**: Artifact creation or versioning failed during an artifact node execution. The artifact service could not persist the artifact record or create a new version.
- **Typical resolution**: Check database connectivity and disk space. Verify the artifact payload is valid (not exceeding size limits, valid content type). Retry is appropriate for transient storage errors. Persistent failures indicate a schema or validation issue in the artifact payload.

### trigger_scheduler_failure

- **Code**: `trigger_scheduler_failure`
- **Retryability**: retryable
- **Severity**: error
- **Description**: Trigger scheduling or firing failed. The trigger scheduler could not evaluate the trigger's schedule expression, compute the next fire time, or initiate the launch sequence.
- **Typical resolution**: Check the trigger's schedule configuration for validity (cron expression syntax, interval values). Verify the trigger scheduler service is running and has database connectivity. Retry is appropriate for transient scheduler errors. Persistent failures indicate a trigger configuration issue.

### budget_exceeded

- **Code**: `budget_exceeded`
- **Retryability**: not_retryable
- **Severity**: warning
- **Description**: A mission budget limit was reached. The `MissionBudgetPolicyModel` evaluation determined that one of `max_runs_per_day`, `max_runs_per_window`, `max_concurrent_runs`, or `max_token_budget_per_window` has been exhausted.
- **Typical resolution**: Wait for the budget window to reset, or increase the budget limits in the mission's budget policy. This is not retryable within the current budget window. Check the mission's budget usage ratio to understand which limit was hit. The trigger fire history records the specific budget constraint that blocked the firing.

### cooldown_active

- **Code**: `cooldown_active`
- **Retryability**: not_retryable
- **Severity**: info
- **Description**: The mission is in a cooldown period following a failure. The `cooldown_seconds_after_failure` value in the budget policy is preventing new runs until the cooldown expires.
- **Typical resolution**: Wait for the cooldown period to expire. If the cooldown is too aggressive, adjust `cooldown_seconds_after_failure` in the budget policy. Investigate and fix the underlying failure that triggered the cooldown before the next run attempts.

### checkpoint_write_failure

- **Code**: `checkpoint_write_failure`
- **Retryability**: retryable
- **Severity**: critical
- **Description**: State checkpoint persistence failed. The `CheckpointStore` could not write a `before_step` or `after_step` checkpoint to the database. This is critical because checkpoint persistence is the foundation of run durability and resumability.
- **Typical resolution**: Check database connectivity, disk space, and write throughput. Checkpoint payloads may be too large if state accumulates excessively. Retry is appropriate for transient storage errors. Persistent failures indicate a database infrastructure issue that must be resolved before execution can safely continue.

### unknown_executor

- **Code**: `unknown_executor`
- **Retryability**: not_retryable
- **Severity**: error
- **Description**: A workflow node's type has no registered executor in the node executor registry. The runtime coordinator cannot dispatch execution for this node type.
- **Typical resolution**: Verify the node type is valid and the corresponding executor is registered in `node_executors/registry.py`. This typically indicates a workflow definition that references a node type added in a newer version than the running runtime, or a typo in the node type field. Requires a code deployment or workflow definition fix, not a retry.

## Failure Classification Summary

| Code | Retryability | Severity |
|------|-------------|----------|
| `prompt_render_failure` | not_retryable | error |
| `policy_denial` | not_retryable | warning |
| `approval_timeout` | conditional | warning |
| `approval_denied` | not_retryable | info |
| `retrieval_failure` | retryable | error |
| `tool_invocation_failure` | retryable | error |
| `tool_timeout` | retryable | warning |
| `model_invocation_failure` | retryable | error |
| `model_timeout` | retryable | warning |
| `rate_limit_exceeded` | retryable | warning |
| `workflow_schema_failure` | not_retryable | error |
| `join_reduce_failure` | conditional | error |
| `artifact_emission_failure` | retryable | error |
| `trigger_scheduler_failure` | retryable | error |
| `budget_exceeded` | not_retryable | warning |
| `cooldown_active` | not_retryable | info |
| `checkpoint_write_failure` | retryable | critical |
| `unknown_executor` | not_retryable | error |

## How Retryability Is Consumed

**retryable**: The runtime coordinator or node executor may automatically retry the operation with appropriate backoff. The `RunStepModel.retry_count` tracks how many attempts have been made. The retry policy (max retries, backoff strategy) is configured per node or per workflow, not hardcoded in the taxonomy.

**not_retryable**: The failure is deterministic given the current state. Retrying the same operation with the same inputs will produce the same failure. The step transitions to `failed` and the coordinator evaluates whether the run should fail or follow an error edge.

**conditional**: Retryability depends on context. For `approval_timeout`, the step is retryable if the workflow allows re-requesting approval. For `join_reduce_failure`, individual failed branches may be retryable even if the join operation itself is not. The retry decision is made by the coordinator based on the workflow definition and the specific failure context.

## How Severity Is Consumed

**info**: Normal control flow outcomes that are recorded for observability but do not indicate a problem. `approval_denied` and `cooldown_active` are expected behaviors, not malfunctions.

**warning**: Conditions that may indicate a problem but do not necessarily represent a system failure. Timeouts, rate limits, budget exhaustion, and policy denials are signals that constraints are being hit, which may or may not require operator action.

**error**: Failures that prevented the expected operation from completing. These require investigation and typically indicate a fixable problem in configuration, infrastructure, or workflow definition.

**critical**: Failures that threaten the durability and correctness guarantees of the platform. `checkpoint_write_failure` is critical because it undermines the ability to resume or inspect runs. Critical failures should trigger immediate operator alerting.
