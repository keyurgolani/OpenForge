import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  Volume2,
  Download,
  Trash2,
  Star,
  Loader2,
  Check,
  HardDrive,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  listWhisperModels,
  downloadWhisperModel,
  deleteWhisperModel,
  listTTSModels,
  downloadTTSModel,
  deleteTTSModel,
  getTTSDefault,
  setTTSDefault,
} from '@/lib/api'
import { useToast } from '@/components/shared/ToastProvider'
import ConfirmModal from '@/components/shared/ConfirmModal'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface AudioModel {
  id?: string
  model_id?: string
  name?: string
  downloaded?: boolean
  is_default?: boolean
  size?: string
}

/* -------------------------------------------------------------------------- */
/* Model Row                                                                  */
/* -------------------------------------------------------------------------- */

function ModelRow({
  model,
  isDefault,
  onDownload,
  onDelete,
  onSetDefault,
  downloading,
  showSetDefault,
}: {
  model: AudioModel
  isDefault: boolean
  onDownload: () => void
  onDelete: () => void
  onSetDefault?: () => void
  downloading: boolean
  showSetDefault: boolean
}) {
  const modelId = model.id ?? model.model_id ?? model.name ?? ''
  const isDownloaded = model.downloaded ?? false

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border bg-bg-elevated p-4',
        isDownloaded ? 'border-success/30' : 'border-border/40',
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          isDownloaded ? 'bg-success/10' : 'bg-bg-sunken',
        )}
      >
        {isDownloaded ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <HardDrive className="h-4 w-4 text-fg-subtle" />
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
          <p className="mt-0.5 text-xs text-fg-muted">{model.size}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isDownloaded && showSetDefault && !isDefault && onSetDefault && (
          <button
            onClick={onSetDefault}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5',
              'text-xs font-medium text-fg',
              'hover:bg-bg-sunken transition-colors',
            )}
          >
            <Star className="h-3 w-3" />
            Set Default
          </button>
        )}
        {isDownloaded ? (
          <button
            onClick={onDelete}
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
            onClick={onDownload}
            disabled={downloading}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5',
              'text-xs font-medium text-fg-on-primary',
              'hover:bg-primary-hover disabled:opacity-50 transition-colors',
            )}
          >
            {downloading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            Download
          </button>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function AudioPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'whisper' | 'tts' } | null>(null)

  // Whisper models
  const whisperQuery = useQuery({
    queryKey: ['whisper-models'],
    queryFn: listWhisperModels,
  })

  const whisperModels: AudioModel[] = whisperQuery.data?.models ?? whisperQuery.data ?? []

  const downloadWhisperMut = useMutation({
    mutationFn: (modelId: string) => downloadWhisperModel(modelId),
    onSuccess: () => {
      toast.success('Whisper download started')
      queryClient.invalidateQueries({ queryKey: ['whisper-models'] })
    },
    onError: (err: any) => toast.error('Download failed', err?.response?.data?.detail ?? err.message),
  })

  const deleteWhisperMut = useMutation({
    mutationFn: (modelId: string) => deleteWhisperModel(modelId),
    onSuccess: () => {
      toast.success('Whisper model deleted')
      queryClient.invalidateQueries({ queryKey: ['whisper-models'] })
    },
    onError: (err: any) => toast.error('Delete failed', err?.response?.data?.detail ?? err.message),
  })

  // TTS models
  const ttsQuery = useQuery({
    queryKey: ['tts-models'],
    queryFn: listTTSModels,
  })

  const ttsDefaultQuery = useQuery({
    queryKey: ['tts-default'],
    queryFn: getTTSDefault,
  })

  const ttsModels: AudioModel[] = ttsQuery.data?.models ?? ttsQuery.data ?? []
  const ttsDefaultId = ttsDefaultQuery.data?.model_id ?? ttsDefaultQuery.data?.default ?? ''

  const downloadTTSMut = useMutation({
    mutationFn: (modelId: string) => downloadTTSModel(modelId),
    onSuccess: () => {
      toast.success('TTS download started')
      queryClient.invalidateQueries({ queryKey: ['tts-models'] })
    },
    onError: (err: any) => toast.error('Download failed', err?.response?.data?.detail ?? err.message),
  })

  const deleteTTSMut = useMutation({
    mutationFn: (modelId: string) => deleteTTSModel(modelId),
    onSuccess: () => {
      toast.success('TTS model deleted')
      queryClient.invalidateQueries({ queryKey: ['tts-models'] })
    },
    onError: (err: any) => toast.error('Delete failed', err?.response?.data?.detail ?? err.message),
  })

  const setTTSDefaultMut = useMutation({
    mutationFn: (modelId: string) => setTTSDefault(modelId),
    onSuccess: () => {
      toast.success('TTS default updated')
      queryClient.invalidateQueries({ queryKey: ['tts-default'] })
    },
    onError: (err: any) => toast.error('Failed', err?.response?.data?.detail ?? err.message),
  })

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === 'whisper') {
      deleteWhisperMut.mutate(deleteTarget.id)
    } else {
      deleteTTSMut.mutate(deleteTarget.id)
    }
  }

  return (
    <div className="space-y-8">
      {/* Whisper Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Mic className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-fg">Whisper Models</h3>
            <p className="text-sm text-fg-muted">Speech-to-text models for audio transcription</p>
          </div>
        </div>

        {whisperQuery.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-bg-sunken" />
            ))}
          </div>
        )}

        {!whisperQuery.isLoading && whisperModels.length === 0 && (
          <p className="text-sm text-fg-muted rounded-lg border border-border/40 bg-bg-elevated p-4">
            No Whisper models available.
          </p>
        )}

        {!whisperQuery.isLoading && whisperModels.length > 0 && (
          <div className="space-y-2">
            <AnimatePresence>
              {whisperModels.map((model, i) => {
                const modelId = model.id ?? model.model_id ?? model.name ?? ''
                return (
                  <motion.div
                    key={modelId}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.2 }}
                  >
                    <ModelRow
                      model={model}
                      isDefault={false}
                      onDownload={() => downloadWhisperMut.mutate(modelId)}
                      onDelete={() => setDeleteTarget({ id: modelId, type: 'whisper' })}
                      downloading={downloadWhisperMut.isPending}
                      showSetDefault={false}
                    />
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* TTS Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/10">
            <Volume2 className="h-4.5 w-4.5 text-secondary" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-fg">TTS Models</h3>
            <p className="text-sm text-fg-muted">Text-to-speech models for audio generation</p>
          </div>
        </div>

        {ttsQuery.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-bg-sunken" />
            ))}
          </div>
        )}

        {!ttsQuery.isLoading && ttsModels.length === 0 && (
          <p className="text-sm text-fg-muted rounded-lg border border-border/40 bg-bg-elevated p-4">
            No TTS models available.
          </p>
        )}

        {!ttsQuery.isLoading && ttsModels.length > 0 && (
          <div className="space-y-2">
            <AnimatePresence>
              {ttsModels.map((model, i) => {
                const modelId = model.id ?? model.model_id ?? model.name ?? ''
                return (
                  <motion.div
                    key={modelId}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.2 }}
                  >
                    <ModelRow
                      model={model}
                      isDefault={modelId === ttsDefaultId}
                      onDownload={() => downloadTTSMut.mutate(modelId)}
                      onDelete={() => setDeleteTarget({ id: modelId, type: 'tts' })}
                      onSetDefault={() => setTTSDefaultMut.mutate(modelId)}
                      downloading={downloadTTSMut.isPending}
                      showSetDefault={true}
                    />
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete Audio Model"
        description="Are you sure you want to delete this model? You will need to re-download it to use it again."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
