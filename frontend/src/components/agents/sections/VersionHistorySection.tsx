import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import AccordionSection from './AccordionSection'
import { listAgentVersions } from '@/lib/api'
import type { AgentDefinitionVersion } from '@/types/agents'

interface VersionHistorySectionProps {
  agentId: string | undefined
  onViewVersion: (versionId: string) => void
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)

  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export default function VersionHistorySection({
  agentId,
  onViewVersion,
}: VersionHistorySectionProps) {
  const [versions, setVersions] = useState<AgentDefinitionVersion[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!agentId) {
      setVersions([])
      return
    }
    setLoading(true)
    listAgentVersions(agentId, { limit: 20 })
      .then((data) => {
        setVersions(data.versions ?? [])
      })
      .catch(() => setVersions([]))
      .finally(() => setLoading(false))
  }, [agentId])

  const latestVersion = versions[0]
  const summary = latestVersion
    ? `v${latestVersion.version} · ${timeAgo(latestVersion.created_at)}`
    : 'No versions'

  return (
    <AccordionSection title="Version History" summary={summary} icon={History}>
      {loading ? (
        <div className="py-2 text-xs text-muted-foreground">Loading...</div>
      ) : versions.length === 0 ? (
        <div className="py-2 text-xs text-muted-foreground">
          {agentId ? 'No versions saved yet' : 'Save to create a version'}
        </div>
      ) : (
        <div className="space-y-1">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onViewVersion(v.id)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/40"
            >
              <span className="text-xs font-medium text-foreground/80">
                v{v.version}
              </span>
              <span className="text-[11px] text-muted-foreground/70">
                {timeAgo(v.created_at)}
              </span>
            </button>
          ))}
        </div>
      )}
    </AccordionSection>
  )
}
