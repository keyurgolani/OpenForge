/**
 * Common types shared across domains
 */

export type ExecutionMode = 'autonomous' | 'supervised' | 'interactive' | 'manual';
export type ExecutionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'interrupted'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'timeout'
  | 'ready';
export type TriggerType = 'manual' | 'cron' | 'interval' | 'event' | 'heartbeat' | 'webhook';
export type ArtifactType =
  | 'note'
  | 'summary'
  | 'report'
  | 'plan'
  | 'target'
  | 'evidence_packet_ref'
  | 'research_brief'
  | 'dataset'
  | 'alert'
  | 'experiment_result'
  | 'notification_draft'
  | 'generic_document'
  | 'document'
  | 'code'
  | 'data'
  | 'image'
  | 'insight'
  | 'other';
export type Visibility = 'private' | 'workspace' | 'organization' | 'public';
