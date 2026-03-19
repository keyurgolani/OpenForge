import { useState } from 'react';
import { cn } from '@/lib/utils';
import ImportTab from './ImportTab';
import ExportTab from './ExportTab';

const TABS = [
  { id: 'import', label: 'Import' },
  { id: 'export', label: 'Export' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function DataPage() {
  const [activeTab, setActiveTab] = useState<TabId>('import');

  return (
    <div className="p-6 space-y-6">
      <div className="flex gap-1 border-b border-border/40">
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
      {activeTab === 'import' && <ImportTab />}
      {activeTab === 'export' && <ExportTab />}
    </div>
  );
}

export default DataPage;
