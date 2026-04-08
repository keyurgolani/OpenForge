/**
 * EmbeddingPage - Embedding model configuration
 *
 * Uses ModelTypeSelector for unified provider-based model management
 * (including OpenForge Local models). Includes OllamaNativeSection for
 * native Ollama model management via the unified OpenForge Local provider.
 * Operational controls for re-indexing and cross-encoder reranking are
 * preserved below.
 */

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, RefreshCw, CheckCircle, Grid3X3,
} from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import {
  listSettings, updateSetting, reindexKnowledge,
} from '@/lib/api'
import { parseBoolSetting, TogglePill } from '../../components'

const CONFIG_KEY = 'system_embedding_models'

export function EmbeddingPage() {
  const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })
  const qc = useQueryClient()

  // ── ModelTypeSelector state ──────────────────────────────────────────────
  const configuredModels: ConfiguredModel[] = useMemo(() => {
    const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === CONFIG_KEY)?.value
    if (!raw) return []
    try { return typeof raw === 'string' ? JSON.parse(raw as string) : (Array.isArray(raw) ? raw : []) } catch { return [] }
  }, [settings])

  const handleModelsChange = async (models: ConfiguredModel[]) => {
    await updateSetting(CONFIG_KEY, { value: JSON.stringify(models), category: 'llm' })
    qc.invalidateQueries({ queryKey: ['settings'] })
  }

  // ── Operational state ──────────────────────────────────────────────────
  const [reindexingKnowledge, setReindexingKnowledge] = useState(false)
  const [reindexKnowledgeStarted, setReindexKnowledgeStarted] = useState(false)
  const [togglingRerank, setTogglingRerank] = useState(false)

  const rerankingEnabled = useMemo(() => {
    const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === 'search.reranking_enabled')?.value
    return parseBoolSetting(raw, true)
  }, [settings])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Grid3X3 className="w-4 h-4" />
          Embedding Models
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Models used for semantic indexing and vector search. Select from cloud providers or locally-downloaded models via OpenForge Local.
        </p>
      </div>

      {/* Unified model selection via ModelTypeSelector */}
      <ModelTypeSelector
        configType="embedding"
        configuredModels={configuredModels}
        onModelsChange={handleModelsChange}
      />

      {/* Re-index knowledge */}
      <div className="glass-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">Re-index Knowledge</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Re-process text embeddings for all knowledge items using the current model.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setReindexingKnowledge(true)
              try {
                await reindexKnowledge()
                setReindexKnowledgeStarted(true)
                setTimeout(() => setReindexKnowledgeStarted(false), 3000)
              } finally {
                setReindexingKnowledge(false)
              }
            }}
            disabled={reindexingKnowledge}
            className="btn-primary text-xs py-1.5 px-4 gap-1.5 flex-shrink-0"
          >
            {reindexingKnowledge ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-index All Knowledge
          </button>
        </div>
        {reindexKnowledgeStarted && (
          <span className="text-xs text-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> Re-indexing started in background
          </span>
        )}
      </div>

      {/* Cross-encoder reranking toggle */}
      <div className="glass-card p-4">
        <button
          type="button"
          className="w-full text-left"
          onClick={async () => {
            setTogglingRerank(true)
            try {
              await updateSetting('search.reranking_enabled', {
                value: !rerankingEnabled,
                category: 'search',
                sensitive: false,
              })
              qc.invalidateQueries({ queryKey: ['settings'] })
            } finally {
              setTogglingRerank(false)
            }
          }}
          disabled={togglingRerank}
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium">Cross-Encoder Reranking</h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Rerank search results using a cross-encoder model for improved relevance. Adds slight latency per query.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              {togglingRerank && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              <TogglePill checked={rerankingEnabled} />
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}

export default EmbeddingPage
