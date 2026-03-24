import { Database } from 'lucide-react'
import AccordionSection from './AccordionSection'
import type { MemoryConfig } from '@/types/agents'

interface MemoryConfigSectionProps {
  value: MemoryConfig
  onChange: (config: MemoryConfig) => void
  isEditing: boolean
  expanded?: boolean
  onToggle?: () => void
}

export default function MemoryConfigSection({
  value,
  onChange,
  isEditing,
  expanded,
  onToggle,
}: MemoryConfigSectionProps) {
  const summary = `${value.history_limit} messages`

  const update = (patch: Partial<MemoryConfig>) =>
    onChange({ ...value, ...patch })

  return (
    <AccordionSection
      title="Memory"
      summary={summary}
      icon={Database}
      isEditing={isEditing}
      expanded={expanded}
      onToggle={onToggle}
    >
      {isEditing ? (
        <div className="space-y-3 text-sm">
          {/* History limit */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              History limit
            </label>
            <input
              type="number"
              min={1}
              max={1000}
              value={value.history_limit}
              onChange={(e) =>
                update({
                  history_limit: parseInt(e.target.value, 10) || 1,
                })
              }
              className="w-full rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent/60"
            />
          </div>

          {/* Attachment support */}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={value.attachment_support}
              onChange={(e) =>
                update({ attachment_support: e.target.checked })
              }
              className="rounded accent-accent"
            />
            <span className="text-muted-foreground">Attachment support</span>
          </label>

          {/* Auto-bookmark */}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={value.auto_bookmark_urls}
              onChange={(e) =>
                update({ auto_bookmark_urls: e.target.checked })
              }
              className="rounded accent-accent"
            />
            <span className="text-muted-foreground">
              Auto-bookmark URLs
            </span>
          </label>
        </div>
      ) : (
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground/80">
              History limit:
            </span>{' '}
            {value.history_limit} messages
          </div>
          <div>
            <span className="font-medium text-foreground/80">
              Attachments:
            </span>{' '}
            {value.attachment_support ? 'Enabled' : 'Disabled'}
          </div>
          <div>
            <span className="font-medium text-foreground/80">
              Auto-bookmark:
            </span>{' '}
            {value.auto_bookmark_urls ? 'Enabled' : 'Disabled'}
          </div>
        </div>
      )}
    </AccordionSection>
  )
}
