import { useState } from 'react';
import { cn } from '@/lib/utils';
import ToolsTab from './ToolsTab';
import SkillsTab from './SkillsTab';
import MCPTab from './MCPTab';

const TABS = [
  { id: 'tools', label: 'Tools' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP Servers' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function ToolsAndConnectionsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('tools');

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
      {activeTab === 'tools' && <ToolsTab />}
      {activeTab === 'skills' && <SkillsTab />}
      {activeTab === 'mcp' && <MCPTab />}
    </div>
  );
}

export default ToolsAndConnectionsPage;
