import type { Artifact, ArtifactCreationMode, ArtifactLink, ArtifactObjectType, ArtifactVisibility } from '@/types/artifacts'
import type { ArtifactType } from '@/types/common'

export const ARTIFACT_TYPE_META: Record<ArtifactType, { label: string; accent: string }> = {
  note: { label: 'Note', accent: 'border-sky-500/20 bg-sky-500/10 text-sky-300' },
  summary: { label: 'Summary', accent: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300' },
  report: { label: 'Report', accent: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' },
  plan: { label: 'Plan', accent: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300' },
  target: { label: 'Target', accent: 'border-amber-500/20 bg-amber-500/10 text-amber-300' },
  evidence_packet_ref: { label: 'Evidence Packet', accent: 'border-orange-500/20 bg-orange-500/10 text-orange-300' },
  research_brief: { label: 'Research Brief', accent: 'border-teal-500/20 bg-teal-500/10 text-teal-300' },
  dataset: { label: 'Dataset', accent: 'border-blue-500/20 bg-blue-500/10 text-blue-300' },
  alert: { label: 'Alert', accent: 'border-red-500/20 bg-red-500/10 text-red-300' },
  experiment_result: { label: 'Experiment Result', accent: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300' },
  notification_draft: { label: 'Notification Draft', accent: 'border-violet-500/20 bg-violet-500/10 text-violet-300' },
  generic_document: { label: 'Document', accent: 'border-slate-500/20 bg-slate-500/10 text-slate-300' },
  document: { label: 'Document', accent: 'border-slate-500/20 bg-slate-500/10 text-slate-300' },
  code: { label: 'Code', accent: 'border-lime-500/20 bg-lime-500/10 text-lime-300' },
  data: { label: 'Data', accent: 'border-blue-500/20 bg-blue-500/10 text-blue-300' },
  image: { label: 'Image', accent: 'border-pink-500/20 bg-pink-500/10 text-pink-300' },
  insight: { label: 'Insight', accent: 'border-purple-500/20 bg-purple-500/10 text-purple-300' },
  other: { label: 'Other', accent: 'border-border/60 bg-muted/40 text-muted-foreground' },
}

const VISIBILITY_LABELS: Record<ArtifactVisibility, string> = {
  private: 'Private',
  workspace: 'Workspace',
  export_ready: 'Export Ready',
  hidden: 'Hidden',
}

const ORIGIN_LABELS: Record<ArtifactCreationMode, string> = {
  user_created: 'User Authored',
  run_generated: 'Run Generated',
  mission_generated: 'Mission Generated',
  imported: 'Imported',
  derived: 'Derived',
}

const LINK_TARGET_LABELS: Record<ArtifactObjectType, string> = {
  run: 'Run',
  workflow: 'Workflow',
  mission: 'Mission',
  profile: 'Profile',
  evidence_packet: 'Evidence Packet',
  knowledge: 'Knowledge',
  entity: 'Entity',
  relationship: 'Relationship',
  artifact: 'Artifact',
}

export function getArtifactTypeLabel(type: ArtifactType): string {
  return ARTIFACT_TYPE_META[type]?.label ?? type
}

export function getArtifactTypeAccent(type: ArtifactType): string {
  return ARTIFACT_TYPE_META[type]?.accent ?? ARTIFACT_TYPE_META.other.accent
}

export function getArtifactVisibilityLabel(visibility: ArtifactVisibility): string {
  return VISIBILITY_LABELS[visibility] ?? visibility
}

export function getArtifactOriginLabel(creationMode: ArtifactCreationMode): string {
  return ORIGIN_LABELS[creationMode] ?? creationMode
}

export function getArtifactLinkTargetLabel(targetType: ArtifactObjectType): string {
  return LINK_TARGET_LABELS[targetType] ?? targetType
}

export function getArtifactSourceChips(artifact: Artifact): string[] {
  const chips = [getArtifactOriginLabel(artifact.creation_mode)]
  if (artifact.source_mission_id) chips.push('Mission-linked')
  if (artifact.source_workflow_id) chips.push('Workflow-linked')
  if (artifact.source_run_id) chips.push('Run-linked')
  if (artifact.source_profile_id) chips.push('Profile-linked')
  return chips
}

export function getArtifactLinkHref(workspaceId: string, link: ArtifactLink): string | null {
  switch (link.target_type) {
    case 'artifact':
      return `/w/${workspaceId}/artifacts/${link.target_id}`
    case 'knowledge':
      return `/w/${workspaceId}/knowledge/${link.target_id}`
    case 'run':
      return `/w/${workspaceId}/runs`
    case 'mission':
      return `/w/${workspaceId}/missions`
    case 'workflow':
      return `/w/${workspaceId}/workflows`
    case 'profile':
      return `/w/${workspaceId}/profiles/${link.target_id}`
    default:
      return null
  }
}

export function stringifyStructuredPayload(payload: Record<string, unknown> | undefined): string {
  if (!payload || Object.keys(payload).length === 0) {
    return '{}'
  }
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return '{}'
  }
}
