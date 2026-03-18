/**
 * CloneStepperModal — guided multi-step wizard for cloning catalog templates
 * with dependency resolution. Used from both catalog page and detail pages.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Copy, Check, ChevronRight, ChevronLeft,
  AlertTriangle, X, Loader2,
} from 'lucide-react'

import { useToast } from '@/components/shared/ToastProvider'
import { useWorkspaces } from '@/hooks/useWorkspace'
import { useProfilesQuery } from '@/features/profiles/hooks'
import { useWorkflowsQuery } from '@/features/workflows/hooks'
import { useDependencyTreeQuery, useUnifiedCloneMutation } from '@/features/catalog/hooks'
import type {
  CatalogItemType, DependencyNode, DependencyResolution,
} from '@/types/catalog'
import type { ExecutionMode } from '@/types/common'

/* ────────────────────────────── types ────────────────────────────── */

interface CloneStepperModalProps {
  templateId: string
  catalogType: CatalogItemType
  onClose: () => void
  onSuccess: (clonedEntity: any) => void
}

interface BasicInfo {
  name: string
  description: string
  workspace_id: string
  autonomy_mode: ExecutionMode
}

interface Resolution {
  resolution: 'clone' | 'existing'
  existing_id?: string
}

type StepKind = 'basic' | 'workflow-deps' | 'profile-deps' | 'review'

/* ────────────────────────── helper utils ─────────────────────────── */

/** Flatten + deduplicate dependency nodes by template_id */
function flattenDeps(nodes: DependencyNode[]): DependencyNode[] {
  const seen = new Set<string>()
  const result: DependencyNode[] = []
  const walk = (list: DependencyNode[]) => {
    for (const n of list) {
      if (!seen.has(n.template_id)) {
        seen.add(n.template_id)
        result.push(n)
      }
      if (n.children.length) walk(n.children)
    }
  }
  walk(nodes)
  return result
}

const AUTONOMY_OPTIONS: { value: ExecutionMode; label: string }[] = [
  { value: 'autonomous', label: 'Autonomous' },
  { value: 'supervised', label: 'Supervised' },
  { value: 'interactive', label: 'Interactive' },
  { value: 'manual', label: 'Manual' },
]

/* ─────────────────────── sub-components ──────────────────────────── */

