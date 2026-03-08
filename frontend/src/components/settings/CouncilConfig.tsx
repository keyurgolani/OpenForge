import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCouncilConfig, createCouncilConfig, updateCouncilConfig, listProviders } from '@/lib/api'
import { Loader2, Plus, Trash2, Save, X } from 'lucide-react'

interface CouncilMember {
  llmProviderId: string
  model: string
  displayLabel?: string
}

interface CouncilConfigData {
  chairmanProviderId: string
  chairmanModel: string
  members: CouncilMember[]
  judgingPrompt?: string
  parallelExecution?: boolean
}

export function CouncilConfig({ providerId }: { providerId: string }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chairmanProviderId, setChairmanProviderId] = useState('')
  const [chairmanModel, setChairmanModel] = useState('')
  const [members, setMembers] = useState<CouncilMember[]>([])
  const [judgingPrompt, setJudgingPrompt] = useState('')
  const [parallelExecution, setParallelExecution] = useState(true)

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: listProviders,
  })

  const { data: existingConfig } = useQuery({
    queryKey: ['council-config', providerId],
    queryFn: () => getCouncilConfig(providerId),
    enabled: !!providerId,
    retry: false,
  })

  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true)
      try {
        if (existingConfig) {
          setChairmanProviderId(existingConfig.chairman_provider_id || '')
          setChairmanModel(existingConfig.chairman_model || '')
          setMembers(existingConfig.members || [])
          setJudgingPrompt(existingConfig.judging_prompt || '')
          setParallelExecution(existingConfig.parallel_execution !== false)
        } else {
          setChairmanProviderId('')
          setChairmanModel('')
          setMembers([])
          setJudgingPrompt('')
          setParallelExecution(true)
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

  const addMember = () => {
    setMembers([...members, { llmProviderId: '', model: '', displayLabel: '' }])
  }

  const removeMember = (idx: number) => {
    setMembers(members.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!chairmanProviderId || !chairmanModel) {
      setError('Chairperson provider and model are required')
      return
    }

    if (members.length === 0) {
      setError('At least one council member is required')
      return
    }

    const incompleteMember = members.find((m) => !m.llmProviderId || !m.model)
    if (incompleteMember) {
      setError('All council members must have a provider and model')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await updateCouncilConfig(providerId, {
        chairman_provider_id: chairmanProviderId,
        chairman_model: chairmanModel,
        members: members.map((m) => ({
          llm_provider_id: m.llmProviderId,
          model: m.model,
          display_label: m.displayLabel || m.model,
        })),
        judging_prompt: judgingPrompt || undefined,
        parallel_execution: parallelExecution,
      })
      qc.invalidateQueries({ queryKey: ['council-config', providerId] })
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
        <span className="text-xs text-muted-foreground">Loading council configuration...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-2">
      {error && <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-700 border border-destructive/20">{error}</div>}

      <div>
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">Chairperson Provider</label>
        <select
          value={chairmanProviderId}
          onChange={(e) => setChairmanProviderId(e.target.value)}
          className="input text-sm w-full"
        >
          <option value="">Select provider...</option>
          {providers?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground mt-1">The LLM that will judge council responses and select the best one</p>
      </div>

      {chairmanProviderId && (
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1.5">Chairperson Model</label>
          <input
            type="text"
            placeholder="e.g. gpt-4o"
            value={chairmanModel}
            onChange={(e) => setChairmanModel(e.target.value)}
            className="input text-sm w-full"
          />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground font-medium">Council Members</label>
          <button
            onClick={addMember}
            className="text-[10px] px-2 py-1 rounded hover:bg-muted/50 transition-colors flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        {members.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">No council members added yet</p>
        ) : (
          members.map((member, idx) => (
            <div key={idx} className="p-2.5 rounded-lg border border-border/50 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-muted-foreground">Member {idx + 1}</span>
                <button
                  onClick={() => removeMember(idx)}
                  className="text-[10px] text-destructive hover:bg-destructive/10 p-1 rounded transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Provider</label>
                  <select
                    value={member.llmProviderId}
                    onChange={(e) => {
                      const newMembers = [...members]
                      newMembers[idx].llmProviderId = e.target.value
                      setMembers(newMembers)
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
                    value={member.model}
                    onChange={(e) => {
                      const newMembers = [...members]
                      newMembers[idx].model = e.target.value
                      setMembers(newMembers)
                    }}
                    className="input text-sm w-full"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Display Label (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Fast Responder"
                  value={member.displayLabel || ''}
                  onChange={(e) => {
                    const newMembers = [...members]
                    newMembers[idx].displayLabel = e.target.value
                    setMembers(newMembers)
                  }}
                  className="input text-sm w-full"
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">Custom Judging Prompt (optional)</label>
        <textarea
          placeholder="Instructions for the chairperson on how to judge responses..."
          value={judgingPrompt}
          onChange={(e) => setJudgingPrompt(e.target.value)}
          className="input text-sm w-full min-h-20"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="parallel"
          checked={parallelExecution}
          onChange={(e) => setParallelExecution(e.target.checked)}
          className="rounded border border-input"
        />
        <label htmlFor="parallel" className="text-xs text-muted-foreground cursor-pointer">
          Execute all members in parallel (faster but may use more API quota)
        </label>
      </div>

      <div className="flex gap-2">
        <button className="btn-primary flex-1 justify-center py-2.5" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save Council Configuration'}
        </button>
      </div>
    </div>
  )
}
