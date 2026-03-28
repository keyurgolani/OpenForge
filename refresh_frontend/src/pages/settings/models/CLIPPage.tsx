import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ImageIcon,
  Download,
  Trash2,
  Star,
  RefreshCw,
  Loader2,
  Check,
  HardDrive,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  listCLIPModels,
  downloadCLIPModel,
  deleteCLIPModel,
  getCLIPDefault,
  setCLIPDefault,
  reindexImages,
} from '@/lib/api'
import { useToast } from '@/components/shared/ToastProvider'
import ConfirmModal from '@/components/shared/ConfirmModal'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface CLIPModel {
  id?: string
  model_id?: string
  name?: string
  downloaded?: boolean
  size?: string
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function CLIPPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const modelsQuery = useQuery({
    queryKey: ['clip-models'],
    queryFn: listCLIPModels,
  })

  const defaultQuery = useQuery({
    queryKey: ['clip-default'],
    queryFn: getCLIPDefault,
  })

  const models: CLIPModel[] = modelsQuery.data?.models ?? modelsQuery.data ?? []
  const defaultModelId = defaultQuery.data?.model_id ?? defaultQuery.data?.default ?? ''

  const downloadMut = useMutation({
    mutationFn: (modelId: string) => downloadCLIPModel(modelId),
    onSuccess: () => {
      toast.success('CLIP download started')
      queryClient.invalidateQueries({ queryKey: ['clip-models'] })
    },
    onError: (err: any) => toast.error('Download failed', err?.response?.data?.detail ?? err.message),
  })

  const deleteMut = useMutation({
    mutationFn: (modelId: string) => deleteCLIPModel(modelId),
    onSuccess: () => {
      toast.success('CLIP model deleted')
      queryClient.invalidateQueries({ queryKey: ['clip-models'] })
    },
    onError: (err: any) => toast.error('Delete failed', err?.response?.data?.detail ?? err.message),
  })

  const setDefaultMut = useMutation({
    mutationFn: (modelId: string) => setCLIPDefault(modelId),
    onSuccess: () => {
      toast.success('CLIP default updated')
      queryClient.invalidateQueries({ queryKey: ['clip-default'] })
    },
    onError: (err: any) => toast.error('Failed', err?.response?.data?.detail ?? err.message),
  })

  const reindexMut = useMutation({
    mutationFn: () => reindexImages(),
    onSuccess: () => toast.success('Image reindex started'),
    onError: (err: any) => toast.error('Reindex failed', err?.response?.data?.detail ?? err.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-fg">CLIP Models</h3>
          <p className="text-sm text-fg-muted">
            Image-text models for visual search and image understanding
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
          Reindex Images
        </button>
      </div>

      {modelsQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-bg-sunken" />
          ))}
        </div>
      )}

      {!modelsQuery.isLoading && models.length === 0 && (
        <div className="rounded-lg border border-border/40 bg-bg-elevated p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-bg-sunken mb-3">
            <ImageIcon className="h-6 w-6 text-fg-subtle" />
          </div>
          <p className="text-sm text-fg-muted">No CLIP models available.</p>
        </div>
      )}

      {!modelsQuery.isLoading && models.length > 0 && (
        <div className="space-y-3">
          <AnimatePresence>
            {models.map((model, i) => {
              const modelId = model.id ?? model.model_id ?? model.name ?? ''
              const isDownloaded = model.downloaded ?? false
              const isDefault = modelId === defaultModelId

              return (
                <motion.div
                  key={modelId}
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
                      <ImageIcon className="h-5 w-5 text-fg-subtle" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-mono text-sm font-medium text-fg">{modelId}</h4>
                      {isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          <Star className="h-2.5 w-2.5" />
                          Default
                        </span>
                      )}
                    </div>
                    {model.size && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted">
                        <HardDrive className="h-2.5 w-2.5" />
                        {model.size}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isDownloaded && !isDefault && (
                      <button
                        onClick={() => setDefaultMut.mutate(modelId)}
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
                    {isDownloaded ? (
                      <button
                        onClick={() => setDeleteTarget(modelId)}
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
                        onClick={() => downloadMut.mutate(modelId)}
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
        title="Delete CLIP Model"
        description="Are you sure you want to delete this CLIP model? You will need to re-download and re-index images to use it again."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteMut.mutate(deleteTarget)
        }}
      />
    </div>
  )
}
