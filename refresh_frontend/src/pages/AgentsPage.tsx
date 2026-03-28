import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Plus, Search, Tag, Wrench } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/cn'
import { listAgents } from '@/lib/api'
import { agentsRoute, agentCreateRoute } from '@/lib/routes'
import type { AgentDefinition } from '@/types/agents'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'

function SkeletonRow() {
  return (
    <tr className="border-b border-border/50">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-4 animate-pulse rounded bg-bg-sunken" style={{ width: `${50 + i * 15}%` }} />
        </td>
      ))}
    </tr>
  )
}

function AgentRow({ agent, index }: { agent: AgentDefinition; index: number }) {
  const navigate = useNavigate()

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      onClick={() => navigate(agentsRoute(agent.id))}
      className={cn(
        'group cursor-pointer border-b border-border/50',
        'transition-colors hover:bg-primary-50/40 dark:hover:bg-primary-900/10',
      )}
    >
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <span className="font-label text-sm font-medium text-fg group-hover:text-primary transition-colors">
            {agent.name}
          </span>
        </div>
      </td>
      <td className="px-4 py-3.5 max-w-xs">
        <span className="text-sm text-fg-muted truncate block">
          {agent.description ? (agent.description.length > 80 ? agent.description.slice(0, 80) + '...' : agent.description) : '\u2014'}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex flex-wrap gap-1">
          {agent.tags.length === 0 && <span className="text-xs text-fg-subtle">\u2014</span>}
          {agent.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-medium text-secondary"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
          {agent.tags.length > 3 && (
            <span className="text-xs text-fg-subtle">+{agent.tags.length - 3}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 text-sm text-fg-muted">
          <Wrench className="h-3.5 w-3.5" />
          <span>{agent.tools_config.length}</span>
        </div>
      </td>
      <td className="px-4 py-3.5 text-sm text-fg-muted">
        {formatDistanceToNow(new Date(agent.updated_at), { addSuffix: true })}
      </td>
    </motion.tr>
  )
}

export default function AgentsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => listAgents({ limit: 200 }),
  })

  const agents = data?.agents ?? []
  const filtered = search
    ? agents.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.slug.toLowerCase().includes(search.toLowerCase()) ||
          a.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())),
      )
    : agents

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader title="Agents" description="Define reusable agent configurations with LLM settings, tools, and prompts.">
        <button
          onClick={() => navigate(agentCreateRoute())}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
            'text-sm font-medium text-fg-on-primary',
            'hover:bg-primary-hover transition-colors focus-ring',
          )}
        >
          <Plus className="h-4 w-4" />
          Create Agent
        </button>
      </PageHeader>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents by name, slug, or tag..."
          className={cn(
            'w-full rounded-lg border border-border bg-bg-elevated py-2.5 pl-10 pr-4',
            'text-sm text-fg placeholder:text-fg-subtle',
            'transition-colors focus:border-primary focus:outline-none focus-ring',
          )}
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-bg-sunken/50">
              <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Name
              </th>
              <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Description
              </th>
              <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Tags
              </th>
              <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Tools
              </th>
              <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                Last Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon={Bot}
                    title={search ? 'No matching agents' : 'No agents yet'}
                    description={
                      search
                        ? 'Try adjusting your search query.'
                        : 'Create your first agent to get started.'
                    }
                    action={
                      !search ? (
                        <button
                          onClick={() => navigate(agentCreateRoute())}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
                            'text-sm font-medium text-fg-on-primary',
                            'hover:bg-primary-hover transition-colors focus-ring',
                          )}
                        >
                          <Plus className="h-4 w-4" />
                          Create Agent
                        </button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            )}
            <AnimatePresence>
              {!isLoading &&
                filtered.map((agent, i) => (
                  <AgentRow key={agent.id} agent={agent} index={i} />
                ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  )
}
