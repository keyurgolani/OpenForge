import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileType,
  Download,
  Trash2,
  Loader2,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  listMarkerModels,
  downloadMarkerModel,
  deleteMarkerModel,
} from '@/lib/api'
import { useToast } from '@/components/shared/ToastProvider'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface MarkerModel {
  id?: string
  model_id?: string
  name?: string
  downloaded?: boolean
  size?: string
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function PDFPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const modelsQuery = useQuery({
    queryKey: ['marker-models'],
    queryFn: listMarkerModels,
  })

  const models: MarkerModel[] = modelsQuery.data?.models ?? modelsQuery.data ?? []
  const markerModel = models[0]
  const isDownloaded = markerModel?.downloaded ?? false

  const downloadMut = useMutation({
    mutationFn: () => downloadMarkerModel(),
    onSuccess: () => {
      toast.success('Marker download started')
      queryClient.invalidateQueries({ queryKey: ['marker-models'] })
    },
    onError: (err: any) => toast.error('Download failed', err?.response?.data?.detail ?? err.message),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteMarkerModel(),
    onSuccess: () => {
      toast.success('Marker model deleted')
      queryClient.invalidateQueries({ queryKey: ['marker-models'] })
    },
    onError: (err: any) => toast.error('Delete failed', err?.response?.data?.detail ?? err.message),
  })

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-base font-semibold text-fg">PDF Models</h3>
        <p className="text-sm text-fg-muted">
          Marker model for high-quality PDF text extraction and processing
        </p>
      </div>

      {modelsQuery.isLoading && (
        <div className="h-32 animate-pulse rounded-lg bg-bg-sunken" />
      )}

      {!modelsQuery.isLoading && (
        <div className="rounded-lg border border-border/40 bg-bg-elevated p-6">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                isDownloaded ? 'bg-success/10' : 'bg-bg-sunken',
              )}
            >
              {isDownloaded ? (
                <Check className="h-6 w-6 text-success" />
              ) : (
                <FileType className="h-6 w-6 text-fg-subtle" />
              )}
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-label text-sm font-medium text-fg">Marker Model</h4>
                  {isDownloaded && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                      <Check className="h-2.5 w-2.5" />
                      Downloaded
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-fg-muted leading-relaxed">
                  The Marker model provides high-quality PDF parsing and text extraction. It converts
                  PDF documents into clean text while preserving structure, tables, and formatting.
                  Required for processing PDF uploads in your knowledge base.
                </p>
              </div>

              {markerModel?.size && (
                <p className="text-xs text-fg-subtle">Size: {markerModel.size}</p>
              )}

              <div className="flex items-center gap-3">
                {isDownloaded ? (
                  <button
                    onClick={() => deleteMut.mutate()}
                    disabled={deleteMut.isPending}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2',
                      'text-sm font-medium text-fg-muted',
                      'hover:bg-danger/10 hover:text-danger hover:border-danger/30',
                      'disabled:opacity-50 transition-colors',
                    )}
                  >
                    {deleteMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete Model
                  </button>
                ) : (
                  <button
                    onClick={() => downloadMut.mutate()}
                    disabled={downloadMut.isPending}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
                      'text-sm font-medium text-fg-on-primary',
                      'hover:bg-primary-hover disabled:opacity-50 transition-colors',
                    )}
                  >
                    {downloadMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Download Model
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info section */}
      <div className="rounded-lg border border-border/20 bg-bg-sunken/30 p-4">
        <h4 className="font-label text-xs font-medium text-fg-muted mb-2">About PDF Processing</h4>
        <ul className="space-y-1.5 text-xs text-fg-muted">
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
            Marker converts PDFs to clean text, preserving tables and structure
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
            Required for uploading and processing PDF files in knowledge
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
            Runs locally on your machine for privacy
          </li>
        </ul>
      </div>
    </div>
  )
}
