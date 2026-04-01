import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PipelinesSubTab } from './jobs/PipelinesSubTab'
import { SchedulesTab } from './jobs/SchedulesTab'
import { AutomatedTriggersTab, IndexingJobsTab } from './JobsTab'
import { JobHistorySubTab, ToolCallLogsSubTab, HITLHistorySubTab } from './audit/HistorySubTabs'
import { ContainerLogsSubTab } from './audit/ContainerLogsSubTab'

type AdvancedSection =
  | 'pipelines' | 'schedules' | 'automated-triggers' | 'indexing'
  | 'job-history' | 'tool-calls' | 'approval-history' | 'container-logs'

interface CategoryGroup {
  label: string
  items: { id: AdvancedSection; label: string }[]
}

const CATEGORIES: CategoryGroup[] = [
  {
    label: 'Pipelines',
    items: [
      { id: 'pipelines', label: 'Pipelines' },
      { id: 'schedules', label: 'Scheduled' },
      { id: 'automated-triggers', label: 'Automated Triggers' },
      { id: 'indexing', label: 'Indexing' },
    ],
  },
  {
    label: 'Audit',
    items: [
      { id: 'job-history', label: 'Job History' },
      { id: 'tool-calls', label: 'Tool Calls' },
      { id: 'approval-history', label: 'Approval History' },
      { id: 'container-logs', label: 'Container Logs' },
    ],
  },
]

const SECTION_COMPONENTS: Record<AdvancedSection, React.ComponentType> = {
  'pipelines': PipelinesSubTab,
  'schedules': SchedulesTab,
  'automated-triggers': AutomatedTriggersTab,
  'indexing': IndexingJobsTab,
  'job-history': JobHistorySubTab,
  'tool-calls': ToolCallLogsSubTab,
  'approval-history': HITLHistorySubTab,
  'container-logs': ContainerLogsSubTab,
}

export function AdvancedPage() {
  const [selected, setSelected] = useState<AdvancedSection>('pipelines')
  const Content = SECTION_COMPONENTS[selected]

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-64 flex-shrink-0 border-r border-border/25 overflow-y-auto p-4">
        {CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 pt-3 pb-1">
              {cat.label}
            </div>
            <div className="space-y-0.5">
              {cat.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                    selected === item.id
                      ? 'bg-accent/15 text-accent'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        <Content />
      </div>
    </div>
  )
}

export default AdvancedPage
