import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Loader2, Package, Plus, Save, Search, Trash2, Wrench } from 'lucide-react'

import {
  listCapabilityBundles,
  getToolRegistry,
  createCapabilityBundle,
  updateCapabilityBundle,
  deleteCapabilityBundle,
} from '@/lib/api'
import type { ToolMeta } from '../types'
import { CATEGORY_ICONS, RISK_STYLES } from '../constants'

// ── Draft type ────────────────────────────────────────────────────────────────

type BundleDraft = {
  name: string
  slug: string
  description: string
  tools_enabled: boolean
  allowed_tool_categories: string[] | null
  blocked_tool_ids: string[]
  max_tool_calls_per_minute: number
  max_tool_calls_per_execution: number
  retrieval_enabled: boolean
  retrieval_limit: number
  retrieval_score_threshold: number
  knowledge_scope: string
}

const EMPTY_DRAFT: BundleDraft = {
  name: '',
  slug: '',
  description: '',
  tools_enabled: true,
  allowed_tool_categories: null,
  blocked_tool_ids: [],
  max_tool_calls_per_minute: 30,
  max_tool_calls_per_execution: 200,
  retrieval_enabled: true,
  retrieval_limit: 5,
  retrieval_score_threshold: 0.35,
  knowledge_scope: 'workspace',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function bundleFromApi(bundle: any): BundleDraft {
  return {
    name: bundle.name ?? '',
    slug: bundle.slug ?? '',
    description: bundle.description ?? '',
    tools_enabled: bundle.tools_enabled ?? true,
    allowed_tool_categories: bundle.allowed_tool_categories ?? null,
    blocked_tool_ids: bundle.blocked_tool_ids ?? [],
    max_tool_calls_per_minute: bundle.max_tool_calls_per_minute ?? 30,
    max_tool_calls_per_execution: bundle.max_tool_calls_per_execution ?? 200,
    retrieval_enabled: bundle.retrieval_enabled ?? true,
    retrieval_limit: bundle.retrieval_limit ?? 5,
    retrieval_score_threshold: bundle.retrieval_score_threshold ?? 0.35,
    knowledge_scope: bundle.knowledge_scope ?? 'workspace',
  }
}

// ── Toggle switch component ───────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        checked ? 'bg-accent' : 'bg-muted'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BundlesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<BundleDraft>({ ...EMPTY_DRAFT })
  const [blockedToolsOpen, setBlockedToolsOpen] = useState(false)

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: bundlesData, isLoading: bundlesLoading } = useQuery<{
    bundles: any[]
    total: number
  }>({
    queryKey: ['capability-bundles'],
    queryFn: listCapabilityBundles,
  })

  const { data: toolsData } = useQuery<{
    tools: ToolMeta[]
    tool_server_available: boolean
  }>({
    queryKey: ['tool-registry'],
    queryFn: getToolRegistry,
  })

  const bundles = bundlesData?.bundles ?? []
  const tools = toolsData?.tools ?? []

  const filteredBundles = useMemo(() => {
    if (!search.trim()) return bundles
    const term = search.toLowerCase()
    return bundles.filter((bundle) => {
      const haystack = `${bundle.name} ${bundle.slug} ${bundle.description ?? ''}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [bundles, search])

  const selectedBundle = useMemo(
    () => bundles.find((b) => b.id === selectedId) ?? null,
    [bundles, selectedId],
  )


  // ── Derive categories from tools ──────────────────────────────────────────

  const allCategories = useMemo(() => {
    const categories = new Set<string>()
    for (const tool of tools) {
      if (tool.category) categories.add(tool.category)
    }
    return Array.from(categories).sort()
  }, [tools])

  // ── Visible tools for blocked-tools section ───────────────────────────────

  const visibleTools = useMemo(() => {
    if (draft.allowed_tool_categories === null) return tools
    const allowed = new Set(draft.allowed_tool_categories)
    return tools.filter((tool) => allowed.has(tool.category))
  }, [tools, draft.allowed_tool_categories])

  const toolsByCategory = useMemo(() => {
    const grouped: Record<string, ToolMeta[]> = {}
    for (const tool of visibleTools) {
      if (!grouped[tool.category]) grouped[tool.category] = []
      grouped[tool.category].push(tool)
    }
    return grouped
  }, [visibleTools])

  // ── Sync draft when selected bundle changes ───────────────────────────────

  useEffect(() => {
    if (creating) return
    if (selectedBundle) {
      setDraft(bundleFromApi(selectedBundle))
      setBlockedToolsOpen(false)
    }
  }, [selectedBundle?.id, creating])

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: draft.name,
        slug: draft.slug,
        description: draft.description,
        tools_enabled: draft.tools_enabled,
        allowed_tool_categories: draft.allowed_tool_categories,
        blocked_tool_ids: draft.blocked_tool_ids,
        max_tool_calls_per_minute: draft.max_tool_calls_per_minute,
        max_tool_calls_per_execution: draft.max_tool_calls_per_execution,
        retrieval_enabled: draft.retrieval_enabled,
        retrieval_limit: draft.retrieval_limit,
        retrieval_score_threshold: draft.retrieval_score_threshold,
        knowledge_scope: draft.knowledge_scope,
      }
      if (creating) {
        return createCapabilityBundle(payload)
      }
      if (!selectedId) throw new Error('No bundle selected')
      return updateCapabilityBundle(selectedId, payload)
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ['capability-bundles'] })
      if (creating && result?.id) {
        setSelectedId(result.id)
        setCreating(false)
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('No bundle selected')
      return deleteCapabilityBundle(selectedId)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['capability-bundles'] })
      setSelectedId(null)
      setCreating(false)
      setDraft({ ...EMPTY_DRAFT })
    },
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleNewBundle() {
    setCreating(true)
    setSelectedId(null)
    setDraft({ ...EMPTY_DRAFT })
    setBlockedToolsOpen(false)
  }

  function handleSelectBundle(id: string) {
    setCreating(false)
    setSelectedId(id)
  }

  function updateDraft(patch: Partial<BundleDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  function handleNameChange(name: string) {
    if (creating) {
      updateDraft({ name, slug: slugify(name) })
    } else {
      updateDraft({ name })
    }
  }

  function toggleCategory(category: string) {
    setDraft((prev) => {
      const current = prev.allowed_tool_categories
      if (current === null) {
        // switching from "all" to specific, start with just this category
        return { ...prev, allowed_tool_categories: [category] }
      }
      const set = new Set(current)
      if (set.has(category)) {
        set.delete(category)
      } else {
        set.add(category)
      }
      // Clean up blocked_tool_ids: remove any tools from now-excluded categories
      const newBlocked = prev.blocked_tool_ids.filter((toolId) => {
        const tool = tools.find((t) => t.id === toolId)
        return tool ? set.has(tool.category) : false
      })
      return {
        ...prev,
        allowed_tool_categories: Array.from(set),
        blocked_tool_ids: newBlocked,
      }
    })
  }

  function toggleAllCategories() {
    setDraft((prev) => ({
      ...prev,
      allowed_tool_categories: prev.allowed_tool_categories === null ? [] : null,
    }))
  }

  function toggleBlockedTool(toolId: string) {
    setDraft((prev) => {
      const set = new Set(prev.blocked_tool_ids)
      if (set.has(toolId)) {
        set.delete(toolId)
      } else {
        set.add(toolId)
      }
      return { ...prev, blocked_tool_ids: Array.from(set) }
    })
  }

  // ── Determine whether to show the right panel ────────────────────────────

  const showEditor = creating || selectedId !== null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <div className="space-y-5">
        {/* Header card */}
        <div className="glass-card rounded-2xl border-accent/20 bg-accent/5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
              <Package className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">Capability Bundles</h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Create and manage reusable capability bundles that define tool access, retrieval
                settings, and rate limits for agent profiles.
              </p>
            </div>
          </div>
        </div>

        {/* Main grid layout */}
        <div className="grid gap-5 xl:grid-cols-[320px,minmax(0,1fr)] h-[calc(100vh-220px)]">
          {/* ── Left panel ──────────────────────────────────────────────────── */}
          <section className="space-y-3 overflow-y-auto">
            {/* Create button */}
            <button
              type="button"
              className="btn-primary w-full justify-center gap-2 text-sm"
              onClick={handleNewBundle}
            >
              <Plus className="h-4 w-4" />
              New Bundle
            </button>

            {/* Search */}
            <div className="glass-card rounded-2xl p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="input pl-9 text-sm"
                  placeholder="Search bundles..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Bundle list */}
              <div className="mt-4 max-h-[calc(100vh-380px)] space-y-2 overflow-y-auto">
                {bundlesLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}

                {!bundlesLoading && filteredBundles.length === 0 && (
                  <div className="rounded-xl border border-border/40 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground">
                    No bundles matched this search.
                  </div>
                )}

                {filteredBundles.map((bundle) => {
                  const active = !creating && bundle.id === selectedId
                  return (
                    <button
                      key={bundle.id}
                      type="button"
                      onClick={() => handleSelectBundle(bundle.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                        active
                          ? 'border-accent/35 bg-accent/10'
                          : 'border-border/40 bg-background/20 hover:border-border/70 hover:bg-background/35'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {bundle.name}
                          </p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {bundle.slug}
                          </p>
                        </div>
                        {bundle.is_system && (
                          <span className="shrink-0 rounded-full border border-border/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            System
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                        <span
                          className={`rounded-full px-2 py-0.5 ${
                            bundle.tools_enabled
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-muted/40 text-muted-foreground'
                          }`}
                        >
                          Tools
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 ${
                            bundle.retrieval_enabled
                              ? 'bg-blue-500/15 text-blue-400'
                              : 'bg-muted/40 text-muted-foreground'
                          }`}
                        >
                          Retrieval
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          {/* ── Right panel ─────────────────────────────────────────────────── */}
          <section className="overflow-y-auto space-y-5">
            {!showEditor && (
              <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
                Select a bundle to view its configuration, or create a new one.
              </div>
            )}

            {showEditor && (
              <>
                {/* Identity section */}
                <div className="glass-card rounded-2xl p-5">
                  <h3 className="mb-4 text-sm font-semibold text-foreground">Identity</h3>
                  <div className="space-y-4">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Name
                      <input
                        className="input mt-1 text-sm"
                        value={draft.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="My Capability Bundle"

                      />
                    </label>
                    <label className="block text-xs font-medium text-muted-foreground">
                      Slug
                      <input
                        className="input mt-1 font-mono text-sm"
                        value={draft.slug}
                        onChange={(e) => updateDraft({ slug: e.target.value })}
                        placeholder="my-capability-bundle"

                      />
                    </label>
                    <label className="block text-xs font-medium text-muted-foreground">
                      Description
                      <textarea
                        className="mt-1 w-full rounded-xl border border-border/50 bg-background/20 px-3 py-3 text-sm text-foreground"
                        rows={3}
                        value={draft.description}
                        onChange={(e) => updateDraft({ description: e.target.value })}
                        placeholder="Describe what this bundle provides..."

                      />
                    </label>
                  </div>
                </div>

                {/* Tool Capabilities section */}
                <div className="glass-card rounded-2xl p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-accent" />
                      <h3 className="text-sm font-semibold text-foreground">Tool Capabilities</h3>
                    </div>
                    <Toggle
                      checked={draft.tools_enabled}
                      onChange={(value) => updateDraft({ tools_enabled: value })}
                    />
                  </div>

                  {draft.tools_enabled && (
                    <div className="space-y-5">
                      {/* Tool Categories */}
                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">
                            Tool Categories
                          </p>
                          <button
                            type="button"
                            onClick={toggleAllCategories}
    
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              draft.allowed_tool_categories === null
                                ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                : 'text-muted-foreground hover:bg-muted/40'
                            }`}
                          >
                            All Categories
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                          {allCategories.map((category) => {
                            const isSelected =
                              draft.allowed_tool_categories === null ||
                              draft.allowed_tool_categories.includes(category)
                            return (
                              <button
                                key={category}
                                type="button"
                                onClick={() => toggleCategory(category)}
                                disabled={
                                  draft.allowed_tool_categories === null
                                }
                                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                                  isSelected
                                    ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                    : 'text-muted-foreground hover:bg-muted/40'
                                } ${
                                  draft.allowed_tool_categories === null
                                    ? 'cursor-not-allowed opacity-50'
                                    : ''
                                }`}
                              >
                                {CATEGORY_ICONS[category] ?? (
                                  <Wrench className="h-4 w-4" />
                                )}
                                <span className="capitalize">{category}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Blocked Tools */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setBlockedToolsOpen(!blockedToolsOpen)}
                          className="flex w-full items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          {blockedToolsOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          Blocked Tools ({draft.blocked_tool_ids.length})
                        </button>

                        {blockedToolsOpen && (
                          <div className="mt-3 max-h-80 space-y-4 overflow-y-auto rounded-xl border border-border/40 bg-background/20 p-3">
                            {Object.keys(toolsByCategory).length === 0 && (
                              <p className="py-4 text-center text-xs text-muted-foreground">
                                No tools available.
                              </p>
                            )}

                            {Object.entries(toolsByCategory)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([category, categoryTools]) => (
                                <div key={category}>
                                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                    {CATEGORY_ICONS[category] ?? (
                                      <Wrench className="h-3.5 w-3.5" />
                                    )}
                                    <span className="capitalize">{category}</span>
                                  </div>
                                  <div className="space-y-1.5 pl-6">
                                    {categoryTools
                                      .sort((a, b) =>
                                        a.display_name.localeCompare(b.display_name),
                                      )
                                      .map((tool) => {
                                        const isBlocked = draft.blocked_tool_ids.includes(
                                          tool.id,
                                        )
                                        const riskStyle =
                                          RISK_STYLES[tool.risk_level] ?? RISK_STYLES.low
                                        return (
                                          <label
                                            key={tool.id}
                                            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-muted/20"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isBlocked}
                                              onChange={() => toggleBlockedTool(tool.id)}
                      
                                              className="h-3.5 w-3.5 rounded border-border/50 accent-accent"
                                            />
                                            <span className="font-medium text-foreground">
                                              {tool.display_name}
                                            </span>
                                            <span className="font-mono text-[10px] text-muted-foreground">
                                              {tool.id}
                                            </span>
                                            <span
                                              className={`ml-auto rounded-full border px-1.5 py-0.5 text-[10px] ${riskStyle}`}
                                            >
                                              {tool.risk_level}
                                            </span>
                                          </label>
                                        )
                                      })}
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>

                      {/* Rate Limits */}
                      <div>
                        <p className="mb-3 text-xs font-medium text-muted-foreground">
                          Rate Limits
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <label className="block text-xs font-medium text-muted-foreground">
                            Max calls per minute
                            <input
                              type="number"
                              className="input mt-1 text-sm"
                              min={1}
                              value={draft.max_tool_calls_per_minute}
                              onChange={(e) =>
                                updateDraft({
                                  max_tool_calls_per_minute:
                                    parseInt(e.target.value, 10) || 1,
                                })
                              }
      
                            />
                          </label>
                          <label className="block text-xs font-medium text-muted-foreground">
                            Max calls per execution
                            <input
                              type="number"
                              className="input mt-1 text-sm"
                              min={1}
                              value={draft.max_tool_calls_per_execution}
                              onChange={(e) =>
                                updateDraft({
                                  max_tool_calls_per_execution:
                                    parseInt(e.target.value, 10) || 1,
                                })
                              }
      
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Retrieval Capabilities section */}
                <div className="glass-card rounded-2xl p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">
                      Retrieval Capabilities
                    </h3>
                    <Toggle
                      checked={draft.retrieval_enabled}
                      onChange={(value) => updateDraft({ retrieval_enabled: value })}
                    />
                  </div>

                  {draft.retrieval_enabled && (
                    <div className="space-y-4">
                      <label className="block text-xs font-medium text-muted-foreground">
                        Result limit
                        <input
                          type="number"
                          className="input mt-1 text-sm"
                          min={1}
                          max={100}
                          value={draft.retrieval_limit}
                          onChange={(e) =>
                            updateDraft({
                              retrieval_limit: Math.min(
                                100,
                                Math.max(1, parseInt(e.target.value, 10) || 1),
                              ),
                            })
                          }
  
                        />
                      </label>

                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-muted-foreground">
                            Score threshold
                          </label>
                          <span className="text-xs font-mono text-foreground">
                            {draft.retrieval_score_threshold.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          className="mt-1 w-full accent-accent"
                          min={0}
                          max={1}
                          step={0.05}
                          value={draft.retrieval_score_threshold}
                          onChange={(e) =>
                            updateDraft({
                              retrieval_score_threshold: parseFloat(e.target.value),
                            })
                          }
  
                        />
                      </div>

                      <label className="block text-xs font-medium text-muted-foreground">
                        Knowledge scope
                        <select
                          className="input mt-1 text-sm"
                          value={draft.knowledge_scope}
                          onChange={(e) =>
                            updateDraft({ knowledge_scope: e.target.value })
                          }
  
                        >
                          <option value="workspace">Workspace</option>
                          <option value="global">Global</option>
                          <option value="organization">Organization</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>

                {/* Actions bar */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/30 bg-background/30 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="btn-primary gap-2 text-xs"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending || !draft.name.trim()}
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {creating ? 'Create Bundle' : 'Save Changes'}
                    </button>

                    {saveMutation.isError && (
                      <p className="text-xs text-red-400">
                        {(saveMutation.error as Error)?.message ?? 'Failed to save'}
                      </p>
                    )}
                  </div>

                  {!creating && selectedId && (
                    <button
                      type="button"
                      className="btn-ghost gap-2 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
