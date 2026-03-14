/**
 * Common types shared across domains
 */

export type ExecutionMode = 'autonomous' | 'supervised' | 'interactive' | 'manual';
export type ExecutionStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' | 'timeout';
export type TriggerType = 'schedule' | 'event' | 'webhook' | 'manual';
export type ArtifactType = 'document' | 'report' | 'code' | 'data' | 'image' | 'summary' | 'insight' | 'other';
export type Visibility = 'private' | 'workspace' | 'organization' | 'public';
