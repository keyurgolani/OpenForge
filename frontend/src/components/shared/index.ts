/**
 * Shared UI Components Barrel Export
 *
 * Reusable UI components used across multiple pages.
 *
 * Usage:
 *   import { EmptyState, LoadingState, Badge } from '@/components/shared';
 */

// Loading & Error states
export { default as EmptyState } from './EmptyState';
export { default as LoadingState } from './LoadingState';
export { default as ErrorState } from './ErrorState';
export { default as LoadingSpinner } from './LoadingSpinner';

// Skeletons
export { Skeleton, SkeletonText, SkeletonList } from './Skeleton';

// Badges & Status
export { default as StatusBadge } from './StatusBadge';
export { Badge } from './Badge';
export { TimelineBadge, type TimelineBadgeProps } from './TimelineBadge';

// Cards & Containers
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';
export { default as GlassPanel } from './GlassPanel';
export { Section } from './Section';

// Layout
export { default as PageHeader } from './PageHeader';
export { default as Siderail } from './Siderail';

// Actions
export { ConfirmModal, type ConfirmModalVariant } from './ConfirmModal';
export { CopyButton } from './CopyButton';
export { MutationButton } from './MutationButton';

// Accessibility
export { SkipLink } from './SkipLink';
export { LiveRegion, useLiveAnnounce } from './LiveRegion';

// Domain-specific
export { ProviderIcon, PROVIDER_ICONS } from './ProviderIcon';
export { ToolCallCard, InputSection } from './ToolCallCard';
export { ModelOverrideSelect } from './ModelOverrideSelect';
export { default as CodeMirrorPromptEditor } from './CodeMirrorPromptEditor';

// Misc
export { default as CommandPalette } from './CommandPalette';
export { QuickKnowledgePanel } from './QuickKnowledgePanel';
export { ToastProvider, useToast } from './ToastProvider';
export { default as ErrorBoundary } from './ErrorBoundary';
export { default as SpatialBackdrop } from './SpatialBackdrop';
