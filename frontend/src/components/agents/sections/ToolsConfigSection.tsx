import { useEffect, useMemo, useState } from 'react'
import { Wrench } from 'lucide-react'
import AccordionSection from './AccordionSection'
import { getToolRegistry } from '@/lib/api'
import type { ToolConfig } from '@/types/agents'

type ToolMode = 'disabled' | 'allowed' | 'hitl'

interface RegistryTool {
  id: string
  category: string
  display_name?: string
  confirm_by_default?: boolean
}

interface ToolsConfigSectionProps {
  value: ToolConfig[]
  onChange: (tools: ToolConfig[]) => void
  isEditing: boolean
  expanded?: boolean
  onToggle?: () => void
}

export default function ToolsConfigSection({
  value,
  onChange,
  isEditing,
  expanded,
  onToggle,
}: ToolsConfigSectionProps) {
  const [registryTools, setRegistryTools] = useState<RegistryTool[]>([])
  const [toolsLoaded, setToolsLoaded] = useState(false)

  useEffect(() => {
    getToolRegistry()
      .then((data: { tools: RegistryTool[] }) => setRegistryTools(data.tools ?? []))
      .catch(() => setRegistryTools([]))
      .finally(() => setToolsLoaded(true))
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, RegistryTool[]>()
    registryTools.forEach((t) => {
      const list = map.get(t.category) ?? []
      list.push(t)
      map.set(t.category, list)
    })
    return map
  }, [registryTools])

  // Empty value = all tools allowed (no explicit config).
  // Non-empty value = explicit allowlist.
  const isAllAllowed = value.length === 0

  const toolModeMap = useMemo(() => {
    const m = new Map<string, ToolMode>()
    value.forEach((t) => m.set(t.name, t.mode ?? 'allowed'))
    return m
  }, [value])

  const confirmByDefaultSet = useMemo(() => {
    const s = new Set<string>()
    registryTools.forEach((t) => { if (t.confirm_by_default) s.add(t.id) })
    return s
  }, [registryTools])

  const getDefaultMode = (name: string): ToolMode =>
    confirmByDefaultSet.has(name) ? 'hitl' : 'allowed'

  const getMode = (name: string): ToolMode => {
    if (isAllAllowed) return getDefaultMode(name)
    return toolModeMap.get(name) ?? 'disabled'
  }

  // Materialize all registry tools with their default modes — used when
  // transitioning from implicit all-allowed to an explicit list.
  const materializeAll = (): ToolConfig[] =>
    registryTools.map((t) => ({
      name: t.id,
      category: t.category,
      mode: t.confirm_by_default ? 'hitl' as const : 'allowed' as const,
    }))

  const setToolMode = (id: string, category: string, mode: ToolMode) => {
    if (isAllAllowed) {
      // No-op if clicking the current default mode
      if (mode === getDefaultMode(id)) return
      // Transition: materialize all with defaults, then apply change
      const all = materializeAll()
      if (mode === 'disabled') {
        onChange(all.filter((t) => t.name !== id))
      } else {
        onChange(all.map((t) => (t.name === id ? { ...t, mode } : t)))
      }
      return
    }
    // Explicit list mode
    const filtered = value.filter((t) => t.name !== id)
    if (mode !== 'disabled') {
      filtered.push({ name: id, category, mode })
    }
    onChange(filtered)
  }

  const setCategoryMode = (category: string, mode: ToolMode) => {
    const catTools = registryTools.filter((t) => t.category === category)
    const catIds = new Set(catTools.map((t) => t.id))

    if (isAllAllowed) {
      // No-op only if all tools in category already have this mode as default
      if (catTools.every((t) => getDefaultMode(t.id) === mode)) return
      const all = materializeAll()
      if (mode === 'disabled') {
        onChange(all.filter((t) => !catIds.has(t.name)))
      } else {
        onChange(all.map((t) => (catIds.has(t.name) ? { ...t, mode } : t)))
      }
      return
    }
    const filtered = value.filter((t) => !catIds.has(t.name))
    if (mode !== 'disabled') {
      catTools.forEach((t) => filtered.push({ name: t.id, category, mode }))
    }
    onChange(filtered)
  }

  // Summary
  const defaultHitlCount = confirmByDefaultSet.size
  const allowedCount = isAllAllowed
    ? registryTools.length - defaultHitlCount
    : value.filter((t) => (t.mode ?? 'allowed') === 'allowed').length
  const hitlCount = isAllAllowed
    ? defaultHitlCount
    : value.filter((t) => (t.mode ?? 'allowed') === 'hitl').length
  const summary = hitlCount > 0
    ? `${allowedCount} allowed · ${hitlCount} HITL`
    : `${allowedCount} allowed`

  const MODES: ToolMode[] = ['disabled', 'allowed', 'hitl']
  const MODE_LABELS: Record<ToolMode, string> = {
    disabled: 'Off',
    allowed: 'On',
    hitl: 'HITL',
  }

  return (
    <AccordionSection
      title="Tools"
      summary={summary}
      icon={Wrench}
      isEditing={isEditing}
      expanded={expanded}
      onToggle={onToggle}
    >
      {isEditing ? (
        <div className="space-y-3 text-sm">
          {registryTools.length === 0 ? (
            <div className="py-2 text-xs text-muted-foreground">
              {toolsLoaded ? 'No tools registered. Sync tools in Settings.' : 'Loading tools...'}
            </div>
          ) : (
            Array.from(grouped.entries()).map(([category, catTools]) => (
              <div key={category} className="space-y-1.5">
                {/* Category header */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {category}
                  </span>
                  <div className="flex gap-1">
                    {MODES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCategoryMode(category, m)}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                        title={`Set all ${category} to ${MODE_LABELS[m]}`}
                      >
                        All {MODE_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Individual tools */}
                {catTools.map((tool) => {
                  const mode = getMode(tool.id)
                  return (
                    <div
                      key={tool.id}
                      className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-muted/30"
                    >
                      <span className="text-xs text-foreground/80" title={tool.id}>
                        {tool.display_name || tool.id}
                      </span>
                      <div className="flex rounded-md border border-border/25 overflow-hidden">
                        {MODES.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() =>
                              setToolMode(tool.id, tool.category, m)
                            }
                            className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                              mode === m
                                ? m === 'hitl'
                                  ? 'bg-yellow-500/20 text-yellow-300'
                                  : m === 'allowed'
                                    ? 'bg-accent/25 text-accent'
                                    : 'bg-muted/50 text-muted-foreground'
                                : 'text-muted-foreground/70 hover:text-muted-foreground'
                            }`}
                          >
                            {MODE_LABELS[m]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2 text-xs text-muted-foreground">
          {isAllAllowed ? (
            <div>{defaultHitlCount > 0
              ? `All accessible · ${registryTools.length - defaultHitlCount} allowed · ${defaultHitlCount} HITL`
              : 'All tools allowed'}</div>
          ) : (
            (() => {
              // Build a registry lookup for proper category
              const registryLookup = new Map<string, RegistryTool>()
              registryTools.forEach((t) => registryLookup.set(t.id, t))

              // Group value tools by their registry category (or fallback)
              const byCategory = new Map<string, { tool: ToolConfig; display: string; category: string }[]>()
              value.forEach((t) => {
                const reg = registryLookup.get(t.name)
                const cat = reg?.category ?? t.category ?? 'other'
                const display = reg?.display_name ?? t.name
                const list = byCategory.get(cat) ?? []
                list.push({ tool: t, display, category: cat })
                byCategory.set(cat, list)
              })

              return Array.from(byCategory.entries()).map(([category, items]) => (
                <div key={category} className="space-y-1">
                  <div className="font-semibold text-foreground/80 uppercase text-[10px] tracking-wider">
                    {category}
                  </div>
                  {items.map(({ tool, display }) => (
                    <div key={tool.name} className="flex items-center justify-between rounded-md px-2 py-1 bg-muted/20">
                      <span className="text-xs text-foreground/80">{display}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        (tool.mode ?? 'allowed') === 'hitl'
                          ? 'bg-yellow-500/15 text-yellow-400'
                          : 'bg-accent/15 text-accent'
                      }`}>
                        {(tool.mode ?? 'allowed') === 'hitl' ? 'HITL' : 'On'}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            })()
          )}
        </div>
      )}
    </AccordionSection>
  )
}
