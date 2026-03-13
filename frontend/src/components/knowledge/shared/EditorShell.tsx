import { type ReactNode } from 'react'
import Siderail from '@/components/shared/Siderail'

interface EditorShellProps {
    toolbar: ReactNode
    siderail?: ReactNode | ((onCollapse: () => void) => ReactNode)
    railItemCount?: number
    children: ReactNode
}

export default function EditorShell({ toolbar, siderail, railItemCount, children }: EditorShellProps) {
    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Toolbar */}
            <div className="flex-shrink-0">
                {toolbar}
            </div>

            {/* Content area */}
            <div className="flex-1 min-h-0 overflow-hidden flex gap-2 p-2">
                {/* Main content — scrollable */}
                <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col rounded-2xl border border-border/60 bg-card/28">
                    {children}
                </div>

                {/* Right siderail */}
                {siderail && (
                    <Siderail
                        storageKey="openforge.editor.rail.pct"
                        itemCount={railItemCount}
                        breakpoint="lg"
                    >
                        {siderail}
                    </Siderail>
                )}
            </div>
        </div>
    )
}
