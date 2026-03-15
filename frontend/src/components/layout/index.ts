/**
 * Layout Components Barrel Export
 *
 * Shell primitives for page composition. These components define the
 * structural skeleton of the application.
 *
 * Usage:
 *   import { PageShell, PageContent, TopBar } from '@/components/layout';
 */

// Page composition
export { PageShell } from './PageShell';
export { PageContent } from './PageContent';

// Navigation
export { TopBar } from './TopBar';
export { PrimaryNavExpanded } from './PrimaryNavExpanded';
export { PrimaryNavCollapsed } from './PrimaryNavCollapsed';
export { WorkspaceSwitcher, getWorkspaceIcon, type WorkspaceInfo } from './WorkspaceSwitcher';

// Status indicators
export { ConnectionStatus } from './ConnectionStatus';

// Navigation helpers
export { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs';

// Re-export PageHeader from shared for convenience
export { default as PageHeader } from '@/components/shared/PageHeader';
