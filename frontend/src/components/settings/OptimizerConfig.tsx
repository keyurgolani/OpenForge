import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getOptimizerConfig, createOptimizerConfig, updateOptimizerConfig, listEndpoints } from '@/lib/api'
import { Loader2, Save } from 'lucide-react'

const DEFAULT_OPTIMIZATION_PROMPT = `You are a prompt optimization expert. Rewrite the following user prompt to be more specific, well-structured, and effective for an LLM to answer accurately.

Rules:
- Preserve the user's intent exactly
- Add specificity where the original is vague
- Structure multi-part questions clearly
- Do NOT answer the question — only rewrite the prompt
- Return ONLY the improved prompt, nothing else`

export function OptimizerConfig({ vpId }: { vpId: string }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [optimizerEndpointId, setOptimizerEndpointId] = useState('')
  const [targetEndpointId, setTargetEndpointId] = useState('')
  const [optimizationPrompt, setOptimizationPrompt] = useState(DEFAULT_OPTIMIZATION_PROMPT)
  const [additionalContext, setAdditionalContext] = useState('')

  const { data: endpoints } = useQuery({
    queryKey: ['endpoints'],
    queryFn: listEndpoints,
  })

  const { data: existingConfig } = useQuery({
    queryKey: ['optimizer-config', vpId],
    queryFn: () => getOptimizerConfig(vpId),
    enabled: !!vpId,
    retry: false,
  })

  useEffect(() => {
    setLoading(true)
    if (existingConfig) {
      setOptimizerEndpointId(existingConfig.optimizer_endpoint_id || '')
      setTargetEndpointId(existingConfig.target_endpoint_id || '')
      setOptimizationPrompt(existingConfig.optimization_prompt || DEFAULT_OPTIMIZATION_PROMPT)
      setAdditionalContext(existingConfig.additional_context || '')
    } else {
      setOptimizerEndpointId('')
      setTargetEndpointId('')
      setOptimizationPrompt(DEFAULT_OPTIMIZATION_PROMPT)
      setAdditionalContext('')
    }
    setError(null)
    setLoading(false)
  }, [existingConfig])

  const handleSave = async () => {
    if (!optimizerEndpointId) {
      setError('Optimizer endpoint is required')
      return
    }

    if (!targetEndpointId) {
      setError('Target endpoint is required')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const payload = {
        optimizer_endpoint_id: optimizerEndpointId,
        target_endpoint_id: targetEndpointId,
        optimization_prompt: optimizationPrompt,
        additional_context: additionalContext || undefined,
      }
      if (existingConfig) {
        await updateOptimizerConfig(vpId, payload)
      } else {
        await createOptimizerConfig(vpId, payload)
      }
      qc.invalidateQueries({ queryKey: ['optimizer-config', vpId] })
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

  const endpointLabel = (ep: any) =>
    ep.display_name || `${ep.provider_display_name || ep.virtual_display_name} / ${ep.model_id || ep.virtual_type}`

  return (
    <div className="space-y-4 pt-2">
      {error && <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-700 border border-destructive/20">{error}</div>}

      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3">
        <p className="text-[10px] text-indigo-700 dark:text-indigo-300">
          The optimizer improves user prompts before sending them to the target endpoint. First, the optimizer endpoint rewrites the prompt, then the target endpoint answers the optimized prompt.
        </p>
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">Optimizer Endpoint</label>
        <select
          value={optimizerEndpointId}
          onChange={(e) => setOptimizerEndpointId(e.target.value)}
          className="input text-sm w-full"
        >
          <option value="">Select endpoint...</option>
          {endpoints?.map((ep: any) => (
            <option key={ep.id} value={ep.id}>{endpointLabel(ep)}</option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground mt-1">The endpoint that will improve user prompts</p>
      </div>

      <div className="border-t border-border/50 pt-4">
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">Target Endpoint</label>
        <select
          value={targetEndpointId}
          onChange={(e) => setTargetEndpointId(e.target.value)}
          className="input text-sm w-full"
        >
          <option value="">Select endpoint...</option>
          {endpoints?.map((ep: any) => (
            <option key={ep.id} value={ep.id}>{endpointLabel(ep)}</option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground mt-1">The endpoint that will answer the optimized prompt</p>
      </div>

      <div className="border-t border-border/50 pt-4 space-y-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Optimization Prompt</label>
          <textarea
            value={optimizationPrompt}
            onChange={(e) => setOptimizationPrompt(e.target.value)}
            className="input text-sm w-full min-h-24 font-mono text-[10px]"
          />
          <p className="text-[10px] text-muted-foreground mt-1">System prompt for the optimizer. Use {'{original_prompt}'} to reference the original prompt.</p>
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
          {saving ? 'Saving...' : 'Save Optimizer Configuration'}
        </button>
      </div>
    </div>
  )
}
