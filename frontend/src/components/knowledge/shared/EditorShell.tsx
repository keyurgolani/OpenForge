import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EditorShellProps {
    toolbar: ReactNode
    siderail?: ReactNode
    children: ReactNode
}

export default function EditorShell({ toolbar, siderail, children }: EditorShellProps) {
    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Toolbar */}
            <div className="flex-shrink-0 border-b border-border/40">
                {toolbar}
            </div>

            {/* Content area */}
            <div className={cn('flex-1 min-h-0 overflow-hidden', siderail ? 'flex' : '')}>
                {/* Main content — scrollable */}
                <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
                    {children}
                </div>

                {/* Optional side rail */}
                {siderail && (
                    <aside className="flex-shrink-0 w-64 border-l border-border/40 overflow-y-auto hidden lg:block">
                        {siderail}
                    </aside>
                )}
            </div>
        </div>
    )
}
