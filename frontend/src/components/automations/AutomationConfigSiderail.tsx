import { useState } from 'react'
import { ChevronRight, Clock, History, Settings, Tag } from 'lucide-react'
import Siderail from '@/components/shared/Siderail'
import AccordionSection from '@/components/agents/sections/AccordionSection'

export interface TriggerConfig {
  type: string
  cron?: string
  interval_seconds?: number
}

export interface AutomationConfigSiderailProps {
  triggerConfig: TriggerConfig
  tags: string[]
  isEditing: boolean
  status?: string
  healthStatus?: string
  createdAt?: string
  updatedAt?: string
  compilationStatus?: string
  compilationError?: string | null
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

type SectionKey = 'trigger' | 'tags' | 'timeline' | null

export default function AutomationConfigSiderail({
  triggerConfig,
  tags,
  isEditing,
  status,
  healthStatus,
  createdAt,
  updatedAt,
  compilationStatus,
  compilationError,
  onChange,
}: AutomationConfigSiderailProps) {
  const [expandedSection, setExpandedSection] = useState<SectionKey>('trigger')

  const toggle = (key: SectionKey) => {
    setExpandedSection((prev) => (prev === key ? null : key))
  }

  const triggerSummary = triggerConfig.type === 'cron'
    ? `Cron: ${triggerConfig.cron ?? '—'}`
    : triggerConfig.type === 'interval'
      ? `Every ${triggerConfig.interval_seconds ?? 0}s`
      : 'Manual'

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
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 pb-2">
            {/* Trigger Config */}
            <AccordionSection
              title="Trigger"
              summary={triggerSummary}
              icon={Clock}
              expanded={expandedSection === 'trigger'}
              onToggle={() => toggle('trigger')}
            >
              {isEditing ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Type</label>
                    <select
                      className="input w-full mt-1"
                      value={triggerConfig.type || 'manual'}
                      onChange={(e) => onChange('trigger_config', { ...triggerConfig, type: e.target.value })}
                    >
                      <option value="manual">Manual</option>
                      <option value="cron">Cron Schedule</option>
                      <option value="interval">Interval</option>
                    </select>
                  </div>
                  {triggerConfig.type === 'cron' && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Cron Expression</label>
                      <input
                        className="input w-full mt-1 font-mono text-xs"
                        value={triggerConfig.cron || ''}
                        onChange={(e) => onChange('trigger_config', { ...triggerConfig, cron: e.target.value })}
                        placeholder="0 9 * * 1"
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground/70">e.g. "0 9 * * 1" = every Monday at 9 AM</p>
                    </div>
                  )}
                  {triggerConfig.type === 'interval' && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Interval (seconds)</label>
                      <input
                        type="number"
                        className="input w-full mt-1"
                        value={triggerConfig.interval_seconds ?? ''}
                        onChange={(e) => onChange('trigger_config', { ...triggerConfig, interval_seconds: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="3600"
                        min={1}
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground/70">e.g. 3600 = every hour</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div><span className="font-medium text-foreground/80">Type:</span> {triggerConfig.type || 'manual'}</div>
                  {triggerConfig.type === 'cron' && triggerConfig.cron && (
                    <div><span className="font-medium text-foreground/80">Schedule:</span> <code className="font-mono text-accent/80">{triggerConfig.cron}</code></div>
                  )}
                  {triggerConfig.type === 'interval' && triggerConfig.interval_seconds && (
                    <div><span className="font-medium text-foreground/80">Interval:</span> {triggerConfig.interval_seconds}s</div>
                  )}
                </div>
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
                </div>
              </AccordionSection>
            )}
          </div>
        </div>
      )}
    </Siderail>
  )
}
