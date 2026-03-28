import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Server,
  Plus,
  Trash2,
  Zap,
  Star,
  X,
  Loader2,
  AlertCircle,
  Check,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  listProviders,
  createProvider,
  deleteProvider,
  testConnection,
  setDefaultProvider,
  listModels,
} from '@/lib/api'
import { useToast } from '@/components/shared/ToastProvider'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmModal from '@/components/shared/ConfirmModal'
import EmptyState from '@/components/shared/EmptyState'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Provider {
  id: string
  provider_name: string
  provider_type: string
  api_key?: string
  api_base?: string
  is_default?: boolean
  status?: string
  created_at?: string
}

/* -------------------------------------------------------------------------- */
/* Add Provider Dialog                                                        */
/* -------------------------------------------------------------------------- */

function AddProviderDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [name, setName] = useState('')
  const [type, setType] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [apiBase, setApiBase] = useState('')
  const [error, setError] = useState('')

  const resetForm = () => {
    setName('')
    setType('openai')
    setApiKey('')
    setApiBase('')
    setError('')
  }

  const createMut = useMutation({
    mutationFn: () =>
      createProvider({
        provider_name: name || type,
        provider_type: type,
        api_key: apiKey || undefined,
        ...(apiBase ? { api_base: apiBase } : {}),
      }),
    onSuccess: () => {
      toast.success('Provider created')
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      onOpenChange(false)
      resetForm()
    },
    onError: (err: any) => setError(err?.response?.data?.detail ?? err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!apiKey && type !== 'ollama') {
      setError('API key is required')
      return
    }
    createMut.mutate()
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
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
                    Add Provider
                  </Dialog.Title>
                  <Dialog.Close className="rounded-md p-1 text-fg-subtle hover:text-fg hover:bg-bg-sunken transition-colors">
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>

                {error && (
                  <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
                    <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
                    <p className="text-sm text-danger">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="font-label text-sm font-medium text-fg">Provider Type</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className={cn(
                        'w-full rounded-lg border border-border bg-bg py-2.5 px-3',
                        'font-body text-sm text-fg',
                        'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                      )}
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="google">Google AI</option>
                      <option value="openrouter">OpenRouter</option>
                      <option value="ollama">Ollama (Local)</option>
                      <option value="custom">Custom OpenAI-compatible</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="font-label text-sm font-medium text-fg">Display Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={`My ${type} provider`}
                      className={cn(
                        'w-full rounded-lg border border-border bg-bg py-2.5 px-3',
                        'font-body text-sm text-fg placeholder:text-fg-subtle',
                        'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-label text-sm font-medium text-fg">API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className={cn(
                        'w-full rounded-lg border border-border bg-bg py-2.5 px-3',
                        'font-mono text-sm text-fg placeholder:text-fg-subtle',
                        'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                      )}
                    />
                  </div>

                  {(type === 'custom' || type === 'ollama') && (
                    <div className="space-y-2">
                      <label className="font-label text-sm font-medium text-fg">Base URL</label>
                      <input
                        type="text"
                        value={apiBase}
                        onChange={(e) => setApiBase(e.target.value)}
                        placeholder="http://localhost:11434/v1"
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
                      Add Provider
                    </button>
                  </div>
                </form>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

/* -------------------------------------------------------------------------- */
/* Provider Card                                                              */
/* -------------------------------------------------------------------------- */

function ProviderCard({ provider }: { provider: Provider }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [showModels, setShowModels] = useState(false)

  const modelsQuery = useQuery({
    queryKey: ['provider-models', provider.id],
    queryFn: () => listModels(provider.id),
    enabled: showModels,
  })

  const testMut = useMutation({
    mutationFn: () => testConnection(provider.id),
    onSuccess: () => toast.success('Connection successful'),
    onError: (err: any) =>
      toast.error('Connection failed', err?.response?.data?.detail ?? err.message),
  })

  const setDefaultMut = useMutation({
    mutationFn: () => setDefaultProvider(provider.id),
    onSuccess: () => {
      toast.success('Set as default provider')
      queryClient.invalidateQueries({ queryKey: ['providers'] })
    },
    onError: (err: any) => toast.error('Failed', err?.response?.data?.detail ?? err.message),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteProvider(provider.id),
    onSuccess: () => {
      toast.success('Provider deleted')
      queryClient.invalidateQueries({ queryKey: ['providers'] })
    },
    onError: (err: any) => toast.error('Delete failed', err?.response?.data?.detail ?? err.message),
  })

  const models: any[] = modelsQuery.data?.models ?? modelsQuery.data ?? []

  return (
    <>
      <div
        className={cn(
          'rounded-lg border bg-bg-elevated p-5 transition-all',
          provider.is_default ? 'border-primary/40 shadow-sm shadow-primary/5' : 'border-border/40',
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Server className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-label text-sm font-semibold text-fg truncate">
                {provider.provider_name}
              </h3>
              {provider.is_default && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <Star className="h-2.5 w-2.5" />
                  Default
                </span>
              )}
            </div>
            <p className="mt-0.5 font-label text-xs text-fg-muted capitalize">
              {provider.provider_type}
            </p>
            {provider.status && (
              <div className="mt-1.5">
                <StatusBadge status={provider.status} />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5',
              'text-xs font-medium text-fg',
              'hover:bg-bg-sunken disabled:opacity-50 transition-colors',
            )}
          >
            {testMut.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            Test
          </button>
          <button
            onClick={() => setShowModels(!showModels)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5',
              'text-xs font-medium text-fg',
              'hover:bg-bg-sunken transition-colors',
            )}
          >
            <Layers className="h-3 w-3" />
            Models
          </button>
          {!provider.is_default && (
            <button
              onClick={() => setDefaultMut.mutate()}
              disabled={setDefaultMut.isPending}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5',
                'text-xs font-medium text-fg',
                'hover:bg-bg-sunken disabled:opacity-50 transition-colors',
              )}
            >
              <Star className="h-3 w-3" />
              Set Default
            </button>
          )}
          <button
            onClick={() => setDeleteOpen(true)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5',
              'text-xs font-medium text-fg-muted',
              'hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition-colors',
            )}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        </div>

        {/* Models list */}
        {showModels && (
          <div className="mt-4 rounded-lg border border-border/30 bg-bg-sunken/30 p-3">
            <p className="font-label text-xs font-medium text-fg-muted mb-2">Available Models</p>
            {modelsQuery.isLoading && (
              <div className="flex items-center gap-2 text-xs text-fg-muted py-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading models...
              </div>
            )}
            {!modelsQuery.isLoading && models.length === 0 && (
              <p className="text-xs text-fg-subtle py-2">No models found</p>
            )}
            {!modelsQuery.isLoading && models.length > 0 && (
              <div className="max-h-40 overflow-auto space-y-1">
                {models.map((model: any) => (
                  <div
                    key={model.id ?? model.model_id ?? model.name}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-fg hover:bg-bg-elevated"
                  >
                    <Check className="h-3 w-3 text-success shrink-0" />
                    <span className="font-mono truncate">
                      {model.id ?? model.model_id ?? model.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Provider"
        description={`Are you sure you want to delete "${provider.provider_name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteMut.mutate()}
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function ProvidersPage() {
  const [addOpen, setAddOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: listProviders,
  })

  const providers: Provider[] = data?.providers ?? data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-fg">LLM Providers</h3>
          <p className="text-sm text-fg-muted">
            Connect language model providers for agent reasoning
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
            'text-sm font-medium text-fg-on-primary',
            'hover:bg-primary-hover transition-colors',
          )}
        >
          <Plus className="h-4 w-4" />
          Add Provider
        </button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-bg-sunken" />
          ))}
        </div>
      )}

      {!isLoading && providers.length === 0 && (
        <EmptyState
          icon={Server}
          title="No providers configured"
          description="Add an LLM provider to start using agents and chat."
          action={
            <button
              onClick={() => setAddOpen(true)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
                'text-sm font-medium text-fg-on-primary',
                'hover:bg-primary-hover transition-colors',
              )}
            >
              <Plus className="h-4 w-4" />
              Add Provider
            </button>
          }
        />
      )}

      {!isLoading && providers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AnimatePresence>
            {providers.map((provider, i) => (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
              >
                <ProviderCard provider={provider} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AddProviderDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
