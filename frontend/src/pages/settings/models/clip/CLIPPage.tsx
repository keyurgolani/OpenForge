/**
 * CLIPPage - CLIP visual search model configuration
 *
 * Uses ModelTypeSelector for unified provider-based model management
 * (including OpenForge Local models). Re-index images control preserved below.
 */

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, CheckCircle, Image } from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import { listSettings, updateSetting, reindexImages } from '@/lib/api'

const CONFIG_KEY = 'system_clip_models'

export function CLIPPage() {
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

  const [reindexing, setReindexing] = useState(false)
  const [reindexStarted, setReindexStarted] = useState(false)

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Image className="w-4 h-4" />
          CLIP Visual Search Models
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          CLIP models generate visual embeddings for image search. Select from local models via OpenForge Local or cloud providers.
        </p>
      </div>

      <ModelTypeSelector
        configType="clip"
        configuredModels={configuredModels}
        onModelsChange={handleModelsChange}
      />

      {/* Re-index images */}
      <div className="glass-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">Re-index Images</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Re-process CLIP embeddings for all images using the current model.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setReindexing(true)
              try {
                await reindexImages()
                setReindexStarted(true)
                setTimeout(() => setReindexStarted(false), 3000)
              } finally {
                setReindexing(false)
              }
            }}
            disabled={reindexing}
            className="btn-primary text-xs py-1.5 px-4 gap-1.5 flex-shrink-0"
          >
            {reindexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-index All Images
          </button>
        </div>
        {reindexStarted && (
          <span className="text-xs text-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> Re-indexing started in background
          </span>
        )}
      </div>
    </div>
  )
}

export default CLIPPage
