import { useState } from 'react';
import { cn } from '@/lib/utils';
import JobsTab from './JobsTab';
import AuditTab from './AuditTab';

const TABS = [
  { id: 'pipelines', label: 'Pipelines' },
  { id: 'audit', label: 'Audit' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function AdvancedPage() {
  const [activeTab, setActiveTab] = useState<TabId>('pipelines');

  return (
    <div className="p-6 space-y-6">
      <div className="flex gap-1 border-b border-border/60">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'pipelines' && <JobsTab />}
      {activeTab === 'audit' && <AuditTab />}
    </div>
  );
}

export default AdvancedPage;
