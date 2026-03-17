/**
 * PDFPage - PDF processing model configuration
 *
 * Uses ModelTypeSelector for unified provider-based model management
 * (including OpenForge Local models).
 */

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import { listSettings, updateSetting } from '@/lib/api'

const CONFIG_KEY = 'system_pdf_models'

export function PDFPage() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
  const qc = useQueryClient()

  const configuredModels: ConfiguredModel[] = useMemo(() => {
    const raw = settings?.find((s: any) => s.key === CONFIG_KEY)?.value
    if (!raw) return []
    try { return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []) } catch { return [] }
  }, [settings])

  const handleModelsChange = async (models: ConfiguredModel[]) => {
    await updateSetting(CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" />
          PDF Processing
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Models for layout-aware text extraction from PDFs. Select a local model via OpenForge Local for on-device processing, or use a cloud provider. Without a configured model, basic PyMuPDF text extraction is used as a fallback.
        </p>
      </div>

      <ModelTypeSelector
        configType="pdf"
        configuredModels={configuredModels}
        onModelsChange={handleModelsChange}
      />
    </div>
  )
}

export default PDFPage
