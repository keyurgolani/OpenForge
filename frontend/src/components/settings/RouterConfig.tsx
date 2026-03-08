import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getRouterConfig, createRouterConfig, updateRouterConfig, listProviders } from '@/lib/api'
import { Loader2, Plus, Trash2, Save } from 'lucide-react'

interface Tier {
  minScore: number
  maxScore: number
  providerId: string
  model: string
}

interface RouterConfigData {
  routingProviderId: string
  routingModel: string
  tiers: Tier[]
}

const TIERS = [
  { name: 'Simple', minScore: 0, maxScore: 0.25 },
  { name: 'Moderate', minScore: 0.25, maxScore: 0.5 },
  { name: 'Complex', minScore: 0.5, maxScore: 0.75 },
  { name: 'Expert', minScore: 0.75, maxScore: 1.0 },
]

export function RouterConfig({ providerId }: { providerId: string }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [routingProviderId, setRoutingProviderId] = useState('')
  const [routingModel, setRoutingModel] = useState('')
  const [tiers, setTiers] = useState<Tier[]>([])
  const [models, setModels] = useState<Map<string, { id: string; name: string }[]>>(new Map())

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: listProviders,
  })

  const { data: existingConfig } = useQuery({
    queryKey: ['router-config', providerId],
    queryFn: () => getRouterConfig(providerId),
    enabled: !!providerId,
    retry: false,
  })

  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true)
      try {
        if (existingConfig) {
          setRoutingProviderId(existingConfig.routing_provider_id || '')
          setRoutingModel(existingConfig.routing_model || '')
          setTiers(existingConfig.tiers || [])
        } else {
          setRoutingProviderId('')
          setRoutingModel('')
          setTiers(
            TIERS.map((t) => ({
              minScore: t.minScore,
              maxScore: t.maxScore,
              providerId: '',
              model: '',
            }))
          )
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
    if (!routingProviderId || !routingModel) {
      setError('Routing provider and model are required')
      return
    }

    const incompleteTier = tiers.find((t) => !t.providerId || !t.model)
    if (incompleteTier) {
      setError('All tiers must have a provider and model selected')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await updateRouterConfig(providerId, {
        routing_provider_id: routingProviderId,
        routing_model: routingModel,
        tiers: tiers.map((t) => ({
          complexity_level: `${t.minScore}-${t.maxScore}`,
          llm_provider_id: t.providerId,
          model: t.model,
          priority: 0,
        })),
      })
      qc.invalidateQueries({ queryKey: ['router-config', providerId] })
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
        <span className="text-xs text-muted-foreground">Loading router configuration...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-2">
      {error && <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-700 border border-destructive/20">{error}</div>}

      <div>
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">Routing Model Provider</label>
        <select
          value={routingProviderId}
          onChange={(e) => setRoutingProviderId(e.target.value)}
          className="input text-sm w-full"
        >
          <option value="">Select provider...</option>
          {providers?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground mt-1">The LLM that will score prompt complexity and route requests</p>
      </div>

      {routingProviderId && (
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Routing Model</label>
          <select value={routingModel} onChange={(e) => setRoutingModel(e.target.value)} className="input text-sm w-full">
            <option value="">Select model...</option>
            {/* Models would be fetched based on routingProviderId */}
            <option value="gpt-4o-mini">gpt-4o-mini (sample)</option>
          </select>
        </div>
      )}

      <div className="space-y-3">
        <label className="text-xs text-muted-foreground font-medium block">Routing Tiers</label>
        {tiers.map((tier, idx) => {
          const tierInfo = TIERS[idx]
          return (
            <div key={idx} className="p-2.5 rounded-lg border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">
                  {tierInfo.name} ({tierInfo.minScore.toFixed(2)} - {tierInfo.maxScore.toFixed(2)})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Provider</label>
                  <select
                    value={tier.providerId}
                    onChange={(e) => {
                      const newTiers = [...tiers]
                      newTiers[idx].providerId = e.target.value
                      setTiers(newTiers)
                    }}
                    className="input text-sm w-full"
                  >
                    <option value="">Select provider...</option>
                    {providers?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Model</label>
                  <input
                    type="text"
                    placeholder="e.g. gpt-4o"
                    value={tier.model}
                    onChange={(e) => {
                      const newTiers = [...tiers]
                      newTiers[idx].model = e.target.value
                      setTiers(newTiers)
                    }}
                    className="input text-sm w-full"
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <button className="btn-primary flex-1 justify-center py-2.5" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save Router Configuration'}
        </button>
      </div>
    </div>
  )
}
