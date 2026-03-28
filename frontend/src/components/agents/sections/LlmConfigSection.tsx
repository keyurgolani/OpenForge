import { useEffect, useState } from 'react'
import { Cpu } from 'lucide-react'
import AccordionSection from './AccordionSection'
import { listProviders, listModels } from '@/lib/api'
import type { LlmConfig } from '@/types/agents'

interface LlmConfigSectionProps {
  value: LlmConfig
  onChange: (config: LlmConfig) => void
  isEditing: boolean
  expanded?: boolean
  onToggle?: () => void
}

interface ProviderOption {
  id: string
  provider_name: string
}

interface ModelOption {
  id: string
  name: string
  capability_type?: string | null
}

export default function LlmConfigSection({
  value,
  onChange,
  isEditing,
  expanded,
  onToggle,
}: LlmConfigSectionProps) {
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [models, setModels] = useState<ModelOption[]>([])

  useEffect(() => {
    listProviders()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.providers ?? []
        setProviders(list)
      })
      .catch(() => setProviders([]))
  }, [])

  useEffect(() => {
    if (!value.provider) {
      setModels([])
      return
    }
    listModels(value.provider)
      .then((data) => {
        const list: ModelOption[] = Array.isArray(data) ? data : data?.models ?? []
        // Filter to only chat/LLM-capable models — exclude stt, tts, embedding, clip, pdf
        const NON_CHAT_TYPES = new Set(['stt', 'tts', 'embedding', 'clip', 'pdf'])
        const chatModels = list.filter(
          (m) => !m.capability_type || !NON_CHAT_TYPES.has(m.capability_type),
        )
        setModels(chatModels)
      })
      .catch(() => setModels([]))
  }, [value.provider])

  const providerLabel =
    providers.find((p) => p.id === value.provider)?.provider_name ?? null
  const summary =
    value.model && value.provider
      ? `${value.model} · ${(value.temperature ?? 0.7).toFixed(1)}`
      : 'System default'

  const update = (patch: Partial<LlmConfig>) => onChange({ ...value, ...patch })

  return (
    <AccordionSection
      title="LLM"
      summary={summary}
      icon={Cpu}
      isEditing={isEditing}
      expanded={expanded}
      onToggle={onToggle}
    >
      {isEditing ? (
        <div className="space-y-3 text-sm">
          {/* Provider */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Provider
            </label>
            <select
              value={value.provider ?? ''}
              onChange={(e) =>
                update({
                  provider: e.target.value || null,
                  model: null,
                })
              }
              className="w-full rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent/60"
            >
              <option value="">System default</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.provider_name}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Model
            </label>
            <select
              value={value.model ?? ''}
              onChange={(e) => update({ model: e.target.value || null })}
              disabled={!value.provider}
              className="w-full rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent/60 disabled:opacity-50"
            >
              <option value="">Select model</option>
              {models.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Temperature{' '}
              <span className="text-muted-foreground/80">
                ({(value.temperature ?? 0.7).toFixed(1)})
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={value.temperature}
              onChange={(e) =>
                update({ temperature: Math.round(parseFloat(e.target.value) * 10) / 10 })
              }
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/80">
              <span>0</span>
              <span>2</span>
            </div>
          </div>

          {/* Max tokens */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Max tokens
            </label>
            <input
              type="number"
              min={1}
              max={200000}
              value={value.max_tokens}
              onChange={(e) =>
                update({ max_tokens: parseInt(e.target.value, 10) || 1 })
              }
              className="w-full rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent/60"
            />
          </div>

          {/* Allow override */}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={value.allow_override}
              onChange={(e) => update({ allow_override: e.target.checked })}
              className="rounded accent-accent"
            />
            <span className="text-muted-foreground">
              Allow per-run override
            </span>
          </label>
        </div>
      ) : (
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground/80">Provider:</span>{' '}
            {providerLabel ?? 'System default'}
          </div>
          <div>
            <span className="font-medium text-foreground/80">Model:</span>{' '}
            {value.model ?? 'Default'}
          </div>
          <div>
            <span className="font-medium text-foreground/80">Temperature:</span>{' '}
            {(value.temperature ?? 0.7).toFixed(1)}
          </div>
          <div>
            <span className="font-medium text-foreground/80">Max tokens:</span>{' '}
            {(value.max_tokens ?? 2000).toLocaleString()}
          </div>
          <div>
            <span className="font-medium text-foreground/80">Override:</span>{' '}
            {value.allow_override ? 'Allowed' : 'Disabled'}
          </div>
        </div>
      )}
    </AccordionSection>
  )
}
