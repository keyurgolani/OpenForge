import { useState } from 'react'
import { ChevronRight, History, Settings } from 'lucide-react'
import Siderail from '@/components/shared/Siderail'
import AccordionSection from './sections/AccordionSection'
import LlmConfigSection from './sections/LlmConfigSection'
import ToolsConfigSection from './sections/ToolsConfigSection'
import MemoryConfigSection from './sections/MemoryConfigSection'
import TagsSection from './sections/TagsSection'
import type {
  LlmConfig,
  ToolConfig,
  MemoryConfig,
} from '@/types/agents'

interface VersionEntry {
  id: string
  version: number
  created_at: string
}

export interface AgentConfigSiderailProps {
  llmConfig: LlmConfig
  toolsConfig: ToolConfig[]
  memoryConfig: MemoryConfig
  tags: string[]
  isEditing: boolean
  createdAt?: string
  updatedAt?: string
  versions?: VersionEntry[]
  viewingVersion: string | null
  onViewVersion: (versionId: string | null) => void
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

type SectionKey = 'llm' | 'tools' | 'memory' | 'tags' | 'timeline' | null

export default function AgentConfigSiderail({
  llmConfig,
  toolsConfig,
  memoryConfig,
  tags,
  isEditing,
  createdAt,
  updatedAt,
  versions,
  viewingVersion,
  onViewVersion,
  onChange,
}: AgentConfigSiderailProps) {
  const [expandedSection, setExpandedSection] = useState<SectionKey>('llm')

  const toggle = (key: SectionKey) => {
    setExpandedSection((prev) => (prev === key ? null : key))
  }

  return (
    <Siderail
      storageKey="openforge.agent.config.pct"
      collapsedStorageKey="openforge.agent.config.collapsed"
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
                <h3 className="text-sm font-semibold tracking-tight">
                  Configuration
                </h3>
              </div>
              <p className="text-xs text-muted-foreground/90">
                Advanced agent settings.
              </p>
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

          {/* Sections — collapsed headers always visible, expanded content scrolls */}
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 pb-2">
            <LlmConfigSection
              value={llmConfig}
              onChange={(v) => onChange('llm_config', v)}
              isEditing={isEditing}
              expanded={expandedSection === 'llm'}
              onToggle={() => toggle('llm')}
            />
            <ToolsConfigSection
              value={toolsConfig}
              onChange={(v) => onChange('tools_config', v)}
              isEditing={isEditing}
              expanded={expandedSection === 'tools'}
              onToggle={() => toggle('tools')}
            />
            <MemoryConfigSection
              value={memoryConfig}
              onChange={(v) => onChange('memory_config', v)}
              isEditing={isEditing}
              expanded={expandedSection === 'memory'}
              onToggle={() => toggle('memory')}
            />
            <TagsSection
              value={tags}
              onChange={(v) => onChange('tags', v)}
              isEditing={isEditing}
              expanded={expandedSection === 'tags'}
              onToggle={() => toggle('tags')}
            />

            {/* Timeline: versions + timestamps */}
            {(createdAt || updatedAt || (versions && versions.length > 0)) && (
              <AccordionSection
                title="Timeline"
                summary={viewingVersion ? `Viewing v${versions?.find((v) => v.id === viewingVersion)?.version ?? '?'}` : `v${versions?.[0]?.version ?? '–'} · ${formatDate(updatedAt)}`}
                icon={History}
                expanded={expandedSection === 'timeline'}
                onToggle={() => toggle('timeline')}
              >
                <div className="space-y-3 text-xs text-muted-foreground">
                  {/* Timestamps */}
                  {(createdAt || updatedAt) && (
                    <div className="space-y-1">
                      {createdAt && (
                        <div>
                          <span className="font-medium text-foreground/80">Created:</span>{' '}
                          {formatDate(createdAt)}
                        </div>
                      )}
                      {updatedAt && (
                        <div>
                          <span className="font-medium text-foreground/80">Updated:</span>{' '}
                          {formatDate(updatedAt)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Version selector */}
                  {versions && versions.length > 0 && !isEditing && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                        Versions
                      </div>
                      <div className="space-y-1">
                        <button
                          onClick={() => onViewVersion(null)}
                          className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition ${
                            !viewingVersion
                              ? 'border-accent/40 bg-accent/10'
                              : 'border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-medium ${!viewingVersion ? 'text-accent' : 'text-foreground/80'}`}>
                              Current
                            </span>
                            {updatedAt && (
                              <span className="text-[10px] text-muted-foreground/50">
                                {formatDate(updatedAt)}
                              </span>
                            )}
                          </div>
                        </button>
                        {[...versions]
                          .sort((a, b) => b.version - a.version)
                          .map((v) => {
                            const isActive = viewingVersion === v.id
                            return (
                              <button
                                key={v.id}
                                onClick={() => onViewVersion(v.id)}
                                className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition ${
                                  isActive
                                    ? 'border-accent/40 bg-accent/10'
                                    : 'border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`text-xs font-medium ${isActive ? 'text-accent' : 'text-foreground/80'}`}>
                                    v{v.version}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground/50">
                                    {formatDate(v.created_at)}
                                  </span>
                                </div>
                              </button>
                            )
                          })}
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
