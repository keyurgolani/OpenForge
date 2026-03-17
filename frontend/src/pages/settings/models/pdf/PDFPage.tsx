/**
 * PDFPage - PDF processing model configuration
 *
 * Uses ModelTypeSelector for provider-based model management.
 * Preserves built-in Marker PDF download/delete controls below.
 */

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Trash2, FileText, Download,
} from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import { listSettings, updateSetting } from '@/lib/api'
import {
  listMarkerModels, downloadMarkerModel, deleteMarkerModel,
} from '@/lib/api'

const CONFIG_KEY = 'system_pdf_models'

export function PDFPage() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
  const qc = useQueryClient()

  // ── ModelTypeSelector state ──────────────────────────────────────────────
  const configuredModels: ConfiguredModel[] = useMemo(() => {
    const raw = settings?.find((s: any) => s.key === CONFIG_KEY)?.value
    if (!raw) return []
    try { return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []) } catch { return [] }
  }, [settings])

  const handleModelsChange = async (models: ConfiguredModel[]) => {
    await updateSetting(CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  // ── Built-in Marker PDF state ────────────────────────────────────────────
  const [deleting, setDeleting] = useState(false)
  const { data: markerModels = [], refetch } = useQuery({
    queryKey: ['marker-models'],
    queryFn: listMarkerModels,
    refetchInterval: (query) => {
      const models = query.state.data as { downloading?: boolean }[] | undefined
      return models?.[0]?.downloading ? 3000 : false
    },
  })

  const model = (markerModels as { id: string; name: string; downloaded: boolean; downloading?: boolean; disk_size: string | null }[])[0]
  const isDownloaded = model?.downloaded ?? false
  const isDownloading = model?.downloading ?? false
  const diskSize = model?.disk_size ?? null
  const [localDownloading, setLocalDownloading] = useState(false)
  const downloading = isDownloading || localDownloading

  const handleDownload = async () => {
    setLocalDownloading(true)
    try {
      await downloadMarkerModel()
      refetch()
    } finally {
      setLocalDownloading(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteMarkerModel()
      refetch()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" />
          PDF Processing
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Marker PDF uses deep learning models for layout-aware text extraction from PDFs. Without it, basic PyMuPDF text extraction is used as a fallback.
        </p>
      </div>

      {/* Provider-based model selection via ModelTypeSelector */}
      <ModelTypeSelector
        configType="pdf"
        configuredModels={configuredModels}
        onModelsChange={handleModelsChange}
      />

      {/* Built-in Marker PDF model */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Local Model</span>
          <div className="flex-1 h-px bg-border/30" />
        </div>

        <div className="glass-card-hover transition-all duration-300">
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center border bg-red-500/10 border-red-500/20 flex-shrink-0">
                <FileText className="w-4.5 h-4.5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm">Marker PDF</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-purple-500/15 text-purple-300 border-purple-500/30">Best</span>
                  <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">~1.5 GB disk</span>
                  <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">~3 GB VRAM</span>
                  {isDownloaded && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                      Downloaded{diskSize ? ` (${diskSize})` : ''}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Layout-aware PDF extraction with table detection, OCR, and markdown output. Produces significantly better results than basic text extraction, especially for PDFs with complex layouts, tables, and multi-column text.
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {isDownloaded ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="p-1.5 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                    title="Delete model"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={downloading}
                    className="btn-primary text-xs py-1.5 px-3"
                    title="Download model"
                  >
                    {downloading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Downloading...</> : <><Download className="w-3.5 h-3.5" /> Download</>}
                  </button>
                )}
              </div>
            </div>

            {!isDownloaded && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <p className="text-[11px] text-amber-300/90">
                  Without this model, PDFs will be processed using basic text extraction (PyMuPDF) which may not handle complex layouts, tables, or scanned documents well.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PDFPage
