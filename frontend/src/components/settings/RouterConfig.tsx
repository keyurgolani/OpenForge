import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouterConfig, createRouterConfig, updateRouterConfig, listEndpoints } from '@/lib/api'
import { Loader2, Save } from 'lucide-react'

interface Tier {
  complexityLevel: string
  endpointId: string
  priority: number
}

const TIERS = [
  { name: 'Simple', level: '0-0.25' },
  { name: 'Moderate', level: '0.25-0.5' },
  { name: 'Complex', level: '0.5-0.75' },
  { name: 'Expert', level: '0.75-1.0' },
]

export function RouterConfig({ vpId }: { vpId: string }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [routingEndpointId, setRoutingEndpointId] = useState('')
  const [routingPrompt, setRoutingPrompt] = useState('')
  const [tiers, setTiers] = useState<Tier[]>([])

  const { data: endpoints } = useQuery({
    queryKey: ['endpoints'],
    queryFn: listEndpoints,
  })

  const { data: existingConfig } = useQuery({
    queryKey: ['router-config', vpId],
    queryFn: () => getRouterConfig(vpId),
    enabled: !!vpId,
    retry: false,
  })

  useEffect(() => {
    setLoading(true)
    if (existingConfig) {
      setRoutingEndpointId(existingConfig.routing_endpoint_id || '')
      setRoutingPrompt(existingConfig.routing_prompt || '')
      const loadedTiers = (existingConfig.tiers || []).map((t: any) => ({
        complexityLevel: t.complexity_level,
        endpointId: t.endpoint_id,
        priority: t.priority || 0,
      }))
      // Fill in missing tiers with defaults
      const tierMap = new Map<string, Tier>(loadedTiers.map((t: Tier) => [t.complexityLevel, t]))
      setTiers(TIERS.map((t): Tier => tierMap.get(t.level) ?? { complexityLevel: t.level, endpointId: '', priority: 0 }))
    } else {
      setRoutingEndpointId('')
      setRoutingPrompt('')
      setTiers(TIERS.map(t => ({ complexityLevel: t.level, endpointId: '', priority: 0 })))
    }
    setError(null)
    setLoading(false)
  }, [existingConfig])

  const handleSave = async () => {
    if (!routingEndpointId) {
      setError('Routing endpoint is required')
      return
    }

    const incompleteTier = tiers.find(t => !t.endpointId)
    if (incompleteTier) {
      setError('All tiers must have an endpoint selected')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const payload = {
        routing_endpoint_id: routingEndpointId,
        routing_prompt: routingPrompt || undefined,
        tiers: tiers.map(t => ({
          complexity_level: t.complexityLevel,
          endpoint_id: t.endpointId,
          priority: t.priority,
        })),
      }
      if (existingConfig) {
        await updateRouterConfig(vpId, payload)
      } else {
        await createRouterConfig(vpId, payload)
      }
      qc.invalidateQueries({ queryKey: ['router-config', vpId] })
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
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">Routing Endpoint</label>
        <select
          value={routingEndpointId}
          onChange={(e) => setRoutingEndpointId(e.target.value)}
          className="input text-sm w-full"
        >
          <option value="">Select endpoint...</option>
          {endpoints?.map((ep: any) => (
            <option key={ep.id} value={ep.id}>
              {ep.display_name || `${ep.provider_display_name || ep.virtual_display_name} / ${ep.model_id || ep.virtual_type}`}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground mt-1">The endpoint that will score prompt complexity and route requests</p>
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">Custom Routing Prompt (optional)</label>
        <textarea
          placeholder="Custom instructions for complexity classification..."
          value={routingPrompt}
          onChange={(e) => setRoutingPrompt(e.target.value)}
          className="input text-sm w-full min-h-16"
        />
      </div>

      <div className="space-y-3">
        <label className="text-xs text-muted-foreground font-medium block">Routing Tiers</label>
        {tiers.map((tier, idx) => {
          const tierInfo = TIERS[idx]
          return (
            <div key={idx} className="p-2.5 rounded-lg border border-border/50 space-y-2">
              <span className="text-xs font-medium">
                {tierInfo.name} ({tierInfo.level})
              </span>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Target Endpoint</label>
                <select
                  value={tier.endpointId}
                  onChange={(e) => {
                    const newTiers = [...tiers]
                    newTiers[idx] = { ...newTiers[idx], endpointId: e.target.value }
                    setTiers(newTiers)
                  }}
                  className="input text-sm w-full"
                >
                  <option value="">Select endpoint...</option>
                  {endpoints?.map((ep: any) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.display_name || `${ep.provider_display_name || ep.virtual_display_name} / ${ep.model_id || ep.virtual_type}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <button className="btn-primary flex-1 justify-center py-2.5" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Router Configuration'}
        </button>
      </div>
    </div>
  )
}