function StepIndicator({ steps, current }: { steps: StepKind[]; current: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors ${
              i < current
                ? 'bg-accent text-accent-foreground'
                : i === current
                ? 'border-2 border-accent text-accent'
                : 'border border-border/60 text-muted-foreground'
            }`}
          >
            {i < current ? <Check className="w-3.5 h-3.5" /> : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 h-px ${i < current ? 'bg-accent/60' : 'bg-border/40'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

function BasicInfoStep({
  catalogType, info, onChange, workspaces,
}: {
  catalogType: CatalogItemType
  info: BasicInfo
  onChange: (patch: Partial<BasicInfo>) => void
  workspaces: { id: string; name: string }[]
}) {
  const showWorkspace = catalogType !== 'profile'
  const showAutonomy = catalogType === 'mission'

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">Basic Information</h3>

      <label className="block">
        <span className="text-sm text-muted-foreground">Name</span>
        <input
          className="mt-1 block w-full rounded-lg border border-border/60 bg-background/35 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent/60 focus:outline-none"
          value={info.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="Enter a name..."
        />
      </label>

      <label className="block">
        <span className="text-sm text-muted-foreground">Description</span>
        <textarea
          className="mt-1 block w-full rounded-lg border border-border/60 bg-background/35 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent/60 focus:outline-none resize-none"
          rows={3}
          value={info.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="Optional description..."
        />
      </label>

      {showWorkspace && (
        <label className="block">
          <span className="text-sm text-muted-foreground">Workspace</span>
          <select
            className="mt-1 block w-full rounded-lg border border-border/60 bg-background/35 px-3 py-2 text-sm text-foreground focus:border-accent/60 focus:outline-none"
            value={info.workspace_id}
            onChange={e => onChange({ workspace_id: e.target.value })}
          >
            <option value="">No workspace (global)</option>
            {workspaces.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
      )}

      {showAutonomy && (
        <label className="block">
          <span className="text-sm text-muted-foreground">Autonomy Mode</span>
          <select
            className="mt-1 block w-full rounded-lg border border-border/60 bg-background/35 px-3 py-2 text-sm text-foreground focus:border-accent/60 focus:outline-none"
            value={info.autonomy_mode}
            onChange={e => onChange({ autonomy_mode: e.target.value as ExecutionMode })}
          >
            {AUTONOMY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

function DependencyStep({
  title, deps, resolutions, existingEntities, onResolve,
}: {
  title: string
  deps: DependencyNode[]
  resolutions: Record<string, Resolution>
  existingEntities: { id: string; name: string }[]
  onResolve: (templateId: string, res: Resolution) => void
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
        {deps.map(dep => {
          const current = resolutions[dep.template_id]
          const disabled = dep.missing || dep.circular
          return (
            <div key={dep.template_id} className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium text-foreground">
                  {dep.template_name ?? dep.role}
                </span>
                {dep.template_description && (
                  <span className="text-xs text-muted-foreground truncate">
                    — {dep.template_description}
                  </span>
                )}
              </div>

              {disabled && (
                <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {dep.missing
                    ? 'Template is missing — cannot clone this dependency'
                    : 'Circular dependency detected — cannot clone'}
                </div>
              )}

              <div className="space-y-1.5 pl-1">
                {/* Clone from template option */}
                <button
                  type="button"
                  disabled={disabled}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors cursor-pointer ${
                    !disabled && current?.resolution === 'clone'
                      ? 'border-accent/40 bg-accent/10 text-foreground'
                      : disabled
                      ? 'border-border/40 bg-background/20 text-muted-foreground/50 cursor-not-allowed'
                      : 'border-border/60 bg-background/35 text-foreground hover:border-border/80'
                  }`}
                  onClick={() => !disabled && onResolve(dep.template_id, { resolution: 'clone' })}
                >
                  <Copy className="w-4 h-4 flex-shrink-0 text-accent/70" />
                  <span>Clone from template</span>
                </button>

                {/* Existing entities */}
                {existingEntities.map(entity => (
                  <button
                    key={entity.id}
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors cursor-pointer ${
                      current?.resolution === 'existing' && current.existing_id === entity.id
                        ? 'border-accent/40 bg-accent/10 text-foreground'
                        : 'border-border/60 bg-background/35 text-foreground hover:border-border/80'
                    }`}
                    onClick={() =>
                      onResolve(dep.template_id, {
                        resolution: 'existing',
                        existing_id: entity.id,
                      })
                    }
                  >
                    <Check className="w-4 h-4 flex-shrink-0 text-muted-foreground/60" />
                    <span className="truncate">{entity.name}</span>
                  </button>
                ))}

                {existingEntities.length === 0 && disabled && (
                  <p className="text-xs text-muted-foreground pl-1">
                    No existing entities available.
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReviewStep({
  cloneItems, reuseItems,
}: {
  cloneItems: { template_id: string; name: string; type: string }[]
  reuseItems: { existing_id: string; name: string; type: string }[]
}) {
  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold text-foreground">Review</h3>

      {cloneItems.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Will be cloned</h4>
          <ul className="space-y-1.5">
            {cloneItems.map(it => (
              <li
                key={it.template_id}
                className="flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-sm"
              >
                <Copy className="w-3.5 h-3.5 text-accent/70 flex-shrink-0" />
                <span className="text-foreground">{it.name}</span>
                <span className="ml-auto text-xs text-muted-foreground capitalize">{it.type}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reuseItems.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Will reuse existing</h4>
          <ul className="space-y-1.5">
            {reuseItems.map(it => (
              <li
                key={it.existing_id}
                className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/35 px-3 py-2 text-sm"
              >
                <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span className="text-foreground">{it.name}</span>
                <span className="ml-auto text-xs text-muted-foreground capitalize">{it.type}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cloneItems.length === 0 && reuseItems.length === 0 && (
        <p className="text-sm text-muted-foreground">No dependencies to resolve.</p>
      )}
    </div>
  )
}

/* ────────────────────────── main component ───────────────────────── */

export function CloneStepperModal({
  templateId, catalogType, onClose, onSuccess,
}: CloneStepperModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const toast = useToast()

  /* ── queries ── */
  const depTree = useDependencyTreeQuery(catalogType, templateId)
  const { data: workspacesRaw } = useWorkspaces()
  const { data: profilesRaw } = useProfilesQuery()
  const { data: workflowsRaw } = useWorkflowsQuery()
  const cloneMutation = useUnifiedCloneMutation()

  const workspaces: { id: string; name: string }[] = useMemo(
    () => (workspacesRaw as any[] ?? []).map((w: any) => ({ id: w.id, name: w.name })),
    [workspacesRaw],
  )
  const existingProfiles = useMemo(
    () => (profilesRaw?.profiles ?? []).map(p => ({ id: p.id, name: p.name })),
    [profilesRaw],
  )
  const existingWorkflows = useMemo(
    () => (workflowsRaw?.workflows ?? []).map(w => ({ id: w.id, name: w.name })),
    [workflowsRaw],
  )

  /* ── derive dependency lists ── */
  const allDeps = useMemo(
    () => flattenDeps(depTree.data?.dependencies ?? []),
    [depTree.data],
  )
  const workflowDeps = useMemo(
    () => allDeps.filter(d => d.catalog_type === 'workflow'),
    [allDeps],
  )
  const profileDeps = useMemo(
    () => allDeps.filter(d => d.catalog_type === 'profile'),
    [allDeps],
  )

  /* ── compute adaptive steps ── */
  const steps = useMemo<StepKind[]>(() => {
    const s: StepKind[] = ['basic']
    if (workflowDeps.length > 0) s.push('workflow-deps')
    if (profileDeps.length > 0) s.push('profile-deps')
    s.push('review')
    return s
  }, [workflowDeps, profileDeps])

  /* ── state ── */
  const [step, setStep] = useState(0)
  const [info, setInfo] = useState<BasicInfo>({
    name: depTree.data?.root.name ? `${depTree.data.root.name} (Copy)` : '',
    description: depTree.data?.root.description ?? '',
    workspace_id: '',
    autonomy_mode: 'supervised',
  })
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({})

  // Seed info once dep tree loads
  useEffect(() => {
    if (depTree.data?.root) {
      setInfo(prev => ({
        ...prev,
        name: prev.name || `${depTree.data!.root.name} (Copy)`,
        description: prev.description || (depTree.data!.root.description ?? ''),
      }))
    }
  }, [depTree.data])

  /* ── handlers ── */
  const handleResolve = (templateId: string, res: Resolution) => {
    setResolutions(prev => ({ ...prev, [templateId]: res }))
  }

  const updateInfo = (patch: Partial<BasicInfo>) => {
    setInfo(prev => ({ ...prev, ...patch }))
  }

  const currentStep = steps[step]

  const isBasicValid = useMemo(() => {
    if (!info.name.trim()) return false
    return true
  }, [info])

  const isDepStepValid = (deps: DependencyNode[]) =>
    deps.every(d => {
      if (d.missing || d.circular) return true // disabled items don't block
      return resolutions[d.template_id] != null
    })

  const canNext = useMemo(() => {
    switch (currentStep) {
      case 'basic': return isBasicValid
      case 'workflow-deps': return isDepStepValid(workflowDeps)
      case 'profile-deps': return isDepStepValid(profileDeps)
      case 'review': return true
      default: return false
    }
  }, [currentStep, isBasicValid, workflowDeps, profileDeps, resolutions])

  /* ── build review lists ── */
  const { cloneItems, reuseItems } = useMemo(() => {
    const clone: { template_id: string; name: string; type: string }[] = []
    const reuse: { existing_id: string; name: string; type: string }[] = []

    for (const dep of allDeps) {
      const r = resolutions[dep.template_id]
      if (!r) continue
      const name = dep.template_name ?? dep.role
      if (r.resolution === 'clone') {
        clone.push({ template_id: dep.template_id, name, type: dep.catalog_type })
      } else if (r.resolution === 'existing' && r.existing_id) {
        const entities = dep.catalog_type === 'profile' ? existingProfiles : existingWorkflows
        const entity = entities.find(e => e.id === r.existing_id)
        reuse.push({
          existing_id: r.existing_id,
          name: entity?.name ?? r.existing_id,
          type: dep.catalog_type,
        })
      }
    }
    return { cloneItems: clone, reuseItems: reuse }
  }, [allDeps, resolutions, existingProfiles, existingWorkflows])

  /* ── clone submit ── */
  const handleClone = () => {
    const overrides: Record<string, any> = { name: info.name.trim() }
    if (info.description.trim()) overrides.description = info.description.trim()
    if (info.workspace_id) overrides.workspace_id = info.workspace_id
    if (catalogType === 'mission') overrides.autonomy_mode = info.autonomy_mode

    const depResolutions: DependencyResolution[] = allDeps
      .filter(d => resolutions[d.template_id] && !d.missing && !d.circular)
      .map(d => {
        const r = resolutions[d.template_id]
        const base: DependencyResolution = {
          template_id: d.template_id,
          catalog_type: d.catalog_type,
          resolution: r.resolution,
        }
        if (r.resolution === 'existing' && r.existing_id) {
          base.existing_id = r.existing_id
        }
        return base
      })

    cloneMutation.mutate(
      {
        root_template_id: templateId,
        root_catalog_type: catalogType,
        overrides,
        dependency_resolutions: depResolutions,
      },
      {
        onSuccess: (data) => {
          toast.success('Clone successful', `"${info.name.trim()}" has been created.`)
          onSuccess(data.cloned_entity)
        },
        onError: (err) => {
          toast.error('Clone failed', err.message ?? 'An unexpected error occurred.')
        },
      },
    )
  }

  /* ── keyboard ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current && !cloneMutation.isPending) onClose()
  }

  /* ── loading state ── */
  const isLoading = depTree.isLoading

  /* ── render ── */
  return createPortal(
    <AnimatePresence>
      <div
        ref={backdropRef}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />

        {/* Modal panel */}
        <motion.div
          className="relative w-full max-w-2xl rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-xl p-6"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            disabled={cloneMutation.isPending}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <h2 className="text-lg font-semibold text-foreground mb-1">
            Clone {catalogType.charAt(0).toUpperCase() + catalogType.slice(1)}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {depTree.data?.root.name ?? 'Loading...'}
          </p>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
              <span className="text-sm text-muted-foreground">Loading dependency tree...</span>
            </div>
          ) : depTree.isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
              <span className="text-sm text-muted-foreground">
                Failed to load dependencies. Please try again.
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border/60 bg-card/50 px-4 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <StepIndicator steps={steps} current={step} />

              {/* Step content */}
              <div className="min-h-[240px]">
                {currentStep === 'basic' && (
                  <BasicInfoStep
                    catalogType={catalogType}
                    info={info}
                    onChange={updateInfo}
                    workspaces={workspaces}
                  />
                )}
                {currentStep === 'workflow-deps' && (
                  <DependencyStep
                    title="Workflow Dependencies"
                    deps={workflowDeps}
                    resolutions={resolutions}
                    existingEntities={existingWorkflows}
                    onResolve={handleResolve}
                  />
                )}
                {currentStep === 'profile-deps' && (
                  <DependencyStep
                    title="Profile Dependencies"
                    deps={profileDeps}
                    resolutions={resolutions}
                    existingEntities={existingProfiles}
                    onResolve={handleResolve}
                  />
                )}
                {currentStep === 'review' && (
                  <ReviewStep cloneItems={cloneItems} reuseItems={reuseItems} />
                )}
              </div>

              {/* Footer navigation */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setStep(s => s - 1)}
                  disabled={step === 0 || cloneMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/50 px-4 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>

                {currentStep === 'review' ? (
                  <button
                    type="button"
                    onClick={handleClone}
                    disabled={cloneMutation.isPending}
                    className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
                  >
                    {cloneMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Clone
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStep(s => s + 1)}
                    disabled={!canNext}
                    className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  )
}
