import { useState } from 'react'
import { History, Zap, Wrench, ShieldAlert, Terminal } from 'lucide-react'
import { AgentExecutionsSubTab } from './audit/AgentExecutionsSubTab'
import { HITLHistorySubTab, JobHistorySubTab, ToolCallLogsSubTab } from './audit/HistorySubTabs'
import { ContainerLogsSubTab } from './audit/ContainerLogsSubTab'

function AuditTab() {
    const [subTab, setSubTab] = useState<'history' | 'agent-executions' | 'tool-calls' | 'hitl' | 'logs'>('history')

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-6">
            <div className="flex shrink-0 gap-2 p-1.5 glass-card w-full sm:w-fit rounded-xl overflow-x-auto">
                <button
                    onClick={() => setSubTab('history')}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 whitespace-nowrap ${subTab === 'history'
                        ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                >
                    <History className="w-4 h-4" /> Job History
                </button>
                <button
                    onClick={() => setSubTab('agent-executions')}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 whitespace-nowrap ${subTab === 'agent-executions'
                        ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                >
                    <Zap className="w-4 h-4" /> Agent Executions
                </button>
                <button
                    onClick={() => setSubTab('tool-calls')}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 whitespace-nowrap ${subTab === 'tool-calls'
                        ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                >
                    <Wrench className="w-4 h-4" /> Tool Calls
                </button>
                <button
                    onClick={() => setSubTab('hitl')}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 whitespace-nowrap ${subTab === 'hitl'
                        ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                >
                    <ShieldAlert className="w-4 h-4" /> HITL History
                </button>
                <button
                    onClick={() => setSubTab('logs')}
                    className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 whitespace-nowrap ${subTab === 'logs'
                        ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                >
                    <Terminal className="w-4 h-4" /> Container Logs
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {subTab === 'history' && <JobHistorySubTab />}
                {subTab === 'agent-executions' && <AgentExecutionsSubTab />}
                {subTab === 'tool-calls' && <ToolCallLogsSubTab />}
                {subTab === 'hitl' && <HITLHistorySubTab />}
                {subTab === 'logs' && <ContainerLogsSubTab />}
            </div>
        </div>
    )
}

export default AuditTab
