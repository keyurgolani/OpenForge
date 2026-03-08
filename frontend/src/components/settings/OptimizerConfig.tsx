import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getOptimizerConfig, createOptimizerConfig, updateOptimizerConfig, listProviders } from '@/lib/api'
import { Loader2, Save } from 'lucide-react'

interface OptimizerConfigData {
  optimizerProviderId: string
  optimizerModel: string
  targetProviderId: string
  targetModel: string
  optimizationPrompt?: string
  additionalContext?: string
}

const DEFAULT_OPTIMIZATION_PROMPT = `You are a prompt optimization expert. Rewrite the following user prompt to be more specific, well-structured, and effective for an LLM to answer accurately.

Rules:
- Preserve the user's intent exactly
- Add specificity where the original is vague
- Structure multi-part questions clearly
- Do NOT answer the question — only rewrite the prompt
- Return ONLY the improved prompt, nothing else`

export function OptimizerConfig({ providerId }: { providerId: string }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [optimizerProviderId, setOptimizerProviderId] = useState('')
  const [optimizerModel, setOptimizerModel] = useState('')
  const [targetProviderId, setTargetProviderId] = useState('')
  const [targetModel, setTargetModel] = useState('')
  const [optimizationPrompt, setOptimizationPrompt] = useState(DEFAULT_OPTIMIZATION_PROMPT)
  const [additionalContext, setAdditionalContext] = useState('')

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: listProviders,
  })

  const { data: existingConfig } = useQuery({
    queryKey: ['optimizer-config', providerId],
    queryFn: () => getOptimizerConfig(providerId),
    enabled: !!providerId,
    retry: false,
  })

  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true)
      try {
        if (existingConfig) {
          setOptimizerProviderId(existingConfig.optimizer_provider_id || '')
          setOptimizerModel(existingConfig.optimizer_model || '')
          setTargetProviderId(existingConfig.target_provider_id || '')
          setTargetModel(existingConfig.target_model || '')
          setOptimizationPrompt(existingConfig.optimization_prompt || DEFAULT_OPTIMIZATION_PROMPT)
          setAdditionalContext(existingConfig.additional_context || '')
        } else {
          setOptimizerProviderId('')
          setOptimizerModel('')
          setTargetProviderId('')
          setTargetModel('')
          setOptimizationPrompt(DEFAULT_OPTIMIZATION_PROMPT)
          setAdditionalContext('')
        }
        setError(null)
      } catch (e: unknown) {
        const err = e as { response?: { data?: { detail?: string } }; message?: string }
        setError(err?.response?.data?.detail ?? err?.message ?? 'Failed to load config')
      } finally {
        setLoading(false)
      }
    }
    loadConfig()
  }, [existingConfig])

  const handleSave = async () => {
    if (!optimizerProviderId || !optimizerModel) {
      setError('Optimizer provider and model are required')
      return
    }

    if (!targetProviderId || !targetModel) {
      setError('Target provider and model are required')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await updateOptimizerConfig(providerId, {
        optimizer_provider_id: optimizerProviderId,
        optimizer_model: optimizerModel,
        target_provider_id: targetProviderId,
        target_model: targetModel,
        optimization_prompt: optimizationPrompt,
        additional_context: additionalContext || undefined,
      })
      qc.invalidateQueries({ queryKey: ['optimizer-config', providerId] })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      setError(err?.response?.data?.detail ?? err?.message ?? 'Failed to save config')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span className="text-xs text-muted-foreground">Loading optimizer configuration...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-2">
      {error && <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-700 border border-destructive/20">{error}</div>}

      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3">
        <p className="text-[10px] text-indigo-700 dark:text-indigo-300">
          The optimizer improves user prompts before sending them to the target LLM. First, the optimizer model rewrites the prompt, then the target model answers the optimized prompt.
        </p>
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">Optimizer Provider</label>
        <select
          value={optimizerProviderId}
          onChange={(e) => setOptimizerProviderId(e.target.value)}
          className="input text-sm w-full"
        >
          <option value="">Select provider...</option>
          {providers?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground mt-1">The LLM that will improve user prompts</p>
      </div>

      {optimizerProviderId && (
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Optimizer Model</label>
          <input
            type="text"
            placeholder="e.g. gpt-4o-mini"
            value={optimizerModel}
            onChange={(e) => setOptimizerModel(e.target.value)}
            className="input text-sm w-full"
          />
        </div>
      )}

      <div className="border-t border-border/50 pt-4">
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">Target Provider</label>
        <select
          value={targetProviderId}
          onChange={(e) => setTargetProviderId(e.target.value)}
          className="input text-sm w-full"
        >
          <option value="">Select provider...</option>
          {providers?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground mt-1">The LLM that will answer the optimized prompt</p>
      </div>

      {targetProviderId && (
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Target Model</label>
          <input
            type="text"
            placeholder="e.g. claude-sonnet-4-20250514"
            value={targetModel}
            onChange={(e) => setTargetModel(e.target.value)}
            className="input text-sm w-full"
          />
        </div>
      )}

      <div className="border-t border-border/50 pt-4 space-y-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Optimization Prompt</label>
          <textarea
            value={optimizationPrompt}
            onChange={(e) => setOptimizationPrompt(e.target.value)}
            className="input text-sm w-full min-h-24 font-mono text-[10px]"
          />
          <p className="text-[10px] text-muted-foreground mt-1">System prompt for the optimizer. Use {'{user_prompt}'} to reference the original prompt.</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Additional Context (optional)</label>
          <textarea
            placeholder="Optional context to provide alongside the user's prompt..."
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            className="input text-sm w-full min-h-16"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button className="btn-primary flex-1 justify-center py-2.5" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save Optimizer Configuration'}
        </button>
      </div>
    </div>
  )
}
