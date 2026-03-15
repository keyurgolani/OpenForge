/**
 * PageContent - Scrollable content wrapper with consistent padding
 *
 * Use this component to wrap the main content area of a page.
 * It provides consistent padding and scroll behavior.
 */

import { cn } from '@/lib/utils';

interface PageContentProps {
  children: React.ReactNode;
  className?: string;
  /** If true, content won't scroll (useful for pages with their own scroll containers) */
  noScroll?: boolean;
}

export function PageContent({ children, className, noScroll = false }: PageContentProps) {
  return (
    <div
      className={cn(
        'flex-1 min-h-0',
        noScroll ? 'overflow-hidden' : 'overflow-y-auto',
        'p-6 lg:p-8',
        className
      )}
    >
      {children}
    </div>
  );
}

export default PageContent;
