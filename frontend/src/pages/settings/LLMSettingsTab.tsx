import { useState } from 'react'
import {
    Server, MessageSquare, Eye, Database, Zap, ScanEye, FileText,
} from 'lucide-react'
import type { LLMSubTab } from './types'
import ProvidersTab from './llm/ProvidersTab'
import ModelTypeTab from './llm/ModelTypeTab'
import EmbeddingTab from './llm/EmbeddingTab'
import AudioTab from './llm/AudioTab'
import CLIPTab, { PDFProcessingTab } from './llm/CLIPTab'

// ── LLM Settings Tab ──────────────────────────────────────────────────────────
function LLMSettings() {
    const [subTab, setSubTab] = useState<LLMSubTab>('providers')

    const LLM_SUB_TABS: { id: LLMSubTab; label: string; Icon: React.ElementType; group: string }[] = [
        // Core
        { id: 'providers', label: 'Providers', Icon: Server, group: 'Core' },
        // Text
        { id: 'chat', label: 'Reasoning', Icon: MessageSquare, group: 'Text' },
        { id: 'embedding', label: 'Embedding', Icon: Database, group: 'Text' },
        // Image
        { id: 'vision', label: 'Vision', Icon: Eye, group: 'Image' },
        { id: 'clip', label: 'CLIP', Icon: ScanEye, group: 'Image' },
        // Audio
        { id: 'audio', label: 'Audio', Icon: Zap, group: 'Audio' },
        // Document
        { id: 'pdf', label: 'PDF', Icon: FileText, group: 'Document' },
    ]

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-4">
            <div className="flex shrink-0 gap-1.5 p-1 glass-card w-fit rounded-xl items-center">
                {LLM_SUB_TABS.map(({ id, label, Icon, group }, i) => {
                    const prevGroup = i > 0 ? LLM_SUB_TABS[i - 1].group : null
                    const showDivider = prevGroup && prevGroup !== group
                    return (
                        <span key={id} className="contents">
                            {showDivider && <div className="w-px h-5 bg-border/50 mx-0.5" />}
                            <button
                                onClick={() => setSubTab(id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${subTab === id
                                    ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {label}
                            </button>
                        </span>
                    )
                })}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
                {subTab === 'providers' && <ProvidersTab />}
                {subTab === 'chat' && <ModelTypeTab configType="chat" title="Reasoning Models" description="Models used for reasoning and chat conversations. Configure the models available and set the system default." Icon={MessageSquare} />}
                {subTab === 'vision' && <ModelTypeTab configType="vision" title="Vision Models" description="Models used for image analysis and visual content extraction. Must support multimodal input." Icon={Eye} />}
                {subTab === 'embedding' && <EmbeddingTab />}
                {subTab === 'audio' && <AudioTab />}
                {subTab === 'clip' && <CLIPTab />}
                {subTab === 'pdf' && <PDFProcessingTab />}
            </div>
        </div>
    )
}

export default LLMSettings
