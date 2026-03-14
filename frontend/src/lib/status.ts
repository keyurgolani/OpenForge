/**
 * Status Helpers
 *
 * Provides utilities for working with status values across the application.
 */

/**
 * Execution/run status values
 */
export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Knowledge item status values
 */
export type KnowledgeStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed';

/**
 * Trigger status values
 */
export type TriggerStatus =
  | 'active'
  | 'paused'
  | 'disabled';

/**
 * Check if a status indicates a terminal state
 */
export function isTerminalStatus(status: ExecutionStatus | KnowledgeStatus): boolean {
  return ['completed', 'failed', 'cancelled', 'ready'].includes(status);
}

/**
 * Check if a status indicates an active/running state
 */
export function isActiveStatus(status: ExecutionStatus | KnowledgeStatus): boolean {
  return ['pending', 'running', 'processing'].includes(status);
}

/**
 * Check if a status indicates a success state
 */
export function isSuccessStatus(status: ExecutionStatus): boolean {
  return status === 'completed';
}

/**
 * Check if a status indicates a failure state
 */
export function isFailureStatus(status: ExecutionStatus | KnowledgeStatus): boolean {
  return status === 'failed';
}

/**
 * Get a human-readable status label
 */
export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending',
    running: 'Running',
    processing: 'Processing',
    completed: 'Completed',
    ready: 'Ready',
    failed: 'Failed',
    cancelled: 'Cancelled',
    active: 'Active',
    paused: 'Paused',
    disabled: 'Disabled',
  };
  return labels[status] || status;
}

/**
 * Status color variants for UI components
 */
export type StatusColor = 'default' | 'success' | 'warning' | 'error' | 'info';

/**
 * Get the color variant for a status
 */
export function getStatusColor(status: ExecutionStatus | KnowledgeStatus | TriggerStatus): StatusColor {
  const colorMap: Record<string, StatusColor> = {
    pending: 'default',
    running: 'info',
    processing: 'info',
    completed: 'success',
    ready: 'success',
    failed: 'error',
    cancelled: 'warning',
    active: 'success',
    paused: 'warning',
    disabled: 'default',
  };
  return colorMap[status] || 'default';
}
