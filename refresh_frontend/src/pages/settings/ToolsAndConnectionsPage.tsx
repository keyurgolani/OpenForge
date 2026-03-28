import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Wrench,
  Server,
  Sparkles,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Download,
  X,
  Loader2,
  AlertCircle,
  Shield,
  ShieldAlert,
  ShieldOff,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  getToolRegistry,
  listToolPermissions,
  setToolPermission,
  listMCPServers,
  createMCPServer,
  updateMCPServer,
  deleteMCPServer,
  discoverMCPServer,
  listInstalledSkills,
  installSkill,
  searchSkills,
  removeSkill,
} from '@/lib/api'
import { useToast } from '@/components/shared/ToastProvider'
import ConfirmModal from '@/components/shared/ConfirmModal'
import EmptyState from '@/components/shared/EmptyState'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ToolEntry {
  tool_id: string
  name: string
  category?: string
  description?: string
}

interface ToolPermissionEntry {
  tool_id: string
  permission: 'allowed' | 'hitl' | 'blocked'
}

interface MCPServer {
  id: string
  name: string
  url?: string
  transport_type?: string
  command?: string
  status?: string
}

interface SkillEntry {
  name: string
  description?: string
  source?: string
  installed?: boolean
}

/* -------------------------------------------------------------------------- */
/* Tools Tab                                                                  */
/* -------------------------------------------------------------------------- */

function ToolsTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [search, setSearch] = useState('')

  const registryQuery = useQuery({
    queryKey: ['tool-registry'],
    queryFn: getToolRegistry,
  })

  const permissionsQuery = useQuery({
    queryKey: ['tool-permissions'],
    queryFn: listToolPermissions,
  })

  const setPermMut = useMutation({
    mutationFn: ({ toolId, permission }: { toolId: string; permission: string }) =>
      setToolPermission(toolId, permission),
    onSuccess: () => {
      toast.success('Permission updated')
      queryClient.invalidateQueries({ queryKey: ['tool-permissions'] })
    },
    onError: (err: any) => toast.error('Failed', err?.response?.data?.detail ?? err.message),
  })

  const tools: ToolEntry[] = useMemo(() => {
    const data = registryQuery.data
    if (!data) return []
    if (Array.isArray(data)) return data
    if (data.tools && Array.isArray(data.tools)) return data.tools
    // Handle category-grouped format
    const result: ToolEntry[] = []
    for (const [category, categoryTools] of Object.entries(data)) {
      if (Array.isArray(categoryTools)) {
        for (const tool of categoryTools as any[]) {
          result.push({
            tool_id: tool.tool_id ?? tool.name ?? tool.id,
            name: tool.name ?? tool.tool_id ?? tool.id,
            category,
            description: tool.description,
          })
        }
      }
    }
    return result
  }, [registryQuery.data])

  const permissions: ToolPermissionEntry[] = permissionsQuery.data ?? []
  const permMap = new Map(permissions.map((p) => [p.tool_id, p.permission]))

  const filteredTools = search
    ? tools.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.category?.toLowerCase().includes(search.toLowerCase()),
      )
    : tools

  const permissionIcon = (perm: string) => {
    switch (perm) {
      case 'allowed':
        return <Shield className="h-3 w-3 text-success" />
      case 'hitl':
        return <ShieldAlert className="h-3 w-3 text-warning" />
      case 'blocked':
        return <ShieldOff className="h-3 w-3 text-danger" />
      default:
        return <Shield className="h-3 w-3 text-fg-subtle" />
    }
  }

  if (registryQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-bg-sunken" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tools..."
          className={cn(
            'w-full rounded-lg border border-border bg-bg-elevated py-2.5 pl-10 pr-4',
            'text-sm text-fg placeholder:text-fg-subtle',
            'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
          )}
        />
      </div>

      {filteredTools.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No tools found"
          description={search ? 'Try a different search query.' : 'No tools registered yet.'}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-bg-sunken/50">
                <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                  Tool
                </th>
                <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                  Category
                </th>
                <th className="px-4 py-3 font-label text-xs font-medium uppercase tracking-wider text-fg-muted">
                  Permission
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTools.map((tool) => {
                const currentPerm = permMap.get(tool.tool_id) ?? 'allowed'
                return (
                  <tr key={tool.tool_id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-3.5 w-3.5 text-fg-subtle shrink-0" />
                        <span className="font-label text-sm font-medium text-fg">{tool.name}</span>
                      </div>
                      {tool.description && (
                        <p className="mt-0.5 text-xs text-fg-muted truncate max-w-xs pl-5.5">
                          {tool.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-label text-xs text-fg-muted">{tool.category ?? '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {permissionIcon(currentPerm)}
                        <select
                          value={currentPerm}
                          onChange={(e) =>
                            setPermMut.mutate({
                              toolId: tool.tool_id,
                              permission: e.target.value,
                            })
                          }
                          className={cn(
                            'rounded-md border border-border bg-bg px-2 py-1',
                            'font-label text-xs text-fg',
                            'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                          )}
                        >
                          <option value="allowed">Allowed</option>
                          <option value="hitl">Requires Approval</option>
                          <option value="blocked">Blocked</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* MCP Servers Tab                                                            */
/* -------------------------------------------------------------------------- */

function MCPServersTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MCPServer | null>(null)

  // Add form state
  const [serverName, setServerName] = useState('')
  const [serverUrl, setServerUrl] = useState('')
  const [transportType, setTransportType] = useState('sse')
  const [serverCommand, setServerCommand] = useState('')
  const [addError, setAddError] = useState('')

  const serversQuery = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: listMCPServers,
  })

  const servers: MCPServer[] = serversQuery.data?.servers ?? serversQuery.data ?? []

  const createMut = useMutation({
    mutationFn: () =>
      createMCPServer({
        name: serverName,
        url: serverUrl || undefined,
        transport_type: transportType,
        command: serverCommand || undefined,
      }),
    onSuccess: () => {
      toast.success('MCP server added')
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      setAddOpen(false)
      setServerName('')
      setServerUrl('')
      setServerCommand('')
      setAddError('')
    },
    onError: (err: any) => setAddError(err?.response?.data?.detail ?? err.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMCPServer(id),
    onSuccess: () => {
      toast.success('MCP server deleted')
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
    },
    onError: (err: any) => toast.error('Delete failed', err?.response?.data?.detail ?? err.message),
  })

  const discoverMut = useMutation({
    mutationFn: (id: string) => discoverMCPServer(id),
    onSuccess: () => {
      toast.success('Tools discovered')
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      queryClient.invalidateQueries({ queryKey: ['tool-registry'] })
    },
    onError: (err: any) => toast.error('Discover failed', err?.response?.data?.detail ?? err.message),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={() => setAddOpen(true)}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
            'text-sm font-medium text-fg-on-primary',
            'hover:bg-primary-hover transition-colors',
          )}
        >
          <Plus className="h-4 w-4" />
          Add Server
        </button>
      </div>

      {serversQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-bg-sunken" />
          ))}
        </div>
      )}

      {!serversQuery.isLoading && servers.length === 0 && (
        <EmptyState
          icon={Server}
          title="No MCP servers"
          description="Add an MCP server to extend your agent's tool capabilities."
        />
      )}

      {!serversQuery.isLoading && servers.length > 0 && (
        <div className="space-y-3">
          <AnimatePresence>
            {servers.map((server, i) => (
              <motion.div
                key={server.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
                className="flex items-center gap-4 rounded-lg border border-border/40 bg-bg-elevated p-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10">
                  <Server className="h-5 w-5 text-secondary" />
                </div>

                <div className="min-w-0 flex-1">
                  <h4 className="font-label text-sm font-medium text-fg">{server.name}</h4>
                  {server.url && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted">
                      <ExternalLink className="h-2.5 w-2.5" />
                      <span className="font-mono truncate">{server.url}</span>
                    </p>
                  )}
                  {server.transport_type && (
                    <span className="mt-1 inline-block rounded-full bg-bg-sunken px-2 py-0.5 text-[10px] font-medium text-fg-subtle">
                      {server.transport_type}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => discoverMut.mutate(server.id)}
                    disabled={discoverMut.isPending}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5',
                      'text-xs font-medium text-fg',
                      'hover:bg-bg-sunken disabled:opacity-50 transition-colors',
                    )}
                  >
                    {discoverMut.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Discover
                  </button>
                  <button
                    onClick={() => setDeleteTarget(server)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5',
                      'text-xs font-medium text-fg-muted',
                      'hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition-colors',
                    )}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add Server Dialog */}
      <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
        <AnimatePresence>
          {addOpen && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild>
                <motion.div
                  className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              </Dialog.Overlay>
              <Dialog.Content asChild>
                <motion.div
                  className={cn(
                    'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
                    'rounded-xl border border-border bg-bg-elevated p-6 shadow-2xl focus:outline-none',
                  )}
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <Dialog.Title className="font-display text-lg font-semibold text-fg">
                      Add MCP Server
                    </Dialog.Title>
                    <Dialog.Close className="rounded-md p-1 text-fg-subtle hover:text-fg hover:bg-bg-sunken transition-colors">
                      <X className="h-4 w-4" />
                    </Dialog.Close>
                  </div>

                  {addError && (
                    <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
                      <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
                      <p className="text-sm text-danger">{addError}</p>
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (!serverName.trim()) { setAddError('Name is required'); return }
                      createMut.mutate()
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <label className="font-label text-sm font-medium text-fg">Server Name</label>
                      <input
                        type="text"
                        value={serverName}
                        onChange={(e) => setServerName(e.target.value)}
                        placeholder="My MCP Server"
                        className={cn(
                          'w-full rounded-lg border border-border bg-bg py-2.5 px-3',
                          'font-body text-sm text-fg placeholder:text-fg-subtle',
                          'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="font-label text-sm font-medium text-fg">Transport</label>
                      <select
                        value={transportType}
                        onChange={(e) => setTransportType(e.target.value)}
                        className={cn(
                          'w-full rounded-lg border border-border bg-bg py-2.5 px-3',
                          'font-body text-sm text-fg',
                          'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                        )}
                      >
                        <option value="sse">SSE</option>
                        <option value="stdio">Stdio</option>
                        <option value="streamable_http">Streamable HTTP</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="font-label text-sm font-medium text-fg">URL</label>
                      <input
                        type="text"
                        value={serverUrl}
                        onChange={(e) => setServerUrl(e.target.value)}
                        placeholder="http://localhost:8080/sse"
                        className={cn(
                          'w-full rounded-lg border border-border bg-bg py-2.5 px-3',
                          'font-mono text-sm text-fg placeholder:text-fg-subtle',
                          'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                        )}
                      />
                    </div>

                    {transportType === 'stdio' && (
                      <div className="space-y-2">
                        <label className="font-label text-sm font-medium text-fg">Command</label>
                        <input
                          type="text"
                          value={serverCommand}
                          onChange={(e) => setServerCommand(e.target.value)}
                          placeholder="npx -y @modelcontextprotocol/server"
                          className={cn(
                            'w-full rounded-lg border border-border bg-bg py-2.5 px-3',
                            'font-mono text-sm text-fg placeholder:text-fg-subtle',
                            'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                          )}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <Dialog.Close className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-bg-sunken transition-colors">
                        Cancel
                      </Dialog.Close>
                      <button
                        type="submit"
                        disabled={createMut.isPending}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
                          'text-sm font-medium text-fg-on-primary',
                          'hover:bg-primary-hover disabled:opacity-50 transition-colors',
                        )}
                      >
                        {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Add Server
                      </button>
                    </div>
                  </form>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>

      {/* Delete confirmation */}
      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete MCP Server"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? All discovered tools from this server will be removed.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteMut.mutate(deleteTarget.id)
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Skills Tab                                                                 */
/* -------------------------------------------------------------------------- */

function SkillsTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [installSource, setInstallSource] = useState('')
  const [searchSource, setSearchSource] = useState('')
  const [searchResults, setSearchResults] = useState<SkillEntry[]>([])
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const skillsQuery = useQuery({
    queryKey: ['installed-skills'],
    queryFn: listInstalledSkills,
  })

  const skills: SkillEntry[] = skillsQuery.data?.skills ?? skillsQuery.data ?? []

  const installMut = useMutation({
    mutationFn: (source: string) => installSkill(source),
    onSuccess: () => {
      toast.success('Skill installed')
      queryClient.invalidateQueries({ queryKey: ['installed-skills'] })
      setInstallSource('')
    },
    onError: (err: any) => toast.error('Install failed', err?.response?.data?.detail ?? err.message),
  })

  const searchMut = useMutation({
    mutationFn: (source: string) => searchSkills(source),
    onSuccess: (data) => {
      setSearchResults(data?.skills ?? data ?? [])
    },
    onError: (err: any) => toast.error('Search failed', err?.response?.data?.detail ?? err.message),
  })

  const removeMut = useMutation({
    mutationFn: (name: string) => removeSkill(name),
    onSuccess: () => {
      toast.success('Skill removed')
      queryClient.invalidateQueries({ queryKey: ['installed-skills'] })
    },
    onError: (err: any) => toast.error('Remove failed', err?.response?.data?.detail ?? err.message),
  })

  return (
    <div className="space-y-6">
      {/* Install section */}
      <div className="rounded-lg border border-border/40 bg-bg-elevated p-4 space-y-3">
        <h4 className="font-label text-sm font-medium text-fg">Install Skill</h4>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={installSource}
            onChange={(e) => setInstallSource(e.target.value)}
            placeholder="GitHub URL or skill source..."
            className={cn(
              'flex-1 rounded-lg border border-border bg-bg py-2 px-3',
              'font-mono text-sm text-fg placeholder:text-fg-subtle',
              'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
            )}
          />
          <button
            onClick={() => installMut.mutate(installSource)}
            disabled={installMut.isPending || !installSource.trim()}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
              'text-sm font-medium text-fg-on-primary',
              'hover:bg-primary-hover disabled:opacity-50 transition-colors',
            )}
          >
            {installMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Install
          </button>
        </div>
      </div>

      {/* Search section */}
      <div className="rounded-lg border border-border/40 bg-bg-elevated p-4 space-y-3">
        <h4 className="font-label text-sm font-medium text-fg">Search Skills</h4>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchSource}
            onChange={(e) => setSearchSource(e.target.value)}
            placeholder="Search skill repository..."
            className={cn(
              'flex-1 rounded-lg border border-border bg-bg py-2 px-3',
              'font-body text-sm text-fg placeholder:text-fg-subtle',
              'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
            )}
          />
          <button
            onClick={() => searchMut.mutate(searchSource)}
            disabled={searchMut.isPending || !searchSource.trim()}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2',
              'text-sm font-medium text-fg',
              'hover:bg-bg-sunken disabled:opacity-50 transition-colors',
            )}
          >
            {searchMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="space-y-2 mt-3">
            {searchResults.map((skill) => (
              <div
                key={skill.name}
                className="flex items-center justify-between rounded-lg border border-border/30 bg-bg-sunken/30 p-3"
              >
                <div>
                  <p className="font-label text-sm font-medium text-fg">{skill.name}</p>
                  {skill.description && (
                    <p className="text-xs text-fg-muted">{skill.description}</p>
                  )}
                </div>
                <button
                  onClick={() => installMut.mutate(skill.source ?? skill.name)}
                  disabled={installMut.isPending}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5',
                    'text-xs font-medium text-fg-on-primary',
                    'hover:bg-primary-hover disabled:opacity-50 transition-colors',
                  )}
                >
                  <Download className="h-3 w-3" />
                  Install
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Installed list */}
      <div>
        <h4 className="font-label text-sm font-medium text-fg mb-3">Installed Skills</h4>

        {skillsQuery.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-bg-sunken" />
            ))}
          </div>
        )}

        {!skillsQuery.isLoading && skills.length === 0 && (
          <EmptyState
            icon={Sparkles}
            title="No skills installed"
            description="Install skills from a source to extend agent capabilities."
          />
        )}

        {!skillsQuery.isLoading && skills.length > 0 && (
          <div className="space-y-2">
            <AnimatePresence>
              {skills.map((skill, i) => (
                <motion.div
                  key={skill.name}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-bg-elevated p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-label text-sm font-medium text-fg">{skill.name}</p>
                      {skill.description && (
                        <p className="text-xs text-fg-muted">{skill.description}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(skill.name)}
                    className={cn(
                      'rounded-md p-1.5 text-fg-subtle',
                      'hover:text-danger hover:bg-danger/10 transition-colors',
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Remove Skill"
        description={`Are you sure you want to remove "${deleteTarget}"?`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) removeMut.mutate(deleteTarget)
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

const TABS = ['Tools', 'MCP Servers', 'Skills'] as const
type Tab = (typeof TABS)[number]

const TAB_ICONS: Record<Tab, typeof Wrench> = {
  Tools: Wrench,
  'MCP Servers': Server,
  Skills: Sparkles,
}

export default function ToolsAndConnectionsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Tools')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-fg">Tools & Connections</h2>
        <p className="text-sm text-fg-muted">
          Manage tool permissions, MCP server connections, and installed skills
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-lg bg-bg-sunken p-0.5">
        {TABS.map((tab) => {
          const Icon = TAB_ICONS[tab]
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-4 py-2 font-label text-xs font-medium transition-colors',
                activeTab === tab
                  ? 'bg-bg-elevated text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'Tools' && <ToolsTab />}
      {activeTab === 'MCP Servers' && <MCPServersTab />}
      {activeTab === 'Skills' && <SkillsTab />}
    </div>
  )
}
