import {
    Brain, Wrench, ShieldAlert, Network, MessageSquare, Sparkles,
    Paperclip, Bot, Clock, Activity,
} from 'lucide-react'

const CONFIGS: Record<string, { icon: React.ReactNode; className: string }> = {
    model_selection: { icon: <Bot className="h-3 w-3" />, className: 'bg-zinc-900 border-zinc-500/30 text-zinc-400' },
    thinking:        { icon: <Brain className="h-3 w-3" />, className: 'bg-zinc-900 border-zinc-500/30 text-zinc-400' },
    tool:            { icon: <Wrench className="h-3 w-3" />, className: 'bg-cyan-950 border-cyan-500/30 text-cyan-400' },
    hitl:            { icon: <ShieldAlert className="h-3 w-3" />, className: 'bg-amber-950 border-amber-500/30 text-amber-400' },
    subagent:        { icon: <Network className="h-3 w-3" />, className: 'bg-purple-950 border-purple-500/30 text-purple-400' },
    response:        { icon: <MessageSquare className="h-3 w-3" />, className: 'bg-emerald-950 border-emerald-500/30 text-emerald-400' },
    prompt:          { icon: <Sparkles className="h-3 w-3" />, className: 'bg-violet-950 border-violet-500/30 text-violet-400' },
    attachment:      { icon: <Paperclip className="h-3 w-3" />, className: 'bg-sky-950 border-sky-500/30 text-sky-400' },
    meta:            { icon: <Clock className="h-3 w-3" />, className: 'bg-zinc-900 border-zinc-600/30 text-zinc-500' },
}

const DEFAULT_CONFIG = { icon: <Activity className="h-3 w-3" />, className: 'bg-card border-border text-muted-foreground' }

export function AgentTimelineDot({ type }: { type: string }) {
    const cfg = CONFIGS[type] ?? DEFAULT_CONFIG
    return (
        <div className={`chat-timeline-dot ${cfg.className}`}>
            {cfg.icon}
        </div>
    )
}
