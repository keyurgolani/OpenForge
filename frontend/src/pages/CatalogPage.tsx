import { useState } from 'react'
import { BookOpen, Check, Copy, AlertTriangle, Star, Tag, ArrowRight } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import {
  useCatalogQuery,
  useCatalogReadinessQuery,
  useCloneProfileTemplate,
  useCloneMissionTemplate,
  useCloneWorkflowTemplate,
} from '@/features/catalog'
import type { CatalogItem, CatalogItemType } from '@/types/catalog'

type FilterTab = 'all' | CatalogItemType

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'profile', label: 'Profiles' },
  { key: 'workflow', label: 'Workflows' },
  { key: 'mission', label: 'Missions' },
]

const TYPE_COLORS: Record<CatalogItemType, string> = {
  profile: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
  workflow: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
  mission: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  intermediate: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  advanced: 'border-red-500/25 bg-red-500/10 text-red-300',
}

export default function CatalogPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [featuredOnly, setFeaturedOnly] = useState(false)
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null)

  const queryParams = {
    catalog_type: activeTab === 'all' ? undefined : activeTab,
    is_featured: featuredOnly || undefined,
  }

  const { data, isLoading, error } = useCatalogQuery(queryParams)
  const { data: readiness } = useCatalogReadinessQuery(
    selectedItem?.catalog_type,
    selectedItem?.id,
  )

  const cloneProfile = useCloneProfileTemplate()
  const cloneMission = useCloneMissionTemplate()
  const cloneWorkflow = useCloneWorkflowTemplate()

  const handleClone = (item: CatalogItem) => {
    switch (item.catalog_type) {
      case 'profile':
        cloneProfile.mutate({ templateId: item.id, data: {} })
        break
      case 'mission':
        cloneMission.mutate({ templateId: item.id, data: {} })
        break
      case 'workflow':
        cloneWorkflow.mutate({ templateId: item.id, data: {} })
        break
    }
  }

  const isCloning =
    cloneProfile.isPending || cloneMission.isPending || cloneWorkflow.isPending

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader
          title="Catalog"
          description="Browse and clone pre-built profiles, workflows, and missions."
        />
        <LoadingState label="Loading catalog..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader
          title="Catalog"
          description="Browse and clone pre-built profiles, workflows, and missions."
        />
        <ErrorState message="The catalog could not be loaded. Please try again." />
      </div>
    )
  }

  const items = data?.items ?? []

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Catalog"
        description="Browse and clone pre-built profiles, workflows, and missions to get started quickly."
      />

      {/* Filter controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Type tabs */}
        <div className="flex gap-1 rounded-xl border border-border/60 bg-card/35 p-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Featured toggle */}
        <button
          onClick={() => setFeaturedOnly((prev) => !prev)}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
            featuredOnly
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              : 'border-border/60 bg-card/35 text-muted-foreground hover:text-foreground'
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${featuredOnly ? 'fill-amber-400' : ''}`} />
          Featured
        </button>
      </div>

      {/* Catalog grid */}
      {items.length === 0 ? (
        <EmptyState
          title="No catalog items found"
          description={
            featuredOnly
              ? 'No featured items match the current filter. Try removing the featured filter.'
              : 'The catalog is empty. Items will appear here as templates are published.'
          }
          icon={<BookOpen className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <CatalogCard
              key={item.id}
              item={item}
              isSelected={selectedItem?.id === item.id}
              readiness={selectedItem?.id === item.id ? readiness : undefined}
              isCloning={isCloning}
              onSelect={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
              onClone={() => handleClone(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CatalogCard({
  item,
  isSelected,
  readiness,
  isCloning,
  onSelect,
  onClone,
}: {
  item: CatalogItem
  isSelected: boolean
  readiness?: { is_ready: boolean; missing_dependencies: string[]; warnings: string[] } | null
  isCloning: boolean
  onSelect: () => void
  onClone: () => void
}) {
  return (
    <article
      className={`rounded-2xl border bg-card/30 p-5 transition-colors ${
        isSelected ? 'border-accent/40 bg-card/45' : 'border-border/60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            {item.icon ? (
              <span className="text-lg flex-shrink-0">{item.icon}</span>
            ) : null}
            <h2 className="text-lg font-semibold text-foreground truncate">{item.name}</h2>
          </div>
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/75">
            {item.slug}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${TYPE_COLORS[item.catalog_type]}`}
          >
            {item.catalog_type}
          </span>
          {item.is_featured ? (
            <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground/90 line-clamp-2">
        {item.description || 'No description provided.'}
      </p>

      {/* Metadata row */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground/85">
        {item.difficulty_level ? (
          <span
            className={`rounded-full border px-2.5 py-1 ${
              DIFFICULTY_COLORS[item.difficulty_level] ?? 'border-border/60 bg-background/35'
            }`}
          >
            {item.difficulty_level}
          </span>
        ) : null}
        {item.setup_complexity ? (
          <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
            {item.setup_complexity} setup
          </span>
        ) : null}
        {item.autonomy_level ? (
          <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
            {item.autonomy_level}
          </span>
        ) : null}
      </div>

      {/* Tags */}
      {item.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/25 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
          {item.tags.length > 5 ? (
            <span className="text-[11px] text-muted-foreground/60">
              +{item.tags.length - 5} more
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Readiness warning (when expanded) */}
      {isSelected && readiness && !readiness.is_ready ? (
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Not ready to clone
          </div>
          {readiness.missing_dependencies.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {readiness.missing_dependencies.map((dep) => (
                <li key={dep} className="text-xs text-amber-300/80">
                  - {dep}
                </li>
              ))}
            </ul>
          ) : null}
          {readiness.warnings.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {readiness.warnings.map((warn) => (
                <li key={warn} className="text-xs text-muted-foreground/80">
                  {warn}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Actions */}
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onSelect}
          className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background/35 px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          {isSelected ? 'Hide Details' : 'View Details'}
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          onClick={onClone}
          disabled={isCloning}
          className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent transition hover:bg-accent/20 disabled:opacity-50"
        >
          {isCloning ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          Clone
        </button>
      </div>

      {/* Expanded details */}
      {isSelected ? (
        <div className="mt-4 space-y-3 border-t border-border/40 pt-4">
          {item.recommended_use_cases.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5">
                Recommended Use Cases
              </p>
              <ul className="space-y-1">
                {item.recommended_use_cases.map((uc) => (
                  <li key={uc} className="text-sm text-muted-foreground/90">
                    - {uc}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {item.expected_outputs.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5">
                Expected Outputs
              </p>
              <ul className="space-y-1">
                {item.expected_outputs.map((out) => (
                  <li key={out} className="text-sm text-muted-foreground/90">
                    - {out}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {item.example_inputs.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5">
                Example Inputs
              </p>
              <ul className="space-y-1">
                {item.example_inputs.map((inp) => (
                  <li key={inp} className="text-sm text-muted-foreground/90">
                    - {inp}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
