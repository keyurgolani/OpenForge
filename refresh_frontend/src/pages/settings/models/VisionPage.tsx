import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { listSettings, updateSetting, listProviders, listModels } from '@/lib/api'
import { useToast } from '@/components/shared/ToastProvider'

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function VisionPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [selectedModel, setSelectedModel] = useState('')

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: listSettings,
  })

  const providersQuery = useQuery({
    queryKey: ['providers'],
    queryFn: listProviders,
  })

  const providers: any[] = providersQuery.data?.providers ?? providersQuery.data ?? []
  const defaultProvider = providers.find((p: any) => p.is_default) ?? providers[0]

  const modelsQuery = useQuery({
    queryKey: ['provider-models', defaultProvider?.id],
    queryFn: () => listModels(defaultProvider.id),
    enabled: !!defaultProvider?.id,
  })

  const models: any[] = modelsQuery.data?.models ?? modelsQuery.data ?? []

  // Load current setting
  useEffect(() => {
    if (settingsQuery.data) {
      const settings = settingsQuery.data?.settings ?? settingsQuery.data ?? []
      const visionSetting = Array.isArray(settings)
        ? settings.find((s: any) => s.key === 'vision_model')
        : settings.vision_model
      if (visionSetting) {
        setSelectedModel(visionSetting.value ?? visionSetting ?? '')
      }
    }
  }, [settingsQuery.data])

  const saveMut = useMutation({
    mutationFn: () =>
      updateSetting('vision_model', { value: selectedModel, category: 'models' }),
    onSuccess: () => {
      toast.success('Vision model updated')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err: any) => toast.error('Save failed', err?.response?.data?.detail ?? err.message),
  })

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-base font-semibold text-fg">Vision Model</h3>
        <p className="text-sm text-fg-muted">
          Select the model used for image understanding, visual analysis, and multimodal tasks.
        </p>
      </div>

      <div className="rounded-lg border border-border/40 bg-bg-elevated p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary/10">
            <Eye className="h-6 w-6 text-secondary" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h4 className="font-label text-sm font-medium text-fg">Primary Vision Model</h4>
              <p className="mt-0.5 text-xs text-fg-muted">
                This model handles image analysis, screenshot understanding, and visual question
                answering. Choose a model with vision capabilities (e.g. GPT-4o, Claude 3.5 Sonnet).
              </p>
            </div>

            <div className="space-y-2">
              <label className="font-label text-xs font-medium text-fg-muted">Model</label>
              {providersQuery.isLoading || modelsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-fg-muted py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading models...
                </div>
              ) : (
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className={cn(
                    'w-full max-w-md rounded-lg border border-border bg-bg py-2.5 px-3',
                    'font-mono text-sm text-fg',
                    'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                  )}
                >
                  <option value="">Select a model...</option>
                  {models.map((model: any) => {
                    const id = model.id ?? model.model_id ?? model.name
                    return (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    )
                  })}
                </select>
              )}
            </div>

            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !selectedModel}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
                'text-sm font-medium text-fg-on-primary',
                'hover:bg-primary-hover disabled:opacity-50 transition-colors',
              )}
            >
              {saveMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
