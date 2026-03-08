import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCouncilConfig, createCouncilConfig, updateCouncilConfig, listEndpoints } from '@/lib/api'
import { Loader2, Plus, Trash2, Save } from 'lucide-react'

interface CouncilMember {
  endpointId: string
  displayLabel?: string
}

export function CouncilConfig({ vpId }: { vpId: string }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chairmanEndpointId, setChairmanEndpointId] = useState('')
  const [members, setMembers] = useState<CouncilMember[]>([])
  const [judgingPrompt, setJudgingPrompt] = useState('')
  const [parallelExecution, setParallelExecution] = useState(true)

  const { data: endpoints } = useQuery({
    queryKey: ['endpoints'],
    queryFn: listEndpoints,
  })

  const { data: existingConfig } = useQuery({
    queryKey: ['council-config', vpId],
    queryFn: () => getCouncilConfig(vpId),
    enabled: !!vpId,
    retry: false,
  })

  useEffect(() => {
    setLoading(true)
    if (existingConfig) {
      setChairmanEndpointId(existingConfig.chairman_endpoint_id || '')
      setMembers(
        (existingConfig.members || []).map((m: any) => ({
          endpointId: m.endpoint_id,
          displayLabel: m.display_label || '',
        }))
      )
      setJudgingPrompt(existingConfig.judging_prompt || '')
      setParallelExecution(existingConfig.parallel_execution !== false)
    } else {
      setChairmanEndpointId('')
      setMembers([])
      setJudgingPrompt('')
      setParallelExecution(true)
    }
    setError(null)
    setLoading(false)
  }, [existingConfig])

  const addMember = () => {
    setMembers([...members, { endpointId: '', displayLabel: '' }])
  }

  const removeMember = (idx: number) => {
    setMembers(members.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!chairmanEndpointId) {
      setError('Chairperson endpoint is required')
      return
    }

    if (members.length === 0) {
      setError('At least one council member is required')
      return
    }

    const incompleteMember = members.find(m => !m.endpointId)
    if (incompleteMember) {
      setError('All council members must have an endpoint selected')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const payload = {
        chairman_endpoint_id: chairmanEndpointId,
        members: members.map(m => ({
          endpoint_id: m.endpointId,
          display_label: m.displayLabel || undefined,
        })),
        judging_prompt: judgingPrompt || undefined,
        parallel_execution: parallelExecution,
      }
      if (existingConfig) {
        await updateCouncilConfig(vpId, payload)
      } else {
        await createCouncilConfig(vpId, payload)
      }
      qc.invalidateQueries({ queryKey: ['council-config', vpId] })
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

  const endpointLabel = (ep: any) =>
    ep.display_name || `${ep.provider_display_name || ep.virtual_display_name} / ${ep.model_id || ep.virtual_type}`

  return (
    <div className="space-y-4 pt-2">
      {error && <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-700 border border-destructive/20">{error}</div>}

      <div>
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">Chairperson Endpoint</label>
        <select
          value={chairmanEndpointId}
          onChange={(e) => setChairmanEndpointId(e.target.value)}
          className="input text-sm w-full"
        >
          <option value="">Select endpoint...</option>
          {endpoints?.map((ep: any) => (
            <option key={ep.id} value={ep.id}>{endpointLabel(ep)}</option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground mt-1">The endpoint that will judge council responses and select the best one</p>
      </div>

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
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Endpoint</label>
                <select
                  value={member.endpointId}
                  onChange={(e) => {
                    const newMembers = [...members]
                    newMembers[idx] = { ...newMembers[idx], endpointId: e.target.value }
                    setMembers(newMembers)
                  }}
                  className="input text-sm w-full"
                >
                  <option value="">Select endpoint...</option>
                  {endpoints?.map((ep: any) => (
                    <option key={ep.id} value={ep.id}>{endpointLabel(ep)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Display Label (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Fast Responder"
                  value={member.displayLabel || ''}
                  onChange={(e) => {
                    const newMembers = [...members]
                    newMembers[idx] = { ...newMembers[idx], displayLabel: e.target.value }
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
          {saving ? 'Saving...' : 'Save Council Configuration'}
        </button>
      </div>
    </div>
  )
}
