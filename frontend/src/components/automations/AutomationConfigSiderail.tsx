import { useState } from 'react'
import { ChevronRight, FileText, History, Settings, Tag } from 'lucide-react'
import Siderail from '@/components/shared/Siderail'
import AccordionSection from '@/components/agents/sections/AccordionSection'

export interface VersionEntry {
  version: number
  created_at: string
  is_valid: boolean
}

export interface AutomationConfigSiderailProps {
  description: string
  tags: string[]
  isEditing: boolean
  status?: string
  healthStatus?: string
  graphVersion?: number
  createdAt?: string
  updatedAt?: string
  compilationStatus?: string
  compilationError?: string | null
  versions?: VersionEntry[]
  onChange: (field: string, value: unknown) => void
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '--'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type SectionKey = 'description' | 'tags' | 'timeline' | null

export default function AutomationConfigSiderail({
  description,
  tags,
  isEditing,
  status,
  healthStatus,
  graphVersion,
  createdAt,
  updatedAt,
  compilationStatus,
  compilationError,
  versions,
  onChange,
}: AutomationConfigSiderailProps) {
  const [expandedSection, setExpandedSection] = useState<SectionKey>('description')

  const toggle = (key: SectionKey) => {
    setExpandedSection((prev) => (prev === key ? null : key))
  }

  return (
    <Siderail
      storageKey="openforge.automation.config.pct"
      collapsedStorageKey="openforge.automation.config.collapsed"
      icon={Settings}
      label="Configuration"
      breakpoint="lg"
    >
      {(onCollapse) => (
        <div className="flex h-full min-h-0 flex-col px-4">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold tracking-tight">Configuration</h3>
              </div>
              <p className="text-xs text-muted-foreground/90">Automation settings.</p>
            </div>
            <button
              type="button"
              onClick={onCollapse}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border/70 bg-card/60 text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
              aria-label="Collapse configuration sidebar"
              title="Collapse configuration"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Sections */}
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-2">
            {/* Description */}
            <AccordionSection
              title="Description"
              summary={description || 'No description'}
              icon={FileText}
              expanded={expandedSection === 'description'}
              onToggle={() => toggle('description')}
            >
              {isEditing ? (
                <textarea
                  className="input w-full min-h-[60px] text-xs resize-y"
                  value={description}
                  onChange={(e) => onChange('description', e.target.value)}
                  placeholder="Describe what this automation does..."
                />
              ) : (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {description || <span className="italic">No description</span>}
                </p>
              )}
            </AccordionSection>

            {/* Tags */}
            <AccordionSection
              title="Tags"
              summary={tags.length ? tags.join(', ') : 'No tags'}
              icon={Tag}
              expanded={expandedSection === 'tags'}
              onToggle={() => toggle('tags')}
            >
              {isEditing ? (
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                        {tag}
                        <button
                          className="ml-0.5 text-accent/60 hover:text-accent transition"
                          onClick={() => onChange('tags', tags.filter((_, idx) => idx !== i))}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    className="input w-full text-xs"
                    placeholder="Add tag and press Enter"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const v = (e.target as HTMLInputElement).value.trim()
                        if (v && !tags.includes(v)) {
                          onChange('tags', [...tags, v]);
                          (e.target as HTMLInputElement).value = ''
                        }
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tags.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">No tags</span>
                  ) : tags.map((tag, i) => (
                    <span key={i} className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </AccordionSection>

            {/* Timeline */}
            {(createdAt || updatedAt) && (
              <AccordionSection
                title="Timeline"
                summary={`${status ?? 'draft'} · ${formatDate(updatedAt)}`}
                icon={History}
                expanded={expandedSection === 'timeline'}
                onToggle={() => toggle('timeline')}
              >
                <div className="space-y-3 text-xs text-muted-foreground">
                  <div className="space-y-1">
                    {status && (
                      <div><span className="font-medium text-foreground/80">Status:</span> <span className="capitalize">{status}</span></div>
                    )}
                    {healthStatus && (
                      <div><span className="font-medium text-foreground/80">Health:</span> <span className="capitalize">{healthStatus}</span></div>
                    )}
                    {compilationStatus && (
                      <div>
                        <span className="font-medium text-foreground/80">Compilation:</span>{' '}
                        <span className={compilationStatus === 'failed' ? 'text-red-400' : compilationStatus === 'success' ? 'text-emerald-400' : ''}>
                          {compilationStatus}
                        </span>
                      </div>
                    )}
                    {compilationError && (
                      <div className="mt-1 rounded-md bg-red-500/10 border border-red-500/20 px-2 py-1 text-[10px] text-red-300">{compilationError}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    {createdAt && (
                      <div><span className="font-medium text-foreground/80">Created:</span> {formatDate(createdAt)}</div>
                    )}
                    {updatedAt && (
                      <div><span className="font-medium text-foreground/80">Updated:</span> {formatDate(updatedAt)}</div>
                    )}
                  </div>
                  {/* Version history */}
                  {versions && versions.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-border/40">
                      <span className="font-medium text-foreground/80">Versions</span>
                      <div className="space-y-1">
                        {versions.map((v) => (
                          <div key={v.version} className={`flex items-center justify-between rounded px-1.5 py-0.5 ${v.version === graphVersion ? 'bg-accent/10 text-accent' : ''}`}>
                            <span>
                              v{v.version}
                              {v.version === graphVersion && <span className="ml-1 text-[10px] opacity-70">(current)</span>}
                              {!v.is_valid && <span className="ml-1 text-[10px] text-red-400">invalid</span>}
                            </span>
                            <span className="text-[10px] opacity-60">{formatDate(v.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionSection>
            )}
          </div>
        </div>
      )}
    </Siderail>
  )
}
