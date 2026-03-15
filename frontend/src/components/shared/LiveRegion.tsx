/**
 * LiveRegion - Screen reader announcements
 *
 * A visually hidden region that announces changes to screen readers.
 * Use this to announce dynamic content changes like loading states,
 * errors, or successful operations.
 *
 * Usage:
 *   <LiveRegion>
 *     {isLoading && 'Loading content...'}
 *     {error && `Error: ${error.message}`}
 *     {data && 'Content loaded successfully'}
 *   </LiveRegion>
 *
 * Or use the convenience hooks:
 *   const announce = useLiveAnnounce();
 *   announce('Item created successfully');
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface LiveRegionProps {
  /** Content to announce */
  children?: React.ReactNode;
  /** Politeness level */
  politeness?: 'polite' | 'assertive' | 'off';
  /** Whether to clear previous content before announcing new content */
  clearOnUpdate?: boolean;
  /** Additional class name */
  className?: string;
}

export function LiveRegion({
  children,
  politeness = 'polite',
  clearOnUpdate = true,
  className,
}: LiveRegionProps) {
  const [content, setContent] = useState<string>('');
  const prevChildrenRef = useRef<string>('');

  useEffect(() => {
    const newContent = typeof children === 'string' ? children : '';
    if (newContent !== prevChildrenRef.current) {
      if (clearOnUpdate) {
        // Clear first, then set new content to trigger announcement
        setContent('');
        const timer = setTimeout(() => setContent(newContent), 50);
        prevChildrenRef.current = newContent;
        return () => clearTimeout(timer);
      } else {
        setContent(newContent);
        prevChildrenRef.current = newContent;
      }
    }
  }, [children, clearOnUpdate]);

  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className={cn('sr-only', className)}
    >
      {content}
    </div>
  );
}

/**
 * Hook to programmatically announce messages to screen readers
 */
export function useLiveAnnounce() {
  const [message, setMessage] = useState<string>('');
  const [politeness, setPoliteness] = useState<'polite' | 'assertive'>('polite');

  const announce = (text: string, priority: 'polite' | 'assertive' = 'polite') => {
    setPoliteness(priority);
    setMessage('');
    setTimeout(() => setMessage(text), 50);
  };

  const LiveAnnouncer = () => (
    <LiveRegion politeness={politeness}>{message}</LiveRegion>
  );

  return { announce, LiveAnnouncer };
}

export default LiveRegion;
