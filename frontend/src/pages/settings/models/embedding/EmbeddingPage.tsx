/**
 * EmbeddingPage - Embedding model configuration
 *
 * Uses ModelTypeSelector for provider-based model management.
 * Preserves built-in local model controls, re-index, and reranking toggle below.
 */

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Trash2, CheckCircle2,
  ChevronDown, ChevronUp, RefreshCw,
  Save, AlertCircle, Database, Download,
  ShieldAlert, CheckCircle, Grid3X3,
} from 'lucide-react'
import { ModelTypeSelector, type ConfiguredModel } from '@/components/shared/ModelTypeSelector'
import {
  listSettings, updateSetting,
  listEmbeddingModelStatus, downloadEmbeddingModel, deleteEmbeddingModel,
  reindexKnowledge,
} from '@/lib/api'
import {
  RECOMMENDED_EMBEDDING_MODELS, QUALITY_COLORS,
} from '../../constants'
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

  // ── Built-in local embedding model state ─────────────────────────────────
  const embeddingModel = (settings as { key: string; value: string }[]).find(s => s.key === 'embedding_model')?.value ?? ''
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [localExpanded, setLocalExpanded] = useState(true)
  const [showEmbedConfirm, setShowEmbedConfirm] = useState(false)
  const [downloadingEmb, setDownloadingEmb] = useState<string | null>(null)
  const [deletingEmb, setDeletingEmb] = useState<string | null>(null)
  const [reindexingKnowledge, setReindexingKnowledge] = useState(false)
  const [reindexKnowledgeStarted, setReindexKnowledgeStarted] = useState(false)
  const [togglingRerank, setTogglingRerank] = useState(false)

  const rerankingEnabled = useMemo(() => {
    const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === 'search.reranking_enabled')?.value
    return parseBoolSetting(raw, true)
  }, [settings])

  // Query download status for all recommended embedding models
  const allEmbIds = useMemo(() => RECOMMENDED_EMBEDDING_MODELS.map(m => m.id).join(','), [])
  const { data: embStatuses = [], refetch: refetchEmb } = useQuery({
    queryKey: ['embedding-model-status', allEmbIds],
    queryFn: () => listEmbeddingModelStatus(allEmbIds),
  })
  const embDownloaded = useMemo(() => {
    const set = new Set<string>()
    for (const s of embStatuses as { id: string; downloaded: boolean }[]) {
      if (s.downloaded) set.add(s.id)
    }
    return set
  }, [embStatuses])

  useEffect(() => { setModel(embeddingModel) }, [embeddingModel])

  const handleDownloadEmb = async (modelId: string) => {
    setDownloadingEmb(modelId)
    try {
      await downloadEmbeddingModel(modelId)
      refetchEmb()
    } finally {
      setDownloadingEmb(null)
    }
  }

  const handleDeleteEmb = async (modelId: string) => {
    setDeletingEmb(modelId)
    try {
      await deleteEmbeddingModel(modelId)
      refetchEmb()
      if (model === modelId) {
        setModel('')
        setSaved(false)
      }
    } finally {
      setDeletingEmb(null)
    }
  }

  const handleSaveLocal = () => {
    if (embeddingModel && embeddingModel !== model) {
      setShowEmbedConfirm(true)
    } else {
      void doSaveLocal()
    }
  }

  const doSaveLocal = async () => {
    setSaving(true); setShowEmbedConfirm(false)
    await updateSetting('embedding_model', { value: model })
    qc.invalidateQueries({ queryKey: ['settings'] })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Grid3X3 className="w-4 h-4" />
          Embedding Models
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Models used for semantic indexing and vector search. Add provider-based models or configure the built-in local model.
        </p>
      </div>

      {/* Provider-based model selection via ModelTypeSelector */}
      <ModelTypeSelector
        configType="embedding"
        configuredModels={configuredModels}
        onModelsChange={handleModelsChange}
      />

      {/* Built-in local embedding model */}
      <div className="glass-card-hover transition-all duration-300">
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer"
          onClick={() => setLocalExpanded(p => !p)}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLocalExpanded(p => !p) } }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center border bg-lime-500/10 border-lime-500/20">
            <Database className="w-4 h-4 text-lime-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Built-in Local</span>
              <span className="chip-muted text-[10px]">sentence-transformers</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {model || 'No model configured'}
            </p>
          </div>
          <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); setLocalExpanded(p => !p) }}>
            {localExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {localExpanded && (
          <div className="border-t border-border/50 px-4 py-4 space-y-3 animate-fade-in">
            <label className="text-xs text-muted-foreground mb-2 block font-medium">Download a model, then set it as default</label>
            <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto pr-1">
              {RECOMMENDED_EMBEDDING_MODELS.map(m => {
                const isSelected = model === m.id
                const isDownloaded = embDownloaded.has(m.id)
                const isDownloading = downloadingEmb === m.id
                const isDeleting = deletingEmb === m.id
                return (
                  <div
                    key={m.id}
                    className={`text-left p-3 rounded-xl border transition-all duration-200 ${isSelected
                      ? 'border-accent bg-accent/10 shadow-glass-sm'
                      : 'border-border/50 hover:border-border hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => { if (isDownloaded) { setModel(m.id); setSaved(false) } }}
                        disabled={!isDownloaded}
                        className="mt-0.5 flex-shrink-0"
                        title={isDownloaded ? 'Select as default' : 'Download first'}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full border transition-colors ${isSelected ? 'bg-accent border-accent' : isDownloaded ? 'border-border hover:border-accent/50' : 'border-border/30 opacity-40'}`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className={`text-xs font-medium ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>{m.name}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${QUALITY_COLORS[m.quality]}`}>{m.quality}</span>
                          <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.diskSize} disk</span>
                          {m.dims && <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.dims}d</span>}
                          {isDownloaded && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Downloaded</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isDownloaded ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteEmb(m.id)}
                            disabled={isDeleting || isSelected}
                            className="p-1 rounded text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                            title={isSelected ? 'Cannot delete active model' : 'Delete model'}
                          >
                            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDownloadEmb(m.id)}
                            disabled={isDownloading || downloadingEmb !== null}
                            className="p-1 rounded text-accent/70 hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
                            title="Download model"
                          >
                            {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>Changing the embedding model requires re-indexing all knowledge. Search results will be unavailable until re-indexing completes.</span>
            </div>
            <button
              className="btn-primary text-xs py-1.5 px-3"
              onClick={handleSaveLocal}
              disabled={saving || !model.trim() || !embDownloaded.has(model)}
              title={model && !embDownloaded.has(model) ? 'Download the model first' : ''}
            >
              {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5" /> Set as Default</>}
            </button>
          </div>
        )}
      </div>

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

      {/* Critical embedding model change confirmation */}
      {showEmbedConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setShowEmbedConfirm(false)} />
          <div className="relative w-full max-w-lg animate-fade-in">
            {/* Danger glow border */}
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-red-600/60 via-red-500/40 to-orange-600/60 blur-sm" />
            <div className="relative rounded-2xl bg-background border border-red-600/50 shadow-2xl overflow-hidden">
              {/* Critical header stripe */}
              <div className="bg-gradient-to-r from-red-900/80 via-red-800/70 to-red-900/80 border-b border-red-600/40 px-6 py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-red-400/80 mb-0.5">Destructive Operation</p>
                  <h3 className="text-base font-bold text-foreground">Change Embedding Model</h3>
                </div>
              </div>

              <div className="px-6 py-5 space-y-4">
                {/* Model change summary */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/60 text-xs font-mono">
                  <span className="text-muted-foreground truncate max-w-[180px]">{embeddingModel || '(none)'}</span>
                  <span className="text-red-400 font-bold flex-shrink-0">&rarr;</span>
                  <span className="text-foreground font-semibold truncate max-w-[180px]">{model}</span>
                </div>

                {/* Consequences */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">What will happen</p>
                  {[
                    'All existing knowledge vectors will be invalidated immediately.',
                    'Semantic search will be unavailable until full re-indexing completes.',
                    'Re-indexing every knowledge item may take hours on large datasets.',
                    'The new model will be downloaded on first use (can be several GB).',
                    'This action cannot be undone without manually re-indexing with the old model.',
                  ].map(line => (
                    <div key={line} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="text-red-500 font-bold flex-shrink-0 mt-0.5">!</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-6 pb-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEmbedConfirm(false)}
                  className="btn-ghost px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void doSaveLocal()}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 border border-red-500/50 shadow-lg shadow-red-900/30 transition-all focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Yes, Change Model &amp; Re-index
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EmbeddingPage
