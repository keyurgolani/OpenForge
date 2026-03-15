/**
 * PageShell - Standard page composition wrapper
 *
 * Combines PageHeader and PageContent with consistent layout.
 * All pages should use this for a consistent structure.
 *
 * Usage:
 *   <PageShell>
 *     <PageHeader title="..." description="..." actions={...} />
 *     <PageContent>
 *       {isLoading && <LoadingState />}
 *       {error && <ErrorState />}
 *       {data && <Content />}
 *     </PageContent>
 *   </PageShell>
 */

import { cn } from '@/lib/utils';

interface PageShellProps {
  children: React.ReactNode;
  className?: string;
  /** If true, removes the default flex-col layout for custom layouts */
  nowrap?: boolean;
}

export function PageShell({ children, className, nowrap = false }: PageShellProps) {
  return (
    <div
      className={cn(
        'flex-1 min-h-0',
        !nowrap && 'flex flex-col',
        className
      )}
    >
      {children}
    </div>
  );
}

export default PageShell;
