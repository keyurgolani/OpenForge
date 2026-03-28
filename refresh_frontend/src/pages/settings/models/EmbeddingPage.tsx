import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  Check,
  HardDrive,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  listEmbeddingModelStatus,
  downloadEmbeddingModel,
  deleteEmbeddingModel,
  reindexKnowledge,
} from '@/lib/api'
import { useToast } from '@/components/shared/ToastProvider'
import ConfirmModal from '@/components/shared/ConfirmModal'
import EmptyState from '@/components/shared/EmptyState'

/* -------------------------------------------------------------------------- */
/* Known embedding models                                                     */
/* -------------------------------------------------------------------------- */

const EMBEDDING_MODELS = [
  { id: 'all-MiniLM-L6-v2', name: 'MiniLM-L6-v2', description: 'Fast, lightweight (80MB). Good for general use.', size: '80 MB' },
  { id: 'all-mpnet-base-v2', name: 'MPNet Base v2', description: 'Higher quality, slower (420MB). Best accuracy.', size: '420 MB' },
  { id: 'bge-small-en-v1.5', name: 'BGE Small EN', description: 'Compact BGE model (130MB). Good balance.', size: '130 MB' },
  { id: 'nomic-embed-text-v1.5', name: 'Nomic Embed Text', description: 'Modern embedding model (550MB). Long context.', size: '550 MB' },
]

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ModelStatus {
  model_id: string
  downloaded: boolean
  size?: string
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function EmbeddingPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const modelIds = EMBEDDING_MODELS.map((m) => m.id).join(',')

  const statusQuery = useQuery({
    queryKey: ['embedding-models', modelIds],
    queryFn: () => listEmbeddingModelStatus(modelIds),
  })

  const statuses: ModelStatus[] = statusQuery.data?.models ?? statusQuery.data ?? []
  const statusMap = new Map(statuses.map((s) => [s.model_id, s]))

  const downloadMut = useMutation({
    mutationFn: (modelId: string) => downloadEmbeddingModel(modelId),
    onSuccess: () => {
      toast.success('Download started')
      queryClient.invalidateQueries({ queryKey: ['embedding-models'] })
    },
    onError: (err: any) => toast.error('Download failed', err?.response?.data?.detail ?? err.message),
  })

  const deleteMut = useMutation({
    mutationFn: (modelId: string) => deleteEmbeddingModel(modelId),
    onSuccess: () => {
      toast.success('Model deleted')
      queryClient.invalidateQueries({ queryKey: ['embedding-models'] })
    },
    onError: (err: any) => toast.error('Delete failed', err?.response?.data?.detail ?? err.message),
  })

  const reindexMut = useMutation({
    mutationFn: () => reindexKnowledge(),
    onSuccess: () => toast.success('Reindex started'),
    onError: (err: any) => toast.error('Reindex failed', err?.response?.data?.detail ?? err.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-fg">Embedding Models</h3>
          <p className="text-sm text-fg-muted">
            Local embedding models for knowledge search and similarity
          </p>
        </div>
        <button
          onClick={() => reindexMut.mutate()}
          disabled={reindexMut.isPending}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2',
            'text-sm font-medium text-fg',
            'hover:bg-bg-sunken disabled:opacity-50 transition-colors',
          )}
        >
          {reindexMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Reindex Knowledge
        </button>
      </div>

      {statusQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-bg-sunken" />
          ))}
        </div>
      )}

      {!statusQuery.isLoading && (
        <div className="space-y-3">
          <AnimatePresence>
            {EMBEDDING_MODELS.map((model, i) => {
              const status = statusMap.get(model.id)
              const isDownloaded = status?.downloaded ?? false

              return (
                <motion.div
                  key={model.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                  className={cn(
                    'flex items-center gap-4 rounded-lg border bg-bg-elevated p-4',
                    isDownloaded ? 'border-success/30' : 'border-border/40',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      isDownloaded ? 'bg-success/10' : 'bg-bg-sunken',
                    )}
                  >
                    {isDownloaded ? (
                      <Check className="h-5 w-5 text-success" />
                    ) : (
                      <FileText className="h-5 w-5 text-fg-subtle" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className="font-label text-sm font-medium text-fg">{model.name}</h4>
                    <p className="mt-0.5 text-xs text-fg-muted">{model.description}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-fg-subtle">
                        <HardDrive className="h-2.5 w-2.5" />
                        {model.size}
                      </span>
                      <span className="font-mono text-[10px] text-fg-subtle">{model.id}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isDownloaded ? (
                      <button
                        onClick={() => setDeleteTarget(model.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5',
                          'text-xs font-medium text-fg-muted',
                          'hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition-colors',
                        )}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    ) : (
                      <button
                        onClick={() => downloadMut.mutate(model.id)}
                        disabled={downloadMut.isPending}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5',
                          'text-xs font-medium text-fg-on-primary',
                          'hover:bg-primary-hover disabled:opacity-50 transition-colors',
                        )}
                      >
                        {downloadMut.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        Download
                      </button>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete Embedding Model"
        description="Are you sure you want to delete this model? You will need to re-download it to use it again."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteMut.mutate(deleteTarget)
        }}
      />
    </div>
  )
}
