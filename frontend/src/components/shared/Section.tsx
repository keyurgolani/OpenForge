/**
 * Section - Section wrapper with title
 *
 * A container component for grouping related content with an optional title.
 */

import { cn } from '@/lib/utils';

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  /** Section title */
  title?: string;
  /** Section description */
  description?: string;
  /** Actions to display in the header */
  actions?: React.ReactNode;
  /** HTML element to render as */
  as?: 'section' | 'div';
}

export function Section({
  children,
  className,
  title,
  description,
  actions,
  as: Component = 'section',
}: SectionProps) {
  const hasHeader = title || description || actions;

  return (
    <Component className={cn('space-y-4', className)}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-lg font-semibold">{title}</h2>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Component>
  );
}

export default Section;
