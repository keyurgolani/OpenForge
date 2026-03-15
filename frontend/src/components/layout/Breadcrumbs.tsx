/**
 * Breadcrumbs - Breadcrumb navigation
 *
 * Displays a breadcrumb trail for navigation context.
 *
 * Usage:
 *   <Breadcrumbs items={[
 *     { label: 'Settings', href: '/settings' },
 *     { label: 'Models', href: '/settings/models' },
 *     { label: 'Providers' },
 *   ]} />
 */

import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  /** Display label */
  label: string;
  /** Optional href for navigation (if missing, item is not clickable) */
  href?: string;
  /** Optional icon */
  icon?: React.ReactNode;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Show home icon at start */
  showHome?: boolean;
  /** Home route */
  homeHref?: string;
  /** Additional class name */
  className?: string;
}

export function Breadcrumbs({
  items,
  showHome = false,
  homeHref = '/',
  className,
}: BreadcrumbsProps) {
  const location = useLocation();

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1 text-sm', className)}>
      {showHome && (
        <>
          <Link
            to={homeHref}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Home"
          >
            <Home className="w-4 h-4" />
          </Link>
          {items.length > 0 && (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
          )}
        </>
      )}

      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const isActive = item.href === location.pathname;

        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1">
            {item.href && !isLast ? (
              <Link
                to={item.href}
                className={cn(
                  'text-muted-foreground hover:text-foreground transition-colors',
                  isActive && 'text-foreground'
                )}
              >
                {item.icon && <span className="mr-1">{item.icon}</span>}
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(
                  isLast ? 'text-foreground font-medium' : 'text-muted-foreground'
                )}
                aria-current={isLast ? 'page' : undefined}
              >
                {item.icon && <span className="mr-1">{item.icon}</span>}
                {item.label}
              </span>
            )}
            {!isLast && (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
            )}
          </span>
        );
      })}
    </nav>
  );
}

export default Breadcrumbs;
