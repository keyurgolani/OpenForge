/**
 * SkipLink - Skip to main content link for accessibility
 *
 * A hidden link that becomes visible on focus, allowing keyboard users
 * to skip directly to the main content area.
 *
 * Usage:
 *   <SkipLink targetId="main-content" />
 *   <main id="main-content">...</main>
 */

import { cn } from '@/lib/utils';

interface SkipLinkProps {
  /** ID of the main content element to skip to */
  targetId?: string;
  /** Link text */
  text?: string;
  /** Additional class name */
  className?: string;
}

export function SkipLink({
  targetId = 'main-content',
  text = 'Skip to main content',
  className,
}: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        'sr-only focus:not-sr-only',
        'focus:absolute focus:top-4 focus:left-4 focus:z-[9999]',
        'focus:px-4 focus:py-2 focus:rounded-lg',
        'focus:bg-background focus:text-foreground',
        'focus:border focus:border-accent',
        'focus:shadow-lg',
        'transition-all',
        className
      )}
    >
      {text}
    </a>
  );
}

export default SkipLink;
